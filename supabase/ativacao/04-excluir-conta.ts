// GERADO por npm run prepare:supabase. Nome da Edge Function: excluir-conta
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



Deno.serve(async (req: Request) => {
  if (!origemPermitida(req)) return responder(req, { erro: 'Origem não permitida.' }, 403);
  if (req.method === 'OPTIONS') return responder(req, {});
  if (req.method !== 'POST') return responder(req, { erro: 'Método não permitido.' }, 405);
  try {
    const sessao = await autenticar(req);
    if (!sessao?.user.email) return responder(req, { erro: 'Sessão inválida. Entre novamente.' }, 401);
    const corpo = await lerJson(req, 2048);
    if (Object.keys(corpo).some((k) => !['senha', 'confirmacao'].includes(k)) || corpo.confirmacao !== 'EXCLUIR'
        || typeof corpo.senha !== 'string' || !corpo.senha || corpo.senha.length > 72) {
      return responder(req, { erro: 'Informe sua senha e confirme digitando EXCLUIR.' }, 400);
    }
    const url = Deno.env.get('SUPABASE_URL'), anon = Deno.env.get('SUPABASE_ANON_KEY');
    const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !anon || !secret) return responder(req, { erro: 'A exclusão de conta ainda precisa ser configurada no serviço.' }, 503);
    // Reautentica no servidor. O cliente nunca escolhe qual usuário será apagado.
    const verifier = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await verifier.auth.signInWithPassword({ email: sessao.user.email, password: corpo.senha });
    if (error || data.user?.id !== sessao.user.id) return responder(req, { erro: 'Não foi possível confirmar sua senha. Tente novamente.' }, 403);
    const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: erroExclusao } = await admin.auth.admin.deleteUser(sessao.user.id, false);
    if (erroExclusao) return responder(req, { erro: 'Não foi possível excluir sua conta. Seus dados não tiveram a exclusão confirmada. Tente novamente.' }, 503);
    return responder(req, { excluida: true });
  } catch (error) {
    return responder(req, { erro: error instanceof ErroRequisicao ? error.message : 'Não foi possível concluir a exclusão.' }, error instanceof ErroRequisicao ? error.status : 503);
  }
});
