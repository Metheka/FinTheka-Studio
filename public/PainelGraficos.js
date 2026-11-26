/* Painel: séries de transações em centavos e prévia de câmbio com a consulta já usada no mercado. */
let mercadoInicio = { pedido: null };

function calcularMovimentosDoMes(transacoes, hoje = dataLocal()) {
    const [ano, mes] = hoje.split('-').map(Number);
    const dias = new Date(ano, mes, 0).getDate();
    const prefixo = hoje.slice(0,7);
    const serie = Array.from({length:dias}, (_,i) => ({dia:i+1,receitas:0,despesas:0,pagos:0,pendentes:0}));
    for (const t of transacoes) {
        if (!t.data.startsWith(`${prefixo}-`)) continue;
        const item = serie[Number(t.data.slice(8,10))-1], valor = Math.round(t.valor * 100);
        if (!item || !Number.isSafeInteger(valor)) continue;
        if (valor >= 0) item.receitas += valor; else item.despesas -= valor;
        if (t.pago) item.pagos++; else item.pendentes++;
    }
    return serie.map((s) => ({...s,receitas:s.receitas/100,despesas:s.despesas/100}));
}

function resumoEvolucaoSaldo(transacoes, dias, referencia = new Date()) {
    const serie = calcularSerieSaldo(transacoes, dias, referencia);
    const inicio = transacoes.filter((t) => t.pago && t.data < serie[0].data).reduce((s,t) => s+Math.round(t.valor*100),0);
    const fim = Math.round(serie.at(-1).saldo*100);
    return { inicial:inicio/100, final:fim/100, variacao:(fim-inicio)/100 };
}

function renderizarMiniMovimentos(transacoes) {
    const serie = calcularMovimentosDoMes(transacoes);
    for (const [id,campo,classe] of [['overview-receitas-chart','receitas','flow-income'],['overview-despesas-chart','despesas','flow-expense']]) {
        const container = $(id), max = Math.max(...serie.map((s) => s[campo]));
        if (!max) { container.innerHTML = `<p class="metric-chart-empty">Nenhuma ${campo === 'receitas' ? 'receita' : 'despesa'} cadastrada no mês.</p>`; continue; }
        const largura = 310/serie.length;
        container.innerHTML = `<svg viewBox="0 0 320 64" role="img" aria-label="${campo === 'receitas' ? 'Receitas' : 'Despesas'} cadastradas por dia no mês atual, incluindo pendências."><desc>${serie.filter((s)=>s[campo]>0).map((s)=>`Dia ${s.dia}: ${formatarMoeda(s[campo])}`).join('; ')}</desc><path class="analytics-grid" d="M5 56H315"/>${serie.map((s,i)=>{const h=s[campo]/max*46;return `<rect class="${classe}" x="${5+i*largura}" y="${56-h}" height="${h}" width="${largura*.66}" rx="2"><title>Dia ${s.dia}: ${formatarMoeda(s[campo])}</title></rect>`;}).join('')}</svg><p class="metric-chart-caption">Distribuição diária · pagos e pendentes</p>`;
    }
    const pagos = serie.reduce((s,d)=>s+d.pagos,0), pendentes = serie.reduce((s,d)=>s+d.pendentes,0), total=pagos+pendentes;
    $('overview-pagamentos-chart').innerHTML = total ? `<div class="payment-status-track" role="img" aria-label="${pagos} lançamentos confirmados e ${pendentes} pendentes no mês"><span style="width:${pagos/total*100}%"></span></div><p class="metric-chart-caption">${pagos} confirmados · ${pendentes} pendentes</p>` : '<p class="metric-chart-empty">Nenhum lançamento no mês.</p>';
}

function renderizarResumoSaldo(transacoes) {
    const container=$('overview-saldo-evolucao');
    const possui=transacoes.some((t)=>t.pago && t.data<=dataLocal());
    container.hidden=!possui;
    if (!possui) { container.replaceChildren(); return; }
    const r=resumoEvolucaoSaldo(transacoes,periodoPainel);
    container.innerHTML=`<span><small>No início do período</small><strong>${formatarMoeda(r.inicial)}</strong></span><span><small>${r.variacao>0?'Saldo subiu':r.variacao<0?'Saldo caiu':'Sem variação no saldo'}</small><strong class="${r.variacao<0?'text-red':r.variacao>0?'text-green':''}">${r.variacao===0?formatarMoeda(0):formatarMoeda(Math.abs(r.variacao))}</strong></span><span><small>Saldo final do gráfico</small><strong>${formatarMoeda(r.final)}</strong></span>`;
}

function limparMercadoInicio(mensagem = 'A prévia será carregada ao abrir a visão geral.') {
    mercadoInicio={pedido:null};
    $('home-market-chart').textContent=mensagem;
    $('home-market-valor').textContent='--';
    $('home-market-variacao').textContent='';
    $('home-market-periodo').textContent='';
}

