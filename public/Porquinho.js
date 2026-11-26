/* Metas e registros manuais; o banco controla propriedade, saldo e repetição de pedidos. */
let porquinhos = { lista: [], disponivel: false, consulta: 0, ocupado: false, movimento: null };
const CORES_PORQUINHO = new Set(['rosa', 'verde', 'violeta', 'ambar']);

function progressoPorquinho(saldo, meta) {
    const guardado = Math.round(Number(saldo) * 100), alvo = Math.round(Number(meta) * 100);
    if (!Number.isSafeInteger(guardado) || !Number.isSafeInteger(alvo) || guardado < 0 || alvo <= 0) throw new Error('Meta inválida');
    return { percentual: Math.min(100, guardado / alvo * 100), falta: Math.max(0, alvo - guardado) / 100, atingida: guardado >= alvo };
}

function limparPorquinhos() {
    porquinhos = { lista: [], disponivel: false, consulta: 0, ocupado: false, movimento: null };
    $('cofrinhos-lista').replaceChildren();
    $('cofrinhos-total').textContent = '--';
    $('cofrinhos-resumo').textContent = 'Suas metas, no seu ritmo.';
    $('cofrinhos-status').textContent = 'Carregando seus porquinhos...';
    $('cofrinho-novo').disabled = true;
    $('cofrinho-form').reset(); $('cofrinho-movimento-form').reset();
    $('cofrinho-form').elements.id.value = '';
    $('cofrinho-movimento-titulo').textContent = 'Registrar valor';
    $('cofrinho-movimento-saldo').textContent = '';
    $('cofrinho-erro').textContent = $('cofrinho-movimento-erro').textContent = '';
    $('cofrinho-historico').replaceChildren();
    document.querySelectorAll('#cofrinho-form button, #cofrinho-movimento-form button').forEach((b) => { b.disabled = false; });
}

async function carregarCofrinhos() {
    const dono = usuarioAtual?.id;
    if (!dono) return;
    const estado = porquinhos, sessao = versaoSessao, consulta = ++estado.consulta;
    $('cofrinhos-status').textContent = 'Carregando seus porquinhos...';
    try {
        const lista = [];
        for (let inicio = 0; ; inicio += 500) {
            const { data, error } = await sb.from('cofrinhos').select('id,nome,meta,saldo,prazo,cor').eq('usuario_id', dono).order('id', { ascending: false }).range(inicio, inicio + 499);
            if (estado !== porquinhos || sessao !== versaoSessao || consulta !== estado.consulta) return;
            if (error) throw error;
            if (lista.length + data.length > 100) throw new Error('LIMITES_COFRINHOS');
            lista.push(...data);
            if (data.length < 500) break;
        }
        estado.lista = lista; estado.disponivel = true;
        $('cofrinho-novo').disabled = false;
        $('cofrinhos-status').textContent = lista.length ? '' : 'Seu primeiro plano merece um porquinho. Clique em Criar porquinho para começar.';
        renderizarPorquinhos();
    } catch (erro) {
        if (estado !== porquinhos || sessao !== versaoSessao || consulta !== estado.consulta) return;
        estado.disponivel = false; $('cofrinho-novo').disabled = true;
        $('cofrinhos-status').textContent = erro?.message === 'LIMITES_COFRINHOS' ? 'Sua conta ultrapassa o limite de 100 porquinhos. Procure o suporte para organizar suas metas.' : ['42P01','PGRST205'].includes(erro?.code) ? 'O Porquinho ainda precisa ser ativado no serviço. Suas metas estarão disponíveis após a configuração.' : 'Não foi possível carregar seus porquinhos. Tente Atualizar novamente.';
    }
}

