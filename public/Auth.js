/* AUTH.JS: login, cadastro e sessão com Supabase.
   Esconder telas é só visual; quem protege os dados de verdade é o RLS no banco. */

let erroInicializacaoAuth = '';

function chavePublicaSupabase(chave) {
    if (typeof chave !== 'string' || chave.length > 8192) return false;
    if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(chave)) return true;
    // Compatibilidade com a chave anon legada. Isto verifica o tipo da chave,
    // não sua assinatura: a autenticação efetiva continua sendo do servidor.
    try {
        const partes = chave.split('.');
        return partes.length === 3 && JSON.parse(atob(partes[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'anon';
    } catch { return false; }
}

const sb = (() => {
    try {
        const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
        if (location.protocol !== 'https:' && !(location.protocol === 'http:' && local)) {
            erroInicializacaoAuth = 'Para proteger suas credenciais, abra o site por HTTPS. HTTP é permitido somente no desenvolvimento local.';
            return null;
        }
        const config = window.APP_CONFIG;
        if (!config || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.SUPABASE_URL) || !chavePublicaSupabase(config.SUPABASE_ANON_KEY)) {
            erroInicializacaoAuth = 'Configuração de acesso inválida. O site precisa de uma chave pública do Supabase.';
            return null;
        }
        return window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
    } catch { return null; }
})();

let usuarioAtual = null;
let appIniciado = false;
let emRecuperacao = location.hash.includes("type=recovery");
let modo = "entrar";
let authOcupado = false;
let iniciandoUsuario = null;
let versaoSessao = 0;
let idSessao = null;
const URL_VOLTA = location.origin + location.pathname;
const $ = (id) => document.getElementById(id);

// Uma página congelada pode perder eventos de logout ocorridos em outra aba.
// Ao voltar pelo histórico, reconstrói a sessão antes de mostrar dados privados.
window.addEventListener('pagehide', () => {
    document.body.classList.add('auth-pendente');
    $("auth-senha").value = '';
});
window.addEventListener('pageshow', (event) => {
    if (event.persisted) location.reload();
});

const MODOS = {
    entrar: { titulo: "Entrar", botao: "Entrar", nome: false, email: true, senha: true, trocar: "Criar conta" },
    cadastrar: { titulo: "Criar conta", botao: "Cadastrar", nome: true, email: true, senha: true, trocar: "Já tenho conta" },
    recuperar: { titulo: "Recuperar senha", botao: "Enviar link", nome: false, email: true, senha: false, trocar: "Voltar" },
    "nova-senha": { titulo: "Nova senha", botao: "Salvar senha", nome: false, email: false, senha: true, trocar: "" },
};

function msg(texto, erro = true) {
    $("auth-msg").textContent = texto;
    $("auth-msg").classList.toggle("auth__msg--ok", !erro);
}

function mostrarModo(m) {
    if (authOcupado) return;
    $("auth-senha").value = "";
    modo = m;
    const c = MODOS[m];
    $("auth-titulo").textContent = c.titulo;
    $("auth-enviar").textContent = c.botao;
    $("auth-nome-label").hidden = !c.nome;
    $("auth-email-label").hidden = !c.email;
    $("auth-senha-label").hidden = !c.senha;
    $("auth-trocar").textContent = c.trocar;
    $("auth-trocar").hidden = !c.trocar;
    $("auth-esqueci").hidden = m !== "entrar";
    $("auth-senha").autocomplete = m === "entrar" ? "current-password" : "new-password";
    msg("");
}

function ativarAuth() {
    if (!sb) {
        msg(erroInicializacaoAuth || "Não foi possível iniciar a conexão. Verifique a internet e recarregue a página.");
        $("auth-enviar").disabled = true;
        $("auth-senha").disabled = true;
        return;
    }
    $("auth-trocar").addEventListener("click", (e) => {
        e.preventDefault();
        mostrarModo(modo === "entrar" ? "cadastrar" : "entrar");
    });
    $("auth-esqueci").addEventListener("click", (e) => {
        e.preventDefault();
        mostrarModo("recuperar");
    });
    $("btn-sair").addEventListener("click", async () => {
        $("btn-sair").disabled = true;
        try {
            const { error } = await sb.auth.signOut({ scope: "local" });
            if (error) throw error;
            location.reload();
        } catch {
            alert("Não foi possível encerrar a sessão. Tente novamente.");
        } finally { $("btn-sair").disabled = false; }
    });

    $("auth-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        if (authOcupado) return;
        const email = $("auth-email").value.trim();
        const senha = $("auth-senha").value;
        const nome = $("auth-nome").value.trim();
        const c = MODOS[modo];
        const sessaoAuth = versaoSessao;

        if (c.email && !/^\S+@\S+\.\S+$/.test(email)) return msg("Digite um e-mail válido.");
        if (c.senha && (modo === "entrar" ? !senha : senha.length < 12)) return msg("Confira a senha. Novas senhas precisam ter pelo menos 12 caracteres.");
        if (modo === "cadastrar" && !nome) return msg("Digite seu nome.");

        $("auth-enviar").disabled = true;
        authOcupado = true;
        try {
            if (modo === "entrar") {
                const { error } = await sb.auth.signInWithPassword({ email, password: senha });
                if (error) msg("E-mail ou senha incorretos.");
            } else if (modo === "cadastrar") {
                const { data, error } = await sb.auth.signUp({
                    email, password: senha,
                    options: { data: { nome }, emailRedirectTo: URL_VOLTA },
                });
                if (error) msg("Não foi possível cadastrar. Confira os dados ou tente novamente mais tarde.");
                else if (!data.session) msg("Enviamos um link de confirmação para o seu e-mail.", false);
            } else if (modo === "recuperar") {
                const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: URL_VOLTA });
                if (error) throw error;
                msg("Se esse e-mail existir, enviamos um link para redefinir a senha.", false);
            } else {
                const { error } = await sb.auth.updateUser({ password: senha });
                if (sessaoAuth !== versaoSessao) return;
                if (error) return msg("Não foi possível salvar a senha. Tente outra.");
                const { data } = await sb.auth.getSession();
                if (sessaoAuth !== versaoSessao || data.session?.user.id !== idSessao) return;
                emRecuperacao = false;
                history.replaceState(null, "", URL_VOLTA);
                if (data.session) await iniciarApp(data.session.user);
            }
        } catch {
            msg("Não foi possível concluir. Confira a conexão e tente novamente.");
        } finally {
            if ($("auth-senha").value === senha) $("auth-senha").value = "";
            authOcupado = false;
            $("auth-enviar").disabled = false;
        }
    });

    mostrarModo(emRecuperacao ? "nova-senha" : "entrar");

    sb.auth.onAuthStateChange((evento, sessao) => {
        if ((sessao?.user.id || null) !== idSessao) {
            const sessaoAnterior = idSessao;
            idSessao = sessao?.user.id || null;
            versaoSessao++;
            $("auth-senha").value = "";
            document.body.classList.add("auth-pendente");
            usuarioAtual = null;
            appIniciado = false;
            iniciandoUsuario = null;
            transacoesCache = [];
            versaoTransacoes++;
            cacheCotacoes.clear();
            document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
            $("transacao-form").reset();
            reiniciarCategoriasFormulario();
            limparPorquinhos();
            limparConversaIA();
            $("transacao-erro").textContent = '';
            $("transacao-form").querySelectorAll('button').forEach((button) => { button.disabled = false; });
            $("input-csv").value = '';
            $("importacao-resultado").textContent = '';
            $("importacao-resultado").className = 'import-resultado';
            $("btn-importar-csv").disabled = false;
            $("busca-topo").value = $("busca-lateral").value = '';
            $("filtro-periodo").value = 'mes';
            $("filtro-status").value = $("filtro-tipo").value = 'todos';
            $("perfil-nome").textContent = $("rodape-nome").textContent = '--';
            $("perfil-email").textContent = $("rodape-papel").textContent = '';
            $("perfil-avatar").textContent = $("rodape-avatar").textContent = '?';
            $("link-admin").hidden = true;
            $("btn-gerar-insight").disabled = false;
            $("btn-gerar-insight").removeAttribute('aria-busy');
            $("btn-gerar-insight").innerHTML = `${icone('sparkles')} Gerar insight`;
            limparPainel();
            aplicarFiltros();
            renderizarRelatorios([]);
            renderizarContatos([]);
            $("admin-corpo").replaceChildren();
            limparMercado();
            if (sessaoAnterior) { reiniciarSimulador(); navegarStudio('inicio'); }
            $("insight-texto").textContent = 'Clique em "Gerar insight" para analisar até 200 transações recentes.';
            $("insight-texto").classList.remove("insights__texto--erro");
            document.body.classList.add("auth-pendente");
        }
        if (evento === "PASSWORD_RECOVERY") {
            emRecuperacao = true;
            document.body.classList.add("auth-pendente");
        }
        if (!sessao) {
            versaoSessao++;
            document.body.classList.add("auth-pendente");
            usuarioAtual = null;
            transacoesCache = [];
        }
        if (emRecuperacao) return mostrarModo("nova-senha");
        const revisao = versaoSessao;
        // setTimeout: não chamar o Supabase direto dentro deste callback
        setTimeout(() => {
            if (revisao !== versaoSessao) return;
            if (sessao) iniciarApp(sessao.user).catch(() => msg("Não foi possível carregar seu perfil. Recarregue para tentar novamente."));
            else if (appIniciado) location.reload();
        }, 0);
    });
}

