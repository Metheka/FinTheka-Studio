/* Visão geral: somente dados da conta atual. Valores agregados em centavos. */
let periodoPainel = 30;
let painelPronto = false;
let toastTimer;

function icone(nome, classe = '') {
    return `<svg class="icon ${classe}" aria-hidden="true"><use href="icons.svg#${nome}"></use></svg>`;
}

function fecharMenuLateral() {
    document.body.classList.remove('menu-aberto');
    $('btn-menu').setAttribute('aria-expanded', 'false');
    $('menu-fundo').hidden = true;
}

function navegarStudio(view, foco) {
    const link = document.querySelector(`.sidebar__link[data-view="${view}"]`);
    if (!link || link.hidden) return;
    irParaView(view, link);
    fecharMenuLateral();
    if (foco) {
        requestAnimationFrame(() => {
            const destino = $(foco);
            destino?.scrollIntoView({ block: 'center', behavior: 'auto' });
            destino?.focus({ preventScroll: true });
        });
    } else {
        window.scrollTo({ top: 0, behavior: 'instant' });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Todos os diálogos têm um fechamento visível; os botões ficam desabilitados
    // junto ao formulário durante gravações, preservando as confirmações em curso.
    document.querySelectorAll('dialog').forEach((dialog) => {
        if (dialog.querySelector('#help-close')) return;
        const close = document.createElement('button');
        close.type = 'button'; close.className = 'topbar__icon-btn dialog-close';
        close.setAttribute('aria-label', 'Fechar janela'); close.innerHTML = icone('close');
        close.addEventListener('click', () => dialog.close());
        (dialog.querySelector('form') || dialog).prepend(close);
    });
    const hoje = new Date();
    $('data-painel').dateTime = dataLocal(hoje);
    $('data-painel').textContent = hoje.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
    document.addEventListener('click', (event) => {
        const atalho = event.target.closest('[data-open-view]');
        if (!atalho) return;
        event.preventDefault();
        navegarStudio(atalho.dataset.openView, atalho.dataset.focus);
    });
    document.querySelectorAll('[data-chart-days]').forEach((button) => button.addEventListener('click', () => {
        periodoPainel = Number(button.dataset.chartDays);
        document.querySelectorAll('[data-chart-days]').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
        if (painelPronto) renderizarGraficoSaldo(transacoesCache);
    }));
    $('help-close').addEventListener('click', () => $('help-dialog').close());
    $('help-done').addEventListener('click', () => $('help-dialog').close());
    $('btn-modelo-csv').addEventListener('click', baixarModeloCsv);
    $('busca-topo').addEventListener('input', () => {
        if ($('busca-topo').value.trim()) navegarStudio('transacoes');
    });
    $('busca-lateral').addEventListener('input', () => {
        if ($('busca-lateral').value.trim()) {
            // Mantém o campo e o teclado disponíveis enquanto a pessoa digita.
            irParaView('transacoes', document.querySelector('.sidebar__link[data-view="transacoes"]'));
        }
    });
    const hashView = location.hash.slice(1);
    if (Object.hasOwn(TITULOS_VIEW, hashView) && hashView !== 'admin') navegarStudio(hashView);
});

function notificar(texto, erro = false) {
    clearTimeout(toastTimer);
    $('app-toast-text').textContent = texto;
    $('app-toast').hidden = false;
    $('app-toast').classList.toggle('text-red', erro);
    toastTimer = setTimeout(() => { $('app-toast').hidden = true; }, erro ? 7000 : 4500);
}

function baixarModeloCsv() {
    const csv = '\uFEFFdata;descricao;recebidoDe;categoria;valor;tipoPagamento\r\n' +
        `${dataLocal()};Pagamento de projeto;Cliente;Serviços;1500,00;Única\r\n` +
        `${dataLocal()};Internet;Operadora;Casa;-120,00;Mensal\r\n`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'modelo-fintheka.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function calcularResumoPainel(transacoes, hoje = dataLocal()) {
    const mes = hoje.slice(0, 7);
    const soma = (lista) => lista.reduce((total, t) => total + Math.round(t.valor * 100), 0) / 100;
    const doMes = transacoes.filter((t) => t.data.startsWith(mes));
    const receitas = doMes.filter((t) => t.valor >= 0);
    const despesas = doMes.filter((t) => t.valor < 0);
    return {
        saldo: soma(transacoes.filter((t) => t.pago)),
        receitas: soma(receitas), despesas: -soma(despesas),
        recebido: soma(receitas.filter((t) => t.pago)), pago: -soma(despesas.filter((t) => t.pago)),
        pendentes: doMes.filter((t) => !t.pago).length,
        categorias: agruparPor(despesas, 'categoria').map((g) => ({ nome: g.nome, total: -g.total })).sort((a, b) => b.total - a.total),
    };
}