function renderizarPorquinhos() {
    const lista = porquinhos.lista;
    $('cofrinhos-total').textContent = formatarMoeda(lista.reduce((s, c) => s + Math.round(Number(c.saldo) * 100), 0) / 100);
    const atingidas = lista.filter((c) => Number(c.saldo) >= Number(c.meta)).length;
    $('cofrinhos-resumo').textContent = `${lista.length} ${lista.length === 1 ? 'porquinho' : 'porquinhos'} · ${atingidas} ${atingidas === 1 ? 'meta alcançada' : 'metas alcançadas'}`;
    $('cofrinhos-lista').innerHTML = lista.map((c) => {
        const p = progressoPorquinho(c.saldo, c.meta), cor = CORES_PORQUINHO.has(c.cor) ? c.cor : 'rosa';
        return `<article class="piggy-card panel" data-cofrinho="${escaparHtml(c.id)}" data-cor="${cor}"><div class="piggy-card__heading"><span class="piggy-mark">${icone('piggy')}</span><span class="badge">${p.atingida ? 'Meta alcançada' : 'Em construção'}</span></div><h3>${escaparHtml(c.nome)}</h3><p class="piggy-card__amount">${formatarMoeda(Number(c.saldo))}</p><p class="muted">de ${formatarMoeda(Number(c.meta))}</p><progress max="100" value="${p.percentual}" aria-label="Progresso de ${escaparHtml(c.nome)}"></progress><p class="piggy-card__note">${p.atingida ? 'Você chegou à sua meta!' : `Faltam ${formatarMoeda(p.falta)}`}${c.prazo ? ` · Até ${formatarData(c.prazo)}` : ''}</p><div class="piggy-card__actions"><button type="button" class="btn btn--primary btn--small" data-piggy-action="guardar">Guardar</button><button type="button" class="btn btn--outline btn--small" data-piggy-action="retirar">Retirar / histórico</button></div><div class="piggy-card__links"><button type="button" class="link-button" data-piggy-action="editar">Editar meta</button><button type="button" class="link-button" data-piggy-action="excluir">Excluir</button></div></article>`;
    }).join('');
}

function abrirMetaPorquinho(cofrinho = null) {
    if (!usuarioAtual || !porquinhos.disponivel || porquinhos.ocupado) return;
    const form = $('cofrinho-form'); form.reset();
    form.elements.id.value = cofrinho?.id || '';
    if (cofrinho) {
        form.elements.nome.value = cofrinho.nome;
        form.elements.meta.value = Number(cofrinho.meta).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
        form.elements.prazo.value = cofrinho.prazo || '';
        form.elements.cor.value = cofrinho.cor;
    }
    $('cofrinho-titulo').textContent = cofrinho ? 'Editar porquinho' : 'Criar porquinho';
    $('cofrinho-erro').textContent = '';
    $('cofrinho-dialog').showModal();
}

async function abrirMovimentoPorquinho(cofrinho, tipo) {
    if (!usuarioAtual || porquinhos.ocupado) return;
    const estado = porquinhos, sessao = versaoSessao;
    const movimento = { id: cofrinho.id, saldo: Number(cofrinho.saldo), pedido: null, assinatura: null };
    estado.movimento = movimento;
    const form = $('cofrinho-movimento-form'); form.reset(); form.elements.mov_tipo.value = tipo;
    $('cofrinho-movimento-titulo').textContent = cofrinho.nome;
    $('cofrinho-movimento-saldo').textContent = `Registrado neste porquinho: ${formatarMoeda(movimento.saldo)}`;
    $('cofrinho-movimento-erro').textContent = '';
    $('cofrinho-historico').textContent = 'Carregando registros...';
    $('cofrinho-movimento-dialog').showModal();
    try {
        const { data, error } = await sb.from('movimentos_cofrinho').select('tipo,valor,criado_em').eq('usuario_id', usuarioAtual.id).eq('cofrinho_id', cofrinho.id).order('criado_em', { ascending: false }).order('id', { ascending: false }).limit(10);
        if (estado !== porquinhos || sessao !== versaoSessao || estado.movimento !== movimento) return;
        if (error) throw error;
        $('cofrinho-historico').innerHTML = data.length ? data.map((m) => `<p><span>${m.tipo === 'guardar' ? 'Guardado' : 'Retirado'} · ${escaparHtml(new Date(m.criado_em).toLocaleDateString('pt-BR'))}</span><strong class="${m.tipo === 'guardar' ? 'text-green' : 'text-red'}">${formatarMoeda(Number(m.valor))}</strong></p>`).join('') : '<p>Nenhum registro ainda.</p>';
    } catch { if (estado === porquinhos && sessao === versaoSessao && estado.movimento === movimento) $('cofrinho-historico').textContent = 'Não foi possível carregar o histórico.'; }
}

