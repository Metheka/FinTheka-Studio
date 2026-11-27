// GERADO por npm run prepare:supabase. Nome da Edge Function: cotacoes
// Cole tudo no index.ts do editor de Edge Functions, não no SQL Editor.
import { createClient } from "npm:@supabase/supabase-js@2.119.0";

function origensConfiguradas() {
  return (Deno.env.get("ALLOWED_ORIGIN") || "").split(",").map((s) => s.trim()).filter(Boolean);
}

export function origemPermitida(req: Request) {
  const origin = req.headers.get("Origin");
  // Clientes sem Origin ainda precisam de sessão válida. CORS não substitui autenticação.
  return !origin || origensConfiguradas().includes(origin);
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  return {
    ...(origin && origensConfiguradas().includes(origin) ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "X-FinTheka-Security-Version": "2026-11-25.1",
  };
}
export const responder = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders(req) });

export class ErroRequisicao extends Error {
  status: number;
  constructor(status: number, mensagem: string) { super(mensagem); this.status = status; }
}

export async function lerJson(req: Request, limite = 1024, prazoMs = 5000): Promise<Record<string, unknown>> {
  const tamanho = req.headers.get('Content-Length');
  if (tamanho && Number(tamanho) > limite) throw new ErroRequisicao(413, 'Requisição muito grande.');
  if (!req.body) return {};
  const reader = req.body.getReader();
  const partes: Uint8Array[] = [];
  let bytes = 0;
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  // Prazo total: enviar poucos bytes por vez não prolonga a ocupação da função.
  const expiracao = new Promise<never>((_, reject) => {
    temporizador = setTimeout(() => {
      reject(new ErroRequisicao(408, 'Tempo de envio excedido.'));
      void reader.cancel().catch(() => {});
    }, prazoMs);
  });
  try {
    while (true) {
      const { value, done } = await Promise.race([reader.read(), expiracao]);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limite) {
        void reader.cancel().catch(() => {});
        throw new ErroRequisicao(413, 'Requisição muito grande.');
      }
      partes.push(value);
    }
  } finally { clearTimeout(temporizador); reader.releaseLock(); }
  const conteudo = new Uint8Array(bytes);
  let posicao = 0;
  for (const parte of partes) { conteudo.set(parte, posicao); posicao += parte.byteLength; }
  try {
    const texto = new TextDecoder('utf-8', { fatal: true }).decode(conteudo);
    const corpo = texto ? JSON.parse(texto) : {};
    if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) throw new Error('objeto esperado');
    return corpo;
  } catch { throw new ErroRequisicao(400, 'JSON inválido.'); }
}

