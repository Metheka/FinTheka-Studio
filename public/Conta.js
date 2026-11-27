const VERSAO_TERMOS = '2026-11-27';
let excluindoConta = false;

document.addEventListener('DOMContentLoaded', () => {
    const dialog = $('conta-dialog'), form = $('conta-form');
    let focoRetorno = $('btn-minha-conta');
    $('btn-minha-conta').addEventListener('click', () => {
        if (!usuarioAtual || excluindoConta) return;
        form.reset(); $('conta-erro').textContent = '';
        $('conta-email').textContent = usuarioAtual.email;
        focoRetorno = document.body.classList.contains('menu-aberto') ? $('btn-menu') : $('btn-minha-conta');
        document.body.classList.remove('menu-aberto');
        $('btn-menu').setAttribute('aria-expanded', 'false');
        $('menu-fundo').hidden = true;
        dialog.showModal();
    });
    $('conta-cancelar').addEventListener('click', () => { if (!excluindoConta) dialog.close(); });
    dialog.addEventListener('cancel', (event) => { if (excluindoConta) event.preventDefault(); });
    dialog.addEventListener('close', () => { form.reset(); focoRetorno.focus(); });
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!usuarioAtual || excluindoConta) return;
        const senha = $('conta-senha').value, confirmacao = $('conta-confirmacao').value;
        if (!senha || confirmacao !== 'EXCLUIR') {
            $('conta-erro').textContent = 'Informe sua senha e digite EXCLUIR para confirmar.';
            return;
        }
        const sessao = versaoSessao;
        excluindoConta = true;
        form.setAttribute('aria-busy', 'true');
        form.querySelectorAll('input, button').forEach((el) => { el.disabled = true; });
        $('conta-erro').textContent = '';
        try {
            const { data, error } = await sb.functions.invoke('excluir-conta', { body: { senha, confirmacao } });
            if (sessao !== versaoSessao) return;
            if (error) throw new Error(await mensagemFuncao(error, 'Não foi possível excluir sua conta. Confira sua senha e tente novamente.'));
            if (data?.excluida !== true) throw new Error('O serviço não confirmou a exclusão. Confira sua conta antes de tentar novamente.');
            // A conta só é escondida definitivamente depois da confirmação do servidor.
            document.body.classList.add('auth-pendente');
            await sb.auth.signOut({ scope: 'local' });
            location.replace(location.pathname + '?conta=excluida');
        } catch (error) {
            if (sessao === versaoSessao) $('conta-erro').textContent = error.message;
        } finally {
            $('conta-senha').value = '';
            excluindoConta = false;
            form.removeAttribute('aria-busy');
            form.querySelectorAll('input, button').forEach((el) => { el.disabled = false; });
        }
    });
    if (new URLSearchParams(location.search).get('conta') === 'excluida') {
        setTimeout(() => msg('Sua conta foi excluída. Os registros vinculados foram removidos do banco ativo.', false), 0);
        history.replaceState(null, '', location.pathname);
    }
});
