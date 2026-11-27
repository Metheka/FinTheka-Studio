import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import { origemPermitida, responder, autenticar, lerJson, ErroRequisicao } from "../_shared/http.ts";

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
