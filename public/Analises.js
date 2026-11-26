/* Gráficos descritivos: somente registros da conta e histórico retornado pelo provedor. */
function comporDespesas(categorias, limite = 5) {
    const validas = categorias.filter((c) => Number.isFinite(c.total) && c.total > 0).map((c) => ({ nome: String(c.nome), centavos: Math.round(c.total * 100) })).filter((c) => c.centavos > 0).sort((a,b) => b.centavos - a.centavos);
    const total = validas.reduce((s,c) => s+c.centavos, 0);
    const grupos = validas.slice(0, limite);
    if (validas.length > limite) grupos.push({ nome: 'Demais categorias', centavos: validas.slice(limite).reduce((s,c) => s+c.centavos,0) });
    return { total: total / 100, grupos: grupos.map((c) => ({ nome: c.nome, valor: c.centavos / 100, percentual: total ? c.centavos / total * 100 : 0 })) };
}

function calcularFluxoMensal(transacoes, hoje = dataLocal()) {
    const [ano, mes] = hoje.split('-').map(Number);
    const meses = Array.from({length:6}, (_,i) => {
        const d = new Date(ano,mes-6+i,1,12);
        return { mes: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`, receitas:0, despesas:0 };
    });
    for (const t of transacoes) {
        const item = meses.find((m) => m.mes === t.data.slice(0,7));
        const valor = Math.round(t.valor * 100);
        if (!item || !Number.isSafeInteger(valor)) continue;
        if (valor >= 0) item.receitas += valor; else item.despesas -= valor;
    }
    return meses.map((m) => ({ mes:m.mes, receitas:m.receitas/100, despesas:m.despesas/100, resultado:(m.receitas-m.despesas)/100 }));
}

function calcularOscilacao(historico) {
    const resultado = [];
    for (let i=1;i<historico.length;i++) {
        const anterior = Number(historico[i-1].close), atual = Number(historico[i].close);
        const variacao = (atual / anterior - 1) * 100;
        if (anterior > 0 && atual > 0 && Number.isFinite(variacao)) resultado.push({ data:historico[i].time, variacao });
    }
    return resultado;
}

function renderizarComposicao(id, categorias) {
    const container = $(id), resumo = comporDespesas(categorias);
    container.onpointerleave = null; container.onfocusout = null;
    if (!resumo.grupos.length) {
        container.innerHTML = '<div class="empty-state">Nenhuma despesa neste período.<p>As categorias aparecem conforme você registra suas despesas.</p></div>';
        return;
    }
    const circ = 2 * Math.PI * 80;
    let acumulado = 0;
    const arcos = resumo.grupos.map((g,i) => {
        const comprimento = circ * g.percentual / 100;
        const svg = `<circle class="donut-segment series-${i}" data-segment="${i}" cx="110" cy="110" r="80" fill="none" stroke-width="24" stroke-dasharray="${Math.max(0, comprimento-2)} ${circ}" stroke-dashoffset="${-acumulado}"/>`;
        acumulado += comprimento;
        return svg;
    }).join('');
    container.innerHTML = `<div class="composition-chart"><div class="donut-figure"><svg viewBox="0 0 220 220" role="img" aria-label="Composição de despesas. Total: ${escaparHtml(formatarMoeda(resumo.total))}. Valores por categoria na legenda."><circle cx="110" cy="110" r="80" fill="none" class="donut-track" stroke-width="24"/><g transform="rotate(-90 110 110)">${arcos}</g></svg><div class="donut-center" aria-hidden="true"><span>Total de despesas</span><strong>${formatarMoeda(resumo.total)}</strong></div></div><div class="donut-legend" role="group" aria-label="Categorias de despesa">${resumo.grupos.map((g,i) => `<button type="button" data-category="${i}" aria-pressed="false"><span class="legend-dot series-${i}" aria-hidden="true"></span><span class="legend-label">${escaparHtml(g.nome)}<small>${g.percentual.toLocaleString('pt-BR',{maximumFractionDigits:1})}% das despesas</small></span><strong>${formatarMoeda(g.valor)}</strong></button>`).join('')}</div></div>`;
    const mostrar = (indice) => {
        const grupo = resumo.grupos[indice];
        container.querySelector('.donut-center span').textContent = grupo ? grupo.nome : 'Total de despesas';
        container.querySelector('.donut-center strong').textContent = formatarMoeda(grupo ? grupo.valor : resumo.total);
        container.querySelectorAll('[data-segment]').forEach((c,i) => c.classList.toggle('donut-segment--muted', Boolean(grupo) && i!==indice));
        container.querySelectorAll('[data-category]').forEach((b,i) => b.setAttribute('aria-pressed',String(Boolean(grupo) && i===indice)));
    };
    container.querySelectorAll('[data-category]').forEach((button) => {
        const indice = Number(button.dataset.category);
        button.addEventListener('focus',() => mostrar(indice));
        button.addEventListener('pointerenter',() => mostrar(indice));
        button.addEventListener('click',() => mostrar(indice));
    });
    container.querySelectorAll('[data-segment]').forEach((circle) => circle.addEventListener('pointerenter',() => mostrar(Number(circle.dataset.segment))));
    container.onpointerleave = () => { if (!container.contains(document.activeElement)) mostrar(-1); };
    container.onfocusout = (e) => { if (!container.contains(e.relatedTarget)) mostrar(-1); };
}

function renderizarFluxoMensal(transacoes, id = 'relatorio-fluxo') {
    const container = $(id), serie = calcularFluxoMensal(transacoes);
    if (!serie.some((m) => m.receitas || m.despesas)) {
        container.innerHTML = '<div class="empty-state">Sem lançamentos nos últimos seis meses.</div>';
        return;
    }
    const max = Math.max(...serie.flatMap((m) => [m.receitas,m.despesas])) * 1.15;
    const curto = (v) => v.toLocaleString('pt-BR',{style:'currency',currency:'BRL',notation:'compact',maximumFractionDigits:1});
    const mes = (iso) => new Date(`${iso}-01T12:00:00`).toLocaleDateString('pt-BR',{month:'short',year:'2-digit'});
    const escala = (v) => v / max * 170;
    container.innerHTML = `<div class="chart-key"><span><i class="flow-income"></i>Receitas</span><span><i class="flow-expense"></i>Despesas</span></div><svg class="flow-chart" viewBox="0 0 720 250" role="img" aria-label="Receitas e despesas cadastradas nos últimos seis meses. Consulte cada mês pelos botões abaixo."><desc>${escaparHtml(serie.map((m) => `${mes(m.mes)}: receitas ${formatarMoeda(m.receitas)}, despesas ${formatarMoeda(m.despesas)}`).join('; '))}</desc>${[0,.5,1].map((p) => `<path class="analytics-grid" d="M75 ${205-p*170}H710"/><text class="analytics-axis" x="65" y="${209-p*170}" text-anchor="end">${escaparHtml(curto(max*p))}</text>`).join('')}${serie.map((m,i) => `<g data-flow="${i}"><rect class="flow-income" x="${92+i*103}" y="${205-escala(m.receitas)}" width="25" height="${escala(m.receitas)}" rx="3"/><rect class="flow-expense" x="${122+i*103}" y="${205-escala(m.despesas)}" width="25" height="${escala(m.despesas)}" rx="3"/><text class="analytics-axis" x="${120+i*103}" y="230" text-anchor="middle">${escaparHtml(mes(m.mes))}</text></g>`).join('')}</svg><div class="chart-months" role="group" aria-label="Consultar mês">${serie.map((m,i) => `<button type="button" data-flow-month="${i}" aria-pressed="${i===5}">${escaparHtml(mes(m.mes))}</button>`).join('')}</div><div class="flow-readout" role="status" aria-live="polite"></div>`;
    const mostrar = (i) => {
        const m = serie[i];
        container.querySelector('.flow-readout').innerHTML = `<span><small>Receitas · ${escaparHtml(mes(m.mes))}</small><strong>${formatarMoeda(m.receitas)}</strong></span><span><small>Despesas</small><strong>${formatarMoeda(m.despesas)}</strong></span><span><small>Resultado cadastrado</small><strong class="${m.resultado < 0 ? 'text-red' : ''}">${formatarMoeda(m.resultado)}</strong></span>`;
        container.querySelectorAll('[data-flow-month]').forEach((b,j) => b.setAttribute('aria-pressed',String(i===j)));
    };
    container.querySelectorAll('[data-flow-month]').forEach((b) => { b.addEventListener('click',() => mostrar(Number(b.dataset.flowMonth))); b.addEventListener('focus',() => mostrar(Number(b.dataset.flowMonth))); });
    container.querySelectorAll('[data-flow]').forEach((g) => g.addEventListener('pointerenter',() => mostrar(Number(g.dataset.flow))));
    mostrar(5);
}

function renderizarAnalisesRelatorios(transacoes) {
    renderizarComposicao('relatorio-composicao', agruparPor(transacoes.filter((t) => t.valor < 0),'categoria').map((g) => ({nome:g.nome,total:-g.total})));
    renderizarFluxoMensal(transacoes);
}

function limparAnalises() {
    for (const id of ['overview-categorias','relatorio-composicao','relatorio-fluxo','home-fluxo-mensal','overview-receitas-chart','overview-despesas-chart','overview-pagamentos-chart','overview-saldo-evolucao']) {
        const container = $(id);
        container.onpointerleave = null; container.onfocusout = null;
        container.replaceChildren();
    }
    limparMercadoInicio();
}

function limparOscilacao(mensagem = 'Selecione uma moeda para consultar suas oscilações.') {
    $('mercado-oscilacao').textContent = mensagem;
}

function renderizarOscilacao(historico, par) {
    const serie = calcularOscilacao(historico), container = $('mercado-oscilacao');
    if (!serie.length) return limparOscilacao('Histórico insuficiente para calcular a variação diária.');
    const limite = Math.max(.1,...serie.map((p) => Math.abs(p.variacao))) * 1.15;
    const largura = 630 / serie.length, porcentagem = (v) => `${v > 0 ? '+' : ''}${v.toLocaleString('pt-BR',{maximumFractionDigits:2})}%`;
    container.innerHTML = `<div class="variation-summary"><span><small>Maior variação observada</small><strong>${porcentagem(Math.max(...serie.map((p) => p.variacao)))}</strong></span><span><small>Menor variação observada</small><strong>${porcentagem(Math.min(...serie.map((p) => p.variacao)))}</strong></span></div><svg class="variation-chart" viewBox="0 0 720 200" role="img" aria-label="Variação diária de ${escaparHtml(par)} em relação ao fechamento anterior."><path class="analytics-grid" d="M65 20H710M65 95H710M65 170H710"/><text class="analytics-axis" x="55" y="24" text-anchor="end">${porcentagem(limite)}</text><text class="analytics-axis" x="55" y="99" text-anchor="end">0%</text><text class="analytics-axis" x="55" y="174" text-anchor="end">${porcentagem(-limite)}</text>${serie.map((p,i) => { const h=Math.abs(p.variacao)/limite*75; return `<rect class="${p.variacao >= 0 ? 'flow-income' : 'flow-expense'}" x="${70+i*largura}" y="${p.variacao >= 0 ? 95-h : 95}" width="${Math.max(1,largura*.65)}" height="${h}" rx="1"><title>${formatarData(p.data)}: ${porcentagem(p.variacao)}</title></rect>`; }).join('')}</svg><p class="analytics-note">${serie.length} variações calculadas. ${formatarData(serie[0].data)} a ${formatarData(serie.at(-1).data)}. Barras acima de zero indicam alta; abaixo, queda.</p>`;
}
