/* Interface de planejamento. Não consulta provedores nem persiste dados pessoais. */
let simulacaoAtual = null;
let visaoSimulador = 'nominal';
let paginaSimulador = 1;
let timerSimulador;
let unidadeTaxaAnterior = 'anual';
let unidadePrazoAnterior = 'anos';
let larguraGraficoSimulador = 0;
const camposMonetariosSim = new Set(['invest-valor-inicial', 'invest-aporte', 'sim-meta']);
const porcentagemSim = (n) => n.toLocaleString('pt-BR', { maximumFractionDigits: 4 }) + '%';
const prazoSim = (meses) => meses % 12 === 0 ? `${meses / 12} ${meses === 12 ? 'ano' : 'anos'}` : `${meses} ${meses === 1 ? 'mês' : 'meses'}`;

function lerSimulacao() {
    const numero = (id, vazio = NaN) => $(id).value.trim() === '' ? vazio : camposMonetariosSim.has(id) ? converterValor($(id).value) : Number($(id).value);
    const prazo = numero('invest-meses') * ($('sim-unidade-prazo').value === 'anos' ? 12 : 1);
    if (Number.isFinite(prazo) && Math.abs(prazo - Math.round(prazo)) > 1e-6) throw new Error('O prazo deve corresponder a um número inteiro de meses.');
    return {
        inicial: numero('invest-valor-inicial'), aporte: numero('invest-aporte'),
        meses: Math.round(prazo), taxa: numero('invest-taxa'), unidadeTaxa: $('sim-unidade-taxa').value,
        inflacao: numero('sim-inflacao'), custos: numero('sim-custos'), reajuste: numero('sim-reajuste'),
        momento: $('sim-momento').value, meta: numero('sim-meta', 0), variacao: numero('sim-variacao'),
    };
}

function ativarCalculadoraInvestimento() {
    $('sim-form').addEventListener('submit', (e) => {
        e.preventDefault(); calcularInvestimento();
        if (window.matchMedia('(max-width: 1100px)').matches) $('invest-resultado').scrollIntoView({ block: 'start', behavior: 'auto' });
    });
    $('sim-form').addEventListener('blur', (e) => {
        if (!camposMonetariosSim.has(e.target.id)) return;
        const valor = converterValor(e.target.value);
        if (Number.isFinite(valor)) e.target.value = valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }, true);
    new ResizeObserver(() => {
        const largura = $('invest-chart').clientWidth;
        if (simulacaoAtual && largura > 0 && Math.round(largura) !== larguraGraficoSimulador) renderizarGraficoSimulacao();
    }).observe($('invest-chart'));
    $('sim-form').addEventListener('input', (e) => {
        if (e.target.tagName !== 'INPUT') return;
        clearTimeout(timerSimulador);
        $('sim-exportar').disabled = true;
        $('sim-status').textContent = 'Atualizando com as novas hipóteses...';
        timerSimulador = setTimeout(calcularInvestimento, 250);
    });
    $('sim-unidade-taxa').addEventListener('change', () => {
        const taxa = $('invest-taxa').valueAsNumber;
        const anual = MotorSimulacao.anualizar(taxa, unidadeTaxaAnterior);
        const novaUnidade = $('sim-unidade-taxa').value;
        if (Number.isFinite(anual) && anual > -100) $('invest-taxa').value = novaUnidade === 'anual' ? anual : Math.expm1(Math.log1p(anual / 100) / 12) * 100;
        unidadeTaxaAnterior = novaUnidade;
        $('invest-taxa').min = novaUnidade === 'anual' ? '-90' : String(Math.expm1(Math.log(.1) / 12) * 100);
        $('invest-taxa').max = novaUnidade === 'anual' ? '100' : String(Math.expm1(Math.log(2) / 12) * 100);
        calcularInvestimento();
    });
    $('sim-unidade-prazo').addEventListener('change', () => {
        const meses = $('invest-meses').valueAsNumber * (unidadePrazoAnterior === 'anos' ? 12 : 1);
        unidadePrazoAnterior = $('sim-unidade-prazo').value;
        if (Number.isFinite(meses)) $('invest-meses').value = unidadePrazoAnterior === 'anos' ? meses / 12 : meses;
        $('invest-meses').max = unidadePrazoAnterior === 'anos' ? '50' : '600';
        $('invest-meses').min = unidadePrazoAnterior === 'anos' ? String(1 / 12) : '1';
        calcularInvestimento();
    });
    $('sim-momento').addEventListener('change', calcularInvestimento);
    $('sim-reset').addEventListener('click', reiniciarSimulador);
    $('sim-exportar').addEventListener('click', exportarSimulacao);
    document.querySelectorAll('[data-sim-years]').forEach((b) => b.addEventListener('click', () => {
        $('sim-unidade-prazo').value = 'anos'; unidadePrazoAnterior = 'anos';
        $('invest-meses').value = b.dataset.simYears; $('invest-meses').max = '50';
        calcularInvestimento();
    }));
    document.querySelectorAll('[data-sim-view]').forEach((b) => b.addEventListener('click', () => {
        visaoSimulador = b.dataset.simView;
        document.querySelectorAll('[data-sim-view]').forEach((el) => el.setAttribute('aria-pressed', String(el === b)));
        if (simulacaoAtual) renderizarGraficoSimulacao();
    }));
    $('sim-tabela-periodo').addEventListener('change', () => { paginaSimulador = 1; renderizarTabelaSimulacao(); });
    for (const [id, delta] of [['sim-anterior', -1], ['sim-proxima', 1]]) $(id).addEventListener('click', () => {
        paginaSimulador += delta; renderizarTabelaSimulacao();
    });
    calcularInvestimento();
}