export async function autenticar(req: Request) {
  const authorization = req.headers.get("Authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) return null;
  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(authorization.replace(/^Bearer\s+/i, ""));
  return error || !data.user ? null : { client, user: data.user };
}



const NOMES: Record<string, string> = {
  USD: "Dólar americano", EUR: "Euro", GBP: "Libra esterlina", JPY: "Iene japonês",
  CHF: "Franco suíço", CAD: "Dólar canadense", AUD: "Dólar australiano", CNY: "Yuan chinês",
  ARS: "Peso argentino", MXN: "Peso mexicano", CLP: "Peso chileno", COP: "Peso colombiano",
  PEN: "Sol peruano", UYU: "Peso uruguaio", BOB: "Boliviano",
  NOK: "Coroa norueguesa", SEK: "Coroa sueca", DKK: "Coroa dinamarquesa",
  NZD: "Dólar neozelandês", ZAR: "Rand sul-africano",
};

// A chave grátis da AwesomeAPI fica guardada como segredo no Supabase (nunca no site).
const CHAVE = Deno.env.get("AWESOMEAPI_KEY");
const headers: Record<string, string> = CHAVE ? { "x-api-key": CHAVE } : {};

// Cache simples em memória: evita bater na API a cada clique (e o erro 429).
const cache = new Map<string, { ate: number; dados: unknown }>();
const pendentes = new Map<string, Promise<unknown>>();
let pausaAte = 0;
async function comCache(chave: string, ttlSeg: number, buscar: () => Promise<unknown>) {
  const hit = cache.get(chave);
  if (hit && hit.ate > Date.now()) return hit.dados;
  if (pausaAte > Date.now()) throw new Error("AwesomeAPI 429");
  const existente = pendentes.get(chave);
  if (existente) return existente;
  const tarefa = buscar().then((dados) => {
    cache.set(chave, { ate: Date.now() + ttlSeg * 1000, dados });
    return dados;
  });
  pendentes.set(chave, tarefa);
  try { return await tarefa; } finally { pendentes.delete(chave); }
}

async function buscarJson(url: string) {
  const r = await fetch(url, { headers, redirect: "error", signal: AbortSignal.timeout(12000) });
  if (r.status === 429) pausaAte = Date.now() + 60000;
  if (!r.ok) throw new Error(`AwesomeAPI ${r.status}`);
  return await r.json();
}

// Velas diárias: fechamento, máxima e mínima vêm da API; a abertura é o fechamento do dia anterior.
async function historico(req: Request, par: string, dias: number) {
  if (!Object.hasOwn(NOMES, par)) return responder(req, { erro: "Moeda inválida." }, 400);
  const n = dias || 90;
  if (![30, 90, 180].includes(n)) return responder(req, { erro: "Período inválido. Use 30, 90 ou 180 dias." }, 400);
  const velas = await comCache(`h:${par}:${n}`, 600, async () => {
    const lista = await buscarJson(`https://economia.awesomeapi.com.br/json/daily/${par}-BRL/${n}`);
    const porDia = new Map<string, { time: string; high: number; low: number; close: number }>();
    for (const d of lista) {
      const dia = new Date(Number(d.timestamp) * 1000).toISOString().slice(0, 10);
      if (![Number(d.high), Number(d.low), Number(d.bid)].every((v) => Number.isFinite(v) && v > 0)) continue;
      if (!porDia.has(dia)) porDia.set(dia, { time: dia, high: Number(d.high), low: Number(d.low), close: Number(d.bid) });
    }
    const dias_ = [...porDia.values()].sort((a, b) => a.time.localeCompare(b.time));
    return dias_.map((d, i) => {
      const open = i ? dias_[i - 1].close : d.close;
      return { time: d.time, open, high: Math.max(d.high, open, d.close), low: Math.min(d.low, open, d.close), close: d.close };
    });
  });
  return responder(req, { historico: velas });
}

Deno.serve(async (req) => {
  if (!origemPermitida(req)) return responder(req, { erro: "Origem não permitida." }, 403);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  const resp = (body: unknown, status = 200) => responder(req, body, status);
  if (!["GET", "POST"].includes(req.method)) return resp({ erro: "Método não permitido." }, 405);
  try {
    const auth = await autenticar(req);
    if (!auth) return resp({ erro: "Não autenticado." }, 401);
    const corpo = req.method === "POST" ? await lerJson(req) : {};
    if (corpo.par !== undefined && (typeof corpo.par !== 'string' || !Object.hasOwn(NOMES, corpo.par))) return resp({ erro: "Moeda inválida." }, 400);
    if (corpo.dias !== undefined && (typeof corpo.dias !== 'number' || ![30, 90, 180].includes(corpo.dias))) return resp({ erro: "Período inválido. Use 30, 90 ou 180 dias." }, 400);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: permitido, error: quotaError } = await admin.rpc("reservar_cotacao_segura", { p_usuario: auth.user.id });
    if (quotaError?.code === '42501') return resp({ erro: "Sua conta ainda precisa de autorização para consultar cotações." }, 403);
    if (quotaError) return resp({ erro: "Controle de uso indisponível. Tente mais tarde." }, 503);
    if (permitido !== true) return resp({ erro: "Limite de consultas atingido. Aguarde um minuto e tente novamente." }, 429);
    if (corpo.par) {
      const dias = corpo.dias === undefined ? 90 : Number(corpo.dias);
      if (![30, 90, 180].includes(dias)) return resp({ erro: "Período inválido. Use 30, 90 ou 180 dias." }, 400);
      return await historico(req, String(corpo.par), dias);
    }

    const ultimas = await comCache("ultimas", 60, async () => {
      const pares = Object.keys(NOMES).map((c) => `${c}-BRL`).join(",");
      const dados = await buscarJson(`https://economia.awesomeapi.com.br/json/last/${pares}`);
      const moedas = Object.keys(NOMES)
        .filter((c) => Number.isFinite(Number(dados[`${c}BRL`]?.bid)) && Number(dados[`${c}BRL`]?.bid) > 0)
        .map((c) => ({ codigo: c, nome: NOMES[c], valor: Number(dados[`${c}BRL`].bid), variacao: Number(dados[`${c}BRL`].pctChange) }));
      const usd = Number(dados.USDBRL?.bid), eur = Number(dados.EURBRL?.bid);
      if (![usd, eur].every((v) => Number.isFinite(v) && v > 0)) throw new Error("Cotações inválidas do provedor");
      return { usd, eur, moedas, atualizadoEm: new Date().toISOString() };
    });
    return resp(ultimas);
  } catch (e) {
    if (e instanceof ErroRequisicao) return resp({ erro: e.message }, e.status);
    console.error("Falha no serviço de cotações", e instanceof Error ? e.name : "erro");
    const limite = String(e).includes("429");
    return resp(
      { erro: limite ? "Muitas consultas ao serviço de cotações. Tente em instantes." : "Não foi possível buscar as cotações agora." },
      limite ? 503 : 502,
    );
  }
});