async function iniciarApp(user) {
    if (appIniciado && usuarioAtual?.id === user.id) {
        document.body.classList.remove("auth-pendente");
        return;
    }
    if (iniciandoUsuario?.id === user.id && iniciandoUsuario.versao === versaoSessao) return;
    const inicializacao = { id: user.id, versao: versaoSessao };
    iniciandoUsuario = inicializacao;
    const versao = versaoSessao;
    try {

    const { data: perfil, error } = await sb.from("perfis").select("nome,email,papel").eq("id", user.id).single();
    if (versao !== versaoSessao) return;
    if (error || !perfil) {
        msg("Não foi possível carregar seu perfil.");
        return;
    }
    if (versao !== versaoSessao) return;

    appIniciado = true;
    $("auth-form").reset();
    usuarioAtual = { id: user.id, ...perfil };
    const nome = perfil.nome || perfil.email || "Usuário";

    $("perfil-nome").textContent = nome;
    $("rodape-nome").textContent = nome;
    $("perfil-email").textContent = perfil.email || "";
    $("rodape-papel").textContent = perfil.papel === "admin" ? "Administrador" : "Cliente";
    $("perfil-avatar").textContent = $("rodape-avatar").textContent = nome[0].toUpperCase();
    $("link-admin").hidden = perfil.papel !== "admin";

    document.body.classList.remove("auth-pendente");
    carregarCotacao();
    carregarTransacoes();
    if ($('view-porquinho').classList.contains('view--active')) carregarCofrinhos();
    } finally { if (iniciandoUsuario === inicializacao) iniciandoUsuario = null; }
}

async function carregarAdmin() {
    const corpo = $("admin-corpo");
    if (usuarioAtual?.papel !== "admin") return;
    const sessaoAdmin = versaoSessao;
    try {
    const { data, error } = await sb.rpc("resumo_usuarios");
    if (sessaoAdmin !== versaoSessao) return;
    if (error) {
        corpo.innerHTML = '<tr><td colspan="5">Sem permissão ou erro ao carregar.</td></tr>';
        return;
    }
    corpo.innerHTML = (data || [])
        .map((u) => `<tr>
            <td>${escaparHtml(u.nome)}</td>
            <td>${escaparHtml(u.email)}</td>
            <td><span class="badge ${u.papel === "admin" ? "badge--purple" : "badge--blue"}">${escaparHtml(u.papel)}</span></td>
            <td>${Number(u.qtd)}</td>
            <td>${formatarMoeda(u.total)}</td></tr>`)
        .join("");
    } catch {
        if (sessaoAdmin !== versaoSessao) return;
        corpo.textContent = "Não foi possível carregar os usuários.";
    }
}