document.addEventListener('DOMContentLoaded', () => {
    $('cofrinho-novo').addEventListener('click', () => abrirMetaPorquinho());
    $('cofrinhos-recarregar').addEventListener('click', carregarCofrinhos);
    for (const [botao, dialog] of [['cofrinho-cancelar','cofrinho-dialog'],['cofrinho-movimento-cancelar','cofrinho-movimento-dialog']]) {
        $(botao).addEventListener('click', () => { if (!porquinhos.ocupado) $(dialog).close(); });
        $(dialog).addEventListener('cancel', (e) => { if (porquinhos.ocupado) e.preventDefault(); });
    }
    $('cofrinhos-lista').addEventListener('click', async (event) => {
        const button = event.target.closest('[data-piggy-action]');
        if (!button || porquinhos.ocupado || !usuarioAtual) return;
        const c = porquinhos.lista.find((item) => String(item.id) === button.closest('[data-cofrinho]').dataset.cofrinho);
        if (!c) return;
        const acao = button.dataset.piggyAction;
        if (acao === 'editar') return abrirMetaPorquinho(c);
        if (acao === 'guardar' || acao === 'retirar') return abrirMovimentoPorquinho(c, acao);
        if (Number(c.saldo) !== 0) return notificar('Registre a retirada do saldo antes de excluir este porquinho.', true);
        if (!confirm('Excluir este porquinho e seu histórico de registros?')) return;
        const estado = porquinhos, sessao = versaoSessao, dono = usuarioAtual.id;
        estado.ocupado = true; button.disabled = true;
        try {
            const { error } = await sb.from('cofrinhos').delete().eq('id', c.id).eq('usuario_id', dono).select('id').single();
            if (estado !== porquinhos || sessao !== versaoSessao) return;
            if (error) throw error;
            await carregarCofrinhos();
        } catch { if (estado === porquinhos && sessao === versaoSessao) notificar('Não foi possível excluir. Atualize e confira o saldo.', true); }
        finally { if (estado === porquinhos && sessao === versaoSessao) { estado.ocupado = false; button.disabled = false; } }
    });
    $('cofrinho-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!usuarioAtual || porquinhos.ocupado) return;
        const form = event.currentTarget, campos = Object.fromEntries(new FormData(form));
        const meta = converterValor(campos.meta), nome = campos.nome.trim();
        if (!nome || nome.length > 80 || !Number.isFinite(meta) || meta <= 0 || meta >= 1e11 || (campos.prazo && !normalizarData(campos.prazo))) return void ($('cofrinho-erro').textContent = 'Confira o nome, a data e uma meta positiva com até duas casas decimais.');
        const estado = porquinhos, sessao = versaoSessao, dono = usuarioAtual.id;
        const payload = { nome, meta, prazo: campos.prazo || null, cor: campos.cor };
        estado.ocupado = true; form.querySelectorAll('button').forEach((b) => { b.disabled = true; });
        try {
            const query = campos.id ? sb.from('cofrinhos').update(payload).eq('id', campos.id).eq('usuario_id', dono) : sb.from('cofrinhos').insert({ ...payload, usuario_id: dono });
            const { error } = await query.select('id').single();
            if (estado !== porquinhos || sessao !== versaoSessao) return;
            if (error) throw error;
            $('cofrinho-dialog').close(); await carregarCofrinhos();
        } catch (erro) { if (estado === porquinhos && sessao === versaoSessao) $('cofrinho-erro').textContent = mensagemGravacao(erro, 'Não foi possível confirmar. Confira sua lista antes de tentar novamente.'); }
        finally { if (estado === porquinhos && sessao === versaoSessao) { estado.ocupado = false; form.querySelectorAll('button').forEach((b) => { b.disabled = false; }); } }
    });
    $('cofrinho-movimento-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!usuarioAtual || porquinhos.ocupado || !porquinhos.movimento) return;
        const form = event.currentTarget, tipo = form.elements.mov_tipo.value, valor = converterValor(form.elements.mov_valor.value);
        const estado = porquinhos, sessao = versaoSessao, movimento = estado.movimento;
        if (!Number.isFinite(valor) || valor <= 0 || valor >= 1e11) return void ($('cofrinho-movimento-erro').textContent = 'Digite um valor positivo com até duas casas decimais.');
        if (tipo === 'retirar' && valor > movimento.saldo) return void ($('cofrinho-movimento-erro').textContent = 'O valor supera o saldo registrado neste porquinho.');
        const assinatura = `${tipo}:${valor}`;
        if (assinatura !== movimento.assinatura) { movimento.pedido = crypto.randomUUID(); movimento.assinatura = assinatura; }
        estado.ocupado = true; form.querySelectorAll('button').forEach((b) => { b.disabled = true; });
        try {
            const { error } = await sb.rpc('movimentar_cofrinho', { p_cofrinho: movimento.id, p_tipo: tipo, p_valor: valor, p_requisicao: movimento.pedido });
            if (estado !== porquinhos || sessao !== versaoSessao || estado.movimento !== movimento) return;
            if (error) throw error;
            $('cofrinho-movimento-dialog').close(); await carregarCofrinhos();
        } catch (erro) { if (estado === porquinhos && sessao === versaoSessao) $('cofrinho-movimento-erro').textContent = mensagemGravacao(erro, 'Não foi possível confirmar. Confira o histórico antes de mudar o valor ou fazer outro pedido. Reenviar os mesmos dados neste formulário não duplica o registro.'); }
        finally { if (estado === porquinhos && sessao === versaoSessao) { estado.ocupado = false; form.querySelectorAll('button').forEach((b) => { b.disabled = false; }); } }
    });
});