function calcularSerieSaldo(transacoes, dias, referencia = new Date()) {
    const fim = new Date(referencia.getFullYear(), referencia.getMonth(), referencia.getDate(), 12);
    const inicio = new Date(fim);
    inicio.setDate(inicio.getDate() - dias + 1);
    const inicioISO = dataLocal(inicio);
    const porDia = new Map();
    let centavos = 0;
    for (const t of transacoes) {
        if (!t.pago) continue;
        const valor = Math.round(t.valor * 100);
        if (t.data < inicioISO) centavos += valor;
        else porDia.set(t.data, (porDia.get(t.data) || 0) + valor);
    }
    const serie = [];
    for (let i = 0; i < dias; i++) {
        const dia = new Date(inicio);
        dia.setDate(dia.getDate() + i);
        const data = dataLocal(dia);
        centavos += porDia.get(data) || 0;
        serie.push({ data, saldo: centavos / 100 });
    }
    return serie;
}

function renderizarPainel(transacoes) {
    painelPronto = true;
    const resumo = calcularResumoPainel(transacoes);
    const nome = (usuarioAtual?.nome || '').trim().split(/\s+/)[0];
    $('saudacao').textContent = nome ? `Painel de ${nome}` : 'Resumo financeiro';
    for (const [id, valor] of Object.entries({ 'overview-saldo': resumo.saldo, 'overview-receitas': resumo.receitas, 'overview-despesas': resumo.despesas })) $(id).textContent = formatarMoeda(valor);
    $('overview-saldo').classList.toggle('text-red', resumo.saldo < 0);
    $('overview-recebido').textContent = `${formatarMoeda(resumo.recebido)} recebidos`;
    $('overview-pago').textContent = `${formatarMoeda(resumo.pago)} pagos`;
    $('overview-pendentes').textContent = String(resumo.pendentes).padStart(2, '0');
    renderizarGraficoSaldo(transacoes);
    renderizarRecentes(transacoes);
    renderizarComposicao('overview-categorias', resumo.categorias);
    renderizarMiniMovimentos(transacoes);
    renderizarFluxoMensal(transacoes, 'home-fluxo-mensal');
    if ($('view-inicio').classList.contains('view--active') && !document.querySelector('#home-market-chart svg')) carregarMercadoInicio();
}

