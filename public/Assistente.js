/* Conversa somente em memória; sessão antiga não altera a conversa da conta seguinte. */
let conversaIA = { mensagens: [], ocupada: false };

function renderizarConversaIA(mensagemPendente = '') {
    const container = $('ia-mensagens'); container.replaceChildren();
    const mensagens = conversaIA.mensagens.length ? [...conversaIA.mensagens] : [{ role: 'assistant', content: 'Olá! Posso ajudar você a organizar o orçamento e planejar suas metas. O que você quer conversar hoje?' }];
    if (mensagemPendente) mensagens.push({ role: 'user', content: mensagemPendente });
    for (const mensagem of mensagens) {
        const item = document.createElement('article'); item.className = `chat-message chat-message--${mensagem.role}`;
        const label = document.createElement('strong'); label.textContent = mensagem.role === 'user' ? 'Você' : 'FinTheka IA';
        const texto = document.createElement('p'); texto.textContent = mensagem.content;
        item.append(label, texto); container.append(item);
    }
    container.scrollTop = container.scrollHeight;
}

function limparConversaIA() {
    conversaIA = { mensagens: [], ocupada: false };
    $('ia-pergunta').value = ''; $('ia-status').textContent = '';
    $('ia-enviar').disabled = $('ia-limpar').disabled = false;
    $('ia-form').removeAttribute('aria-busy');
    renderizarConversaIA();
}

async function enviarMensagemIA(event) {
    event.preventDefault();
    if (!usuarioAtual || conversaIA.ocupada) return;
    const texto = $('ia-pergunta').value.trim();
    if (!texto || texto.length > 400) return;
    const estado = conversaIA, sessao = versaoSessao;
    const mensagens = [...estado.mensagens.slice(-4).map((m) => ({ role: m.role, content: m.content.slice(0, 400) })), { role: 'user', content: texto }];
    estado.ocupada = true; $('ia-enviar').disabled = $('ia-limpar').disabled = true;
    $('ia-form').setAttribute('aria-busy', 'true'); $('ia-status').textContent = 'Pensando na sua pergunta...';
    $('ia-pergunta').value = ''; renderizarConversaIA(texto);
    try {
        const { data, error } = await sb.functions.invoke(window.APP_CONFIG?.INSIGHTS_FUNCTION || 'insights', { body: { mensagens } });
        if (estado !== conversaIA || sessao !== versaoSessao) return;
        if (error) throw new Error(await mensagemFuncao(error, 'Não foi possível conversar com a IA agora.'));
        if (typeof data?.resposta !== 'string' || !data.resposta.trim()) throw new Error('O assistente precisa da versão atual do serviço para conversar.');
        estado.mensagens.push({ role: 'user', content: texto }, { role: 'assistant', content: data.resposta.slice(0, 1500) });
        renderizarConversaIA(); $('ia-status').textContent = '';
    } catch (erro) {
        if (estado !== conversaIA || sessao !== versaoSessao) return;
        renderizarConversaIA();
        if (!$('ia-pergunta').value) $('ia-pergunta').value = texto;
        $('ia-status').textContent = erro.message || 'Serviço indisponível. Tente mais tarde.';
    } finally {
        if (estado === conversaIA && sessao === versaoSessao) {
            estado.ocupada = false; $('ia-enviar').disabled = $('ia-limpar').disabled = false;
            $('ia-form').removeAttribute('aria-busy');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    limparConversaIA();
    $('ia-form').addEventListener('submit', enviarMensagemIA);
    $('ia-limpar').addEventListener('click', limparConversaIA);
    $('ia-pergunta').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('ia-form').requestSubmit(); } });
    document.querySelectorAll('[data-ia-pergunta]').forEach((button) => button.addEventListener('click', () => {
        $('ia-pergunta').value = button.dataset.iaPergunta; $('ia-pergunta').focus();
    }));
});