function renderizarMercadoInicio(historico) {
    const h=historico.filter((p)=>Number.isFinite(Number(p.close)) && Number(p.close)>0 && /^\d{4}-\d{2}-\d{2}$/.test(p.time));
    if (h.length<2) {
        $('home-market-chart').textContent='Histórico insuficiente para exibir o gráfico.';
        $('home-market-valor').textContent='--'; $('home-market-variacao').textContent=''; $('home-market-periodo').textContent='';
        return;
    }
    const container=$('home-market-chart'), preco=(v)=>Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:4,maximumFractionDigits:4});
    const minimo=Math.min(...h.map((p)=>Number(p.close))), maximo=Math.max(...h.map((p)=>Number(p.close)));
    const faixa=maximo-minimo || maximo*.01;
    const x=(i)=>14+i/(h.length-1)*572, y=(v)=>144-(Number(v)-minimo)/faixa*110;
    const linha=h.map((p,i)=>`${i?'L':'M'}${x(i).toFixed(2)},${y(p.close).toFixed(2)}`).join(' ');
    const variacao=(Number(h.at(-1).close)/Number(h[0].close)-1)*100;
    $('home-market-valor').textContent=preco(h.at(-1).close);
    $('home-market-variacao').textContent=`${variacao>0?'+':''}${variacao.toLocaleString('pt-BR',{maximumFractionDigits:2})}% no histórico exibido`;
    $('home-market-variacao').classList.toggle('text-red',variacao<0);
    $('home-market-variacao').classList.toggle('text-green',variacao>=0);
    $('home-market-periodo').textContent=`${formatarData(h[0].time)} a ${formatarData(h.at(-1).time)}`;
    container.innerHTML=`<svg viewBox="0 0 600 180" preserveAspectRatio="none" tabindex="0" role="slider" aria-label="Consultar histórico do dólar. Use as setas esquerda e direita." aria-valuemin="0" aria-valuemax="${h.length-1}" aria-valuenow="${h.length-1}" aria-valuetext="${formatarData(h.at(-1).time)}: ${preco(h.at(-1).close)}"><path class="analytics-grid" d="M14 35H586M14 90H586M14 145H586"/><path class="home-market-area" d="${linha} L586 160 L14 160Z"/><path class="home-market-line" vector-effect="non-scaling-stroke" d="${linha}"/><circle class="chart-point" r="4" hidden/></svg><div class="chart-tooltip" hidden></div>`;
    const svg=container.querySelector('svg'), ponto=svg.querySelector('circle'), tooltip=container.querySelector('.chart-tooltip');
    let indice=h.length-1;
    const mostrar=(i)=>{
        indice=Math.max(0,Math.min(h.length-1,i));const p=h[indice];
        ponto.setAttribute('cx',String(x(indice)));ponto.setAttribute('cy',String(y(p.close)));ponto.removeAttribute('hidden');
        tooltip.hidden=false;tooltip.textContent=`${formatarData(p.time)} · ${preco(p.close)}`;tooltip.style.left=`${Math.max(25,Math.min(75,indice/(h.length-1)*100))}%`;
        svg.setAttribute('aria-valuenow',String(indice));svg.setAttribute('aria-valuetext',`${formatarData(p.time)}: ${preco(p.close)}`);
    };
    const ocultar=()=>{ponto.setAttribute('hidden','');tooltip.hidden=true;};
    svg.addEventListener('focus',()=>mostrar(indice));svg.addEventListener('blur',ocultar);
    svg.addEventListener('pointermove',(e)=>{const b=svg.getBoundingClientRect();mostrar(Math.round((e.clientX-b.left)/b.width*(h.length-1)));});
    svg.addEventListener('pointerleave',()=>{if(document.activeElement!==svg)ocultar();});
    svg.addEventListener('keydown',(e)=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();mostrar(e.key==='Home'?0:e.key==='End'?h.length-1:indice+(e.key==='ArrowRight'?1:-1));});
}

async function carregarMercadoInicio() {
    if (!usuarioAtual) return;
    const estado=mercadoInicio, sessao=versaoSessao;
    if (estado.pedido) return estado.pedido;
    $('home-market-chart').textContent='Carregando histórico do dólar...';
    estado.pedido=(async()=>{
        try {
            const dados=await consultarCotacoes({par:'USD',dias:90});
            if(estado!==mercadoInicio || sessao!==versaoSessao)return;
            if(!Array.isArray(dados.historico))throw new Error('Histórico indisponível');
            renderizarMercadoInicio(dados.historico);
        } catch {
            if(estado!==mercadoInicio || sessao!==versaoSessao)return;
            $('home-market-chart').textContent='Não foi possível carregar o mercado agora. Use Atualizar para tentar novamente.';
            $('home-market-valor').textContent='--';$('home-market-variacao').textContent='';$('home-market-periodo').textContent='';
        } finally { if(estado===mercadoInicio && sessao===versaoSessao)estado.pedido=null; }
    })();
    return estado.pedido;
}

document.addEventListener('DOMContentLoaded',()=>{
    $('home-market-atualizar').addEventListener('click',carregarMercadoInicio);
});
