import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import { consultarIA, consultarConversa, validarConversa, resumirTransacoes, FalhaIA } from "../_shared/insights.mjs";
import { autenticar, headers, responder, origemPermitida, lerJson, ErroRequisicao } from "../_shared/http.ts";

Deno.serve(async (req) => {
  if (!origemPermitida(req)) return responder(req, { erro: "Origem não permitida." }, 403);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(req) });
  const resp = (body: unknown, status = 200) => responder(req, body, status);
  if (req.method !== "POST") return resp({ erro: "Método não permitido." }, 405);
  try {
    const auth = await autenticar(req);
    if (!auth) return resp({ erro: "Não autenticado." }, 401);
    const corpo = await lerJson(req, 8192);
    const mensagens = corpo.mensagens === undefined ? null : validarConversa(corpo.mensagens);
    const chave = Deno.env.get("GROQ_API_KEY");
    if (!chave) return resp({ erro: "Serviço de IA ainda não configurado." }, 503);
    const { data: tr, error } = await auth.client.from("transacoes")
      .select("valor,pago").order("data", { ascending: false }).order("id", { ascending: false }).limit(200);
    if (error) return resp({ erro: "Não foi possível consultar suas transações." }, 503);
    if (!tr?.length && !mensagens) return resp({ insight: "Cadastre algumas transações para receber um insight." });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // Reserva global e individual atômica. Falha no banco bloqueia o provedor.
    const { data: permitido, error: quotaError } = await admin.rpc("reservar_insight_seguro", { p_usuario: auth.user.id });
    if (quotaError?.code === '42501') return resp({ erro: "Sua conta ainda precisa de autorização para usar a IA." }, 403);
    if (quotaError) return resp({ erro: "Controle de uso indisponível. Tente mais tarde." }, 503);
    if (permitido !== true) return resp({ erro: "Limite de uso atingido: até 3 análises por conta em 24 horas, intervalo de 30 segundos e cota geral do site. Tente mais tarde." }, 429);

    if (mensagens) return resp({ resposta: await consultarConversa(chave, resumirTransacoes(tr || []), mensagens) });
    const insight = await consultarIA(chave, resumirTransacoes(tr || []));
    return resp({ insight });
  } catch (error) {
    if (error instanceof ErroRequisicao) return resp({ erro: error.message }, error.status);
    if (error instanceof FalhaIA) return resp({ erro: error.message }, error.status);
    console.error("Falha no serviço de insights", error instanceof Error ? error.name : "erro");
    return resp({ erro: "Falha temporária ao gerar insight." }, 502);
  }
});