function renderizarGraficoSaldo(transacoes) {
    renderizarResumoSaldo(transacoes);
    $('balance-chart').setAttribute('role', 'group');
    const confirmadas = transacoes.filter((t) => t.pago && t.data <= dataLocal());
    if (!confirmadas.length) {
        $('balance-chart').innerHTML = `<div class="chart-empty">${icone('chart')}Seu próximo capítulo começa aqui.<small>Confirme um recebimento ou pagamento para acompanhar a evolução do saldo.</small></div>`;
        $('balance-chart').setAttribute('aria-label', 'Sem pagamentos confirmados até hoje para exibir no gráfico.');
        $('chart-labels').replaceChildren();
        return;
    }
    const serie = calcularSerieSaldo(transacoes, periodoPainel);
    const min = Math.min(...serie.map((p) => p.saldo));
    const max = Math.max(...serie.map((p) => p.saldo));
    const amplitude = max - min || Math.max(Math.abs(max) * .1, 1);
    const pontos = serie.map((p, i) => `${(i / (serie.length - 1) * 640).toFixed(2)},${(152 - (p.saldo - min) / amplitude * 122).toFixed(2)}`);
    const linha = `M${pontos.join(' L')}`;
    const ultimo = serie[serie.length - 1];
    const titulo = `Saldo confirmado por data da transação nos últimos ${periodoPainel} dias. Saldo em ${formatarData(ultimo.data)}: ${formatarMoeda(ultimo.saldo)}. Valores de ${formatarMoeda(min)} a ${formatarMoeda(max)}.`;
    $('balance-chart').setAttribute('aria-label', titulo);
    $('balance-chart').innerHTML = `<svg viewBox="0 0 640 180" preserveAspectRatio="none" tabindex="0" role="slider" aria-label="Consultar saldo por data. Use as setas esquerda e direita." aria-valuemin="0" aria-valuemax="${serie.length - 1}" aria-valuenow="${serie.length - 1}" aria-valuetext="${formatarData(ultimo.data)}: ${formatarMoeda(ultimo.saldo)}"><defs><linearGradient id="saldo-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".16"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs><path class="chart-grid" d="M0 30H640M0 91H640M0 152H640"/><path d="${linha} L640,180 L0,180 Z" fill="url(#saldo-fill)" style="color:var(--color-primary-dark)"/><path class="chart-line" vector-effect="non-scaling-stroke" d="${linha}"/><line class="chart-crosshair" y1="15" y2="173" hidden/><circle class="chart-point" r="4" hidden/></svg><div class="chart-tooltip" hidden></div>`;
    const svg = $('balance-chart').querySelector('svg');
    const cursor = svg.querySelector('.chart-crosshair');
    const ponto = svg.querySelector('.chart-point');
    const tooltip = $('balance-chart').querySelector('.chart-tooltip');
    let indice = serie.length - 1;
    const mostrarPonto = (n) => {
        indice = Math.max(0, Math.min(serie.length - 1, n));
        const p = serie[indice];
        const x = indice / (serie.length - 1) * 640;
        const y = 152 - (p.saldo - min) / amplitude * 122;
        cursor.setAttribute('x1', x); cursor.setAttribute('x2', x); cursor.removeAttribute('hidden');
        ponto.setAttribute('cx', x); ponto.setAttribute('cy', y); ponto.removeAttribute('hidden');
        tooltip.hidden = false;
        tooltip.textContent = `${formatarData(p.data)} · ${formatarMoeda(p.saldo)}`;
        tooltip.style.left = `${Math.max(25, Math.min(75, x / 640 * 100))}%`;
        svg.setAttribute('aria-valuenow', String(indice));
        svg.setAttribute('aria-valuetext', `${formatarData(p.data)}: ${formatarMoeda(p.saldo)}`);
    };
    const ocultarPonto = () => { cursor.setAttribute('hidden', ''); ponto.setAttribute('hidden', ''); tooltip.hidden = true; };
    svg.addEventListener('pointermove', (e) => {
        const bounds = svg.getBoundingClientRect();
        mostrarPonto(Math.round((e.clientX - bounds.left) / bounds.width * (serie.length - 1)));
    });
    svg.addEventListener('pointerleave', () => { if (document.activeElement !== svg) ocultarPonto(); });
    svg.addEventListener('focus', () => mostrarPonto(indice));
    svg.addEventListener('blur', ocultarPonto);
    svg.addEventListener('keydown', (e) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
        e.preventDefault();
        mostrarPonto(e.key === 'Home' ? 0 : e.key === 'End' ? serie.length - 1 : indice + (e.key === 'ArrowRight' ? 1 : -1));
    });
    const curta = (data) => new Date(`${data}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    $('chart-labels').innerHTML = [serie[0], serie[Math.floor(serie.length / 2)], ultimo].map((p) => `<span>${curta(p.data)}</span>`).join('');
}

function renderizarRecentes(transacoes) {
    const recentes = [...transacoes].sort((a, b) => b.data.localeCompare(a.data) || Number(b.id) - Number(a.id)).slice(0, 5);
    $('overview-recentes').innerHTML = recentes.length ? recentes.map((t) => `<div class="recent-row"><span class="recent-row__icon ${t.valor < 0 ? 'recent-row__icon--expense' : ''}">${icone(t.valor < 0 ? 'expense' : 'income')}</span><div><p class="recent-row__name">${escaparHtml(t.descricao)}</p><p class="recent-row__meta">${escaparHtml(t.categoria)} · ${formatarData(t.data)}</p></div><div><p class="recent-row__value ${t.valor < 0 ? 'text-red' : ''}">${formatarMoeda(t.valor)}</p><p class="recent-row__status">${t.pago ? (t.valor < 0 ? 'Pago' : 'Recebido') : 'Pendente'}</p></div></div>`).join('') :
        `<div class="empty-state">${icone('transactions')}Seu histórico está pronto para começar.<p>Adicione sua primeira transação ou importe sua planilha.</p><button class="btn btn--outline btn--small" data-open-view="importacoes">${icone('upload')} Importar histórico</button></div>`;
}

function limparPainel() {
    limparAnalises();
    painelPronto = false;
    ['overview-saldo', 'overview-receitas', 'overview-despesas', 'overview-pendentes'].forEach((id) => { $(id).textContent = '--'; });
    ['overview-recebido', 'overview-pago', 'overview-recentes', 'overview-categorias', 'balance-chart'].forEach((id) => { $(id).textContent = 'Carregando...'; });
    $('chart-labels').replaceChildren();
    $('app-toast').hidden = true;
    $('saudacao').textContent = 'SEU ESPAÇO FINANCEIRO';
}

function falhaPainel(detalhe = '') {
    limparPainel();
    const mensagem = `<div class="empty-state">${icone('info')}Não foi possível carregar seus dados.<p>${escaparHtml(detalhe || 'Confira sua conexão e tente novamente.')}</p><button class="btn btn--outline btn--small" data-retry-painel> Tentar novamente</button></div>`;
    $('balance-chart').innerHTML = mensagem;
    $('balance-chart').setAttribute('aria-label', 'Falha ao carregar dados financeiros.');
    // O botão precisa continuar interativo mesmo com o gráfico em falha.
    $('balance-chart').removeAttribute('role');
    $('overview-recentes').textContent = 'Histórico indisponível no momento.';
    $('overview-categorias').textContent = 'Categorias indisponíveis no momento.';
    $('balance-chart').querySelector('[data-retry-painel]').addEventListener('click', async (e) => {
        e.currentTarget.disabled = true;
        await carregarTransacoes();
    });
}