function reiniciarSimulador() {
    clearTimeout(timerSimulador);
    $('sim-form').reset(); unidadeTaxaAnterior = 'anual'; unidadePrazoAnterior = 'anos';
    $('invest-taxa').min = '-90'; $('invest-taxa').max = '100';
    $('invest-meses').max = '50'; $('invest-meses').min = '1';
    $('sim-tabela-periodo').value = 'anual';
    visaoSimulador = 'nominal';
    document.querySelectorAll('[data-sim-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.simView === 'nominal')));
    calcularInvestimento();
}

function calcularInvestimento() {
    clearTimeout(timerSimulador);
    try {
        const config = lerSimulacao();
        const simulacao = MotorSimulacao.comparar(config);
        simulacao.aporteMeta = MotorSimulacao.calcularAporteMeta(config);
        simulacaoAtual = simulacao; paginaSimulador = 1;
        const { base } = simulacao;
        $('sim-taxa-equivalente').textContent = config.unidadeTaxa === 'anual' ? `Equivale a ${porcentagemSim(base.mensal)} ao mês, antes de custos.` : `Equivale a ${porcentagemSim(base.anual)} ao ano, antes de custos.`;
        $('sim-status').innerHTML = `${icone('check')} Projeção atualizada · ${config.meses} meses · cenário base`;
        $('sim-exportar').disabled = false;
        for (const id of ['sim-chart-panel', 'sim-scenarios', 'sim-table-panel']) $(id).hidden = false;
        document.querySelectorAll('[data-sim-years]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.simYears) * 12 === config.meses)));
        renderizarResumoSimulacao(); renderizarGraficoSimulacao(); renderizarMetaSimulacao(); renderizarTabelaSimulacao();
    } catch (error) {
        simulacaoAtual = null;
        $('sim-status').textContent = 'Revise as hipóteses para continuar.';
        $('sim-taxa-equivalente').textContent = '';
        $('sim-exportar').disabled = true;
        $('invest-resultado').replaceChildren();
        const mensagem = document.createElement('p'); mensagem.className = 'sim-error'; mensagem.setAttribute('role', 'alert');
        mensagem.textContent = error.message; $('invest-resultado').append(mensagem);
        for (const id of ['sim-chart-panel', 'sim-scenarios', 'sim-table-panel', 'sim-goal']) $(id).hidden = true;
        $('invest-chart').replaceChildren(); $('sim-tabela-corpo').replaceChildren();
    }
}

function renderizarResumoSimulacao() {
    const { base, menor, maior } = simulacaoAtual;
    const c = base.config, f = base.final;
    const fracaoCapital = f.saldo > 0 ? Math.min(100, f.aportado / f.saldo * 100) : 100;
    $('invest-resultado').innerHTML = `<article class="sim-kpi sim-kpi--hero"><div class="sim-hero-top"><p class="sim-kpi__label">${icone('wallet')} Saldo projetado em ${prazoSim(c.meses)}</p><span class="badge">${porcentagemSim(base.anual)} a.a. · taxa efetiva</span></div><p class="sim-kpi__value" id="sim-saldo-final">${formatarMoeda(f.saldo)}</p><p class="sim-kpi__note">Cenário base após custos, antes de impostos. Custos debitados no período: ${formatarMoeda(f.custos)}.</p><div class="sim-composition" aria-hidden="true"><span style="width:${fracaoCapital}%"></span><span style="width:${100 - fracaoCapital}%"></span></div></article>
        <article class="sim-kpi"><p class="sim-kpi__label">Total investido</p><p class="sim-kpi__value" id="sim-total-aportado">${formatarMoeda(f.aportado)}</p><p class="sim-kpi__note">Capital inicial + todos os aportes.</p></article>
        <article class="sim-kpi"><p class="sim-kpi__label">Resultado após custos</p><p class="sim-kpi__value ${f.ganho < 0 ? 'text-red' : 'text-green'}" id="sim-ganho">${formatarMoeda(f.ganho)}</p><p class="sim-kpi__note">Juros acumulados menos custos.</p></article>
        <article class="sim-kpi"><p class="sim-kpi__label">Poder de compra</p><p class="sim-kpi__value" id="sim-valor-real">${formatarMoeda(f.real)}</p><p class="sim-kpi__note">Em valores de hoje · inflação de ${porcentagemSim(c.inflacao)} a.a.</p></article>`;
    $('sim-scenarios').innerHTML = [
        ['Taxa menor', menor, ''], ['Cenário base', base, 'sim-scenario--base'], ['Taxa maior', maior, ''],
    ].map(([nome, s, classe]) => `<article class="sim-scenario ${classe}"><h4>${nome}</h4><strong>${formatarMoeda(s.final.saldo)}</strong><p>${porcentagemSim(s.anual)} ao ano · saldo nominal</p></article>`).join('');
}

function renderizarMetaSimulacao() {
    const { base, aporteMeta } = simulacaoAtual;
    const c = base.config, f = base.final;
    $('sim-goal').hidden = !c.meta;
    if (!c.meta) return;
    const percentual = Math.min(100, f.saldo / c.meta * 100);
    const quando = base.metaMes === 0 ? 'A meta já é coberta pelo seu capital inicial.' : base.metaMes !== null ? `Primeiro alcance na simulação: <strong>mês ${base.metaMes}</strong> (${prazoSim(base.metaMes)}).` : 'A meta não é alcançada dentro do prazo escolhido.';
    const podeAjustar = base.metaMes === null && Number.isFinite(aporteMeta) && aporteMeta <= 1e9;
    $('sim-goal').innerHTML = `<div class="sim-goal__heading"><span>${icone('growth')} Meta de ${formatarMoeda(c.meta)}</span><span>${percentual.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span></div><div class="progress" role="progressbar" aria-label="Saldo final em relação à meta nominal" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percentual.toFixed(1)}"><span style="width:${percentual}%"></span></div><p>${quando}${podeAjustar ? ` Para terminar com essa meta, o aporte mensal inicial calculado é <strong>${formatarMoeda(aporteMeta)}</strong>, mantendo as demais hipóteses.` : ''}</p>${podeAjustar ? '<button type="button" class="link-button" id="sim-usar-aporte">Simular com esse aporte</button>' : ''}`;
    $('sim-usar-aporte')?.addEventListener('click', () => { $('invest-aporte').value = aporteMeta; calcularInvestimento(); });
}

function renderizarGraficoSimulacao() {
    const { base, menor, maior } = simulacaoAtual;
    const real = visaoSimulador === 'real', campo = real ? 'real' : 'saldo';
    const maximo = Math.max(1, ...maior.historico.map((p) => p[campo]), ...base.historico.map((p) => real ? p.real : p.aportado));
    const largura = Math.max(260, Math.round($('invest-chart').clientWidth || 640));
    larguraGraficoSimulador = largura;
    const area = largura - 66;
    const x = (i) => 54 + i / base.config.meses * area;
    const y = (n) => 224 - n / maximo * 200;
    const linha = (serie, key) => serie.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)},${y(p[key]).toFixed(2)}`).join(' ');
    const faixa = linha(maior.historico, campo) + ' ' + [...menor.historico].reverse().map((p) => `L${x(p.mes).toFixed(2)},${y(p[campo]).toFixed(2)}`).join(' ') + ' Z';
    const compacto = (n) => n.toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
    const grade = Array.from({ length: 5 }, (_, i) => {
        const valor = maximo * i / 4;
        return `<path class="chart-grid" d="M54 ${y(valor)}H${largura - 12}"/><text class="sim-chart-axis" x="46" y="${y(valor) + 4}" text-anchor="end">${compacto(valor)}</text>`;
    }).join('');
    const datas = [...new Set([0, Math.round(base.config.meses / 4), Math.round(base.config.meses / 2), Math.round(base.config.meses * 3 / 4), base.config.meses])].map((mes) => `<text class="sim-chart-axis" x="${x(mes)}" y="252" text-anchor="${mes === 0 ? 'start' : mes === base.config.meses ? 'end' : 'middle'}">${mes === 0 ? 'Hoje' : base.config.meses >= 24 ? `${(mes / 12).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} a` : `Mês ${mes}`}</text>`).join('');
    $('invest-chart').innerHTML = `<svg viewBox="0 0 ${largura} 270" preserveAspectRatio="none" tabindex="0" role="slider" aria-label="Consultar projeção por mês. Use as setas esquerda e direita." aria-valuemin="0" aria-valuemax="${base.config.meses}" aria-valuenow="${base.config.meses}" aria-valuetext="Mês ${base.config.meses}: ${formatarMoeda(base.final[campo])}">${grade}<path class="sim-chart-band" d="${faixa}"/>${!real ? `<path class="sim-chart-capital" vector-effect="non-scaling-stroke" d="${linha(base.historico, 'aportado')}"/>` : ''}<path class="sim-chart-base" vector-effect="non-scaling-stroke" d="${linha(base.historico, campo)}"/>${datas}<line class="chart-crosshair" y1="20" y2="224" hidden/><circle class="chart-point" r="4" hidden/></svg><div class="chart-tooltip" hidden></div>`;
    $('sim-aporte-legenda').hidden = real;
    $('sim-chart-foot').textContent = `Valores em R$. ${real ? 'Saldos corrigidos pela inflação, em poder de compra de hoje.' : 'Saldos nominais, sem desconto da inflação.'} Faixa entre ${porcentagemSim(menor.anual)} e ${porcentagemSim(maior.anual)} ao ano; não representa probabilidade ou garantia.`;
    const svg = $('invest-chart').querySelector('svg'), cursor = svg.querySelector('line'), ponto = svg.querySelector('circle'), tooltip = $('invest-chart').querySelector('.chart-tooltip');
    let indice = base.config.meses;
    const mostrar = (i) => {
        indice = Math.max(0, Math.min(base.config.meses, i)); const p = base.historico[indice];
        cursor.setAttribute('x1', x(indice)); cursor.setAttribute('x2', x(indice)); cursor.removeAttribute('hidden');
        ponto.setAttribute('cx', x(indice)); ponto.setAttribute('cy', y(p[campo])); ponto.removeAttribute('hidden');
        const texto = `${indice === 0 ? 'Hoje' : `Mês ${indice}`} · ${formatarMoeda(p[campo])}`;
        tooltip.hidden = false; tooltip.textContent = texto; tooltip.style.left = `${Math.max(28, Math.min(72, x(indice) / largura * 100))}%`;
        svg.setAttribute('aria-valuenow', indice); svg.setAttribute('aria-valuetext', texto);
    };
    const ocultar = () => { cursor.setAttribute('hidden', ''); ponto.setAttribute('hidden', ''); tooltip.hidden = true; };
    svg.addEventListener('pointermove', (e) => { const box = svg.getBoundingClientRect(); mostrar(Math.round(((e.clientX - box.left) / box.width * largura - 54) / area * base.config.meses)); });
    svg.addEventListener('pointerleave', () => { if (document.activeElement !== svg) ocultar(); });
    svg.addEventListener('focus', () => mostrar(indice)); svg.addEventListener('blur', ocultar);
    svg.addEventListener('keydown', (e) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
        e.preventDefault(); mostrar(e.key === 'Home' ? 0 : e.key === 'End' ? base.config.meses : indice + (e.key === 'ArrowLeft' ? -1 : 1));
    });
}

function renderizarTabelaSimulacao() {
    if (!simulacaoAtual) return;
    const { historico, config } = simulacaoAtual.base;
    const anual = $('sim-tabela-periodo').value === 'anual', passo = anual ? 12 : 1;
    const linhas = [];
    for (let inicio = 1; inicio <= config.meses; inicio += passo) {
        const fim = Math.min(config.meses, inicio + passo - 1), ponto = historico[fim];
        const grupo = historico.slice(inicio, fim + 1);
        linhas.push({ nome: anual ? `Ano ${Math.ceil(fim / 12)}${fim % 12 ? ` · até mês ${fim}` : ''}` : `Mês ${fim}`, aporte: ponto.aportado - historico[inicio - 1].aportado, juros: grupo.reduce((s, p) => s + p.juros, 0), custos: grupo.reduce((s, p) => s + p.custo, 0), saldo: ponto.saldo, real: ponto.real });
    }
    const paginas = Math.max(1, Math.ceil(linhas.length / 12)); paginaSimulador = Math.max(1, Math.min(paginas, paginaSimulador));
    const inicio = (paginaSimulador - 1) * 12;
    $('sim-tabela-corpo').innerHTML = linhas.slice(inicio, inicio + 12).map((p) => `<tr><td>${p.nome}</td><td>${formatarMoeda(p.aporte)}</td><td class="${p.juros < 0 ? 'text-red' : ''}">${formatarMoeda(p.juros)}</td><td>${formatarMoeda(p.custos)}</td><td>${formatarMoeda(p.saldo)}</td><td>${formatarMoeda(p.real)}</td></tr>`).join('');
    $('sim-paginacao-info').textContent = `${inicio + 1}–${Math.min(inicio + 12, linhas.length)} de ${linhas.length} ${anual ? 'períodos anuais' : 'meses'}`;
    $('sim-anterior').disabled = paginaSimulador === 1; $('sim-proxima').disabled = paginaSimulador === paginas;
}

function exportarSimulacao() {
    if (!simulacaoAtual || $('sim-exportar').disabled) return;
    const { base, menor, maior } = simulacaoAtual;
    const numero = (n) => n.toFixed(2).replace('.', ',');
    const c = base.config;
    const hipoteses = [base.anual, c.variacao, c.inflacao, c.custos, c.reajuste].map((n) => n.toFixed(8).replace('.', ','));
    const csv = '\uFEFFmes;aporte;total_investido;juros_mes;custos_mes;saldo_nominal;saldo_poder_compra;saldo_taxa_menor;saldo_taxa_maior;taxa_base_anual_pct;variacao_cenarios_pp;inflacao_anual_pct;custo_anual_pct;reajuste_anual_aporte_pct;momento_aporte;meta_nominal\r\n' + base.historico.map((p, i) => [...[p.mes, p.aporte, p.aportado, p.juros, p.custo, p.saldo, p.real, menor.historico[i].saldo, maior.historico[i].saldo].map((v, index) => index === 0 ? String(v) : numero(v)), ...hipoteses, c.momento, numero(c.meta)].join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `fintheka-projecao-${base.config.meses}-meses.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
