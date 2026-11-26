/* EXTRAS.JS: tema claro/escuro e tela Mercado (velas estilo TradingView) */

let graficoMercado = null, velas = null, sma7 = null, sma21 = null;
let versaoMercado = 0;
const cssVar = (nome) => getComputedStyle(document.body).getPropertyValue(nome).trim();

function limparMercado() {
    versaoMercado++;
    if (graficoMercado) { velas.setData([]); sma7.setData([]); sma21.setData([]); }
    $('mercado-ultimo').textContent = '--'; $('mercado-var').textContent = '';
    $('cotacao-usd').textContent = $('cotacao-eur').textContent = '--';
    $('cotacao-box').removeAttribute('title');
    $('moedas-grid').replaceChildren();
    limparOscilacao();
}

function aplicarTema(tema) {
    tema = tema === "claro" ? "claro" : "escuro";
    document.documentElement.dataset.tema = tema;
    try { localStorage.setItem("tema", tema); } catch { /* sem storage: tudo bem */ }
    const descricao = tema === "escuro" ? "Ativar tema claro" : "Ativar tema escuro";
    $("btn-tema").setAttribute("aria-label", descricao);
    $("btn-tema").title = descricao;
    document.querySelector('meta[name="theme-color"]').content = cssVar('--color-bg');
    if (graficoMercado) estilizarGrafico();
}

document.addEventListener("DOMContentLoaded", () => {
    let tema = "claro";
    try { tema = localStorage.getItem("tema") || "claro"; } catch { /* usa o padrão */ }
    aplicarTema(tema);

    $("btn-tema").addEventListener("click", () =>
        aplicarTema(document.documentElement.dataset.tema === "escuro" ? "claro" : "escuro"));
    $("mercado-par").addEventListener("change", carregarMercado);
    $("mercado-dias").addEventListener("change", carregarMercado);
});

function estilizarGrafico() {
    graficoMercado.applyOptions({
        layout: { background: { color: cssVar("--color-surface") }, textColor: cssVar("--color-text-muted") },
        grid: { vertLines: { color: cssVar("--color-border") }, horzLines: { color: cssVar("--color-border") } },
        rightPriceScale: { borderColor: cssVar("--color-border") },
        timeScale: { borderColor: cssVar("--color-border") },
    });
    velas.applyOptions({
        upColor: cssVar("--color-green"), downColor: cssVar("--color-red"),
        wickUpColor: cssVar("--color-green"), wickDownColor: cssVar("--color-red"), borderVisible: false,
    });
}

function abrirMercado() {
    if (!window.LightweightCharts) {
        $("mercado-ultimo").textContent = "Gráfico indisponível. Confira a conexão e recarregue a página.";
        return;
    }
    if (!graficoMercado) {
        const el = $("mercado-grafico");
        graficoMercado = LightweightCharts.createChart(el, {
            width: el.clientWidth, height: el.clientHeight || 420,
            localization: { locale: 'pt-BR', priceFormatter: (valor) => valor.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) },
        });
        velas = graficoMercado.addCandlestickSeries({ priceFormat: { type: "price", precision: 4, minMove: 0.0001 } });
        const linha = (cor) => graficoMercado.addLineSeries({ color: cor, lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
        sma7 = linha("#F5A623");
        sma21 = linha("#B07CFF");
        estilizarGrafico();
        new ResizeObserver(() => {
            if (el.clientWidth > 0) graficoMercado.applyOptions({ width: el.clientWidth, height: el.clientHeight });
        }).observe(el);
    }
    carregarMercado();
}

function mediaMovel(h, n) {
    const r = [];
    for (let i = n - 1; i < h.length; i++) {
        let soma = 0;
        for (let j = i - n + 1; j <= i; j++) soma += h[j].close;
        r.push({ time: h[i].time, value: soma / n });
    }
    return r;
}

async function carregarMercado() {
    if (!graficoMercado) return;
    const versao = ++versaoMercado;
    const sessaoMercado = versaoSessao;
    const par = $("mercado-par").value;
    const dias = Number($("mercado-dias").value);
    $("mercado-ultimo").textContent = "Carregando...";
    $("mercado-var").textContent = "";
    limparOscilacao('Carregando variações do câmbio...');

    try {
    const data = await consultarCotacoes({ par, dias });
    if (versao !== versaoMercado || sessaoMercado !== versaoSessao) return;
    if (!data?.historico?.length) {
        velas.setData([]); sma7.setData([]); sma21.setData([]);
        $("mercado-ultimo").textContent = "Não foi possível carregar agora.";
        limparOscilacao('Histórico indisponível para calcular a variação.');
        return;
    }

    const h = data.historico;
    estilizarGrafico();
    renderizarOscilacao(h, par);
    velas.setData(h);
    sma7.setData(mediaMovel(h, 7));
    sma21.setData(mediaMovel(h, 21));
    graficoMercado.timeScale().fitContent();

    const ult = h[h.length - 1];
    const ant = h[h.length - 2] || ult;
    const variacao = ((ult.close - ant.close) / ant.close) * 100;
    $("mercado-ultimo").textContent = ult.close.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 4, maximumFractionDigits: 4 });
    $("mercado-var").className = variacao >= 0 ? "text-green" : "text-red";
    $("mercado-var").textContent = `${variacao >= 0 ? "+" : ""}${variacao.toFixed(2).replace(".", ",")}%`;
    } catch (error) {
        if (versao !== versaoMercado || sessaoMercado !== versaoSessao) return;
        velas.setData([]); sma7.setData([]); sma21.setData([]);
        $("mercado-ultimo").textContent = error.message || "Não foi possível carregar agora.";
        limparOscilacao('Oscilações indisponíveis no momento.');
    }
}
