/* =============================================================
    FIN THEKA STUDIO — AUTOMAC.JS (versão corrigida)
    Comportamentos interativos do dashboard, conectados
    ao Supabase (Auth, banco com RLS e Edge Functions).

    Índice:
    1.  Configuração da API
    2.  Navegação entre telas (views)
    3.  Transações: carregar e renderizar
    4.  Toggle "Pago?" / excluir / nova transação
    6.  Relatórios (por categoria e por cliente)
    7.  Contatos
    8.  Estatísticas (grid de moedas)
    9.  Importações (CSV)
    10. Investimentos (calculadora + gráfico)
    11. Insight com IA
    --  Cotação USD/EUR
    12. Utilitários de formatação
   ============================================================= */

// (a API agora é o Supabase: veja Auth.js)

// Guarda a última lista de transações carregada, pra outras telas
// (relatórios, contatos, início) reaproveitarem sem pedir de novo.
let transacoesCache = [];
let erroCargaTransacoes = '';
let versaoTransacoes = 0;
let paginaTransacoes = 1;
let transacoesFiltradas = [];
const TAMANHO_PAGINA = 20;

document.addEventListener("DOMContentLoaded", () => {
    ativarNavegacao();
    ativarBotaoNovaTransacao();
    ativarBotaoInsight();
    ativarBotaoAtualizarCotacoes();
    ativarImportacaoCsv();
    ativarCalculadoraInvestimento();
    ativarFiltros();

    ativarAuth(); // carrega os dados depois do login
});


/* =============================================================
    2. NAVEGAÇÃO ENTRE TELAS (VIEWS)
   ============================================================= */

const TITULOS_VIEW = {
    inicio: "Visão geral",
    transacoes: "Transações",
    relatorios: "Relatórios",
    contatos: "Contatos",
    estatisticas: "Cotações",
    importacoes: "Importações",
    investimentos: "Simulador",
    admin: "Administração",
    mercado: "Mercado",
    porquinho: "Porquinho",
    ia: "Assistente IA",
};

function ativarNavegacao() {
    const links = document.querySelectorAll(".sidebar__link[data-view]");
    const fecharMenu = () => {
        const estavaAberto = document.body.classList.contains("menu-aberto");
        document.body.classList.remove("menu-aberto");
        $("btn-menu").setAttribute("aria-expanded", "false");
        $("menu-fundo").hidden = true;
        if (estavaAberto) $("btn-menu").focus({ preventScroll: true });
    };
    $("btn-menu").addEventListener("click", () => {
        const aberto = !document.body.classList.contains("menu-aberto");
        document.body.classList.toggle("menu-aberto", aberto);
        $("btn-menu").setAttribute("aria-expanded", String(aberto));
        $("menu-fundo").hidden = !aberto;
        if (aberto) document.querySelector('.sidebar__link--active')?.focus();
    });
    $("menu-fundo").addEventListener("click", fecharMenu);
    document.addEventListener("keydown", (e) => {
        if (!document.body.classList.contains("menu-aberto")) return;
        if (e.key === "Escape") { e.preventDefault(); fecharMenu(); }
        if (e.key === "Tab") {
            const focaveis = [...document.querySelectorAll('.sidebar a[href], .sidebar input, .sidebar button')].filter((el) => !el.hidden && el.offsetParent !== null && !el.disabled);
            const primeiro = focaveis[0], ultimo = focaveis[focaveis.length - 1];
            if (e.shiftKey && (document.activeElement === primeiro || !document.activeElement.closest('.sidebar'))) { e.preventDefault(); ultimo?.focus(); }
            else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro?.focus(); }
        }
    });

    links.forEach((link) => {
        link.addEventListener("click", (evento) => {
            evento.preventDefault();
            const view = link.dataset.view;
            irParaView(view, link);
            fecharMenu();
            window.scrollTo({ top: 0, behavior: "instant" });
            $("topbar-titulo").setAttribute("tabindex", "-1");
            $("topbar-titulo").focus({ preventScroll: true });
        });
    });
}

function irParaView(view, linkClicado) {
    if (view === "admin" && usuarioAtual?.papel !== "admin") return;
    if (!document.querySelector(`.view[data-view-content="${view}"]`)) return;
    document.body.dataset.view = view;
    document.querySelector('meta[name="theme-color"]').content = getComputedStyle(document.body).getPropertyValue('--color-bg').trim();
    linkClicado ||= document.querySelector(`.sidebar__link[data-view="${view}"]`);
    // Só marca como ativo o item de menu que a pessoa realmente clicou
    // (evita marcar "Página inicial" e "Transações" juntos, já que
    // as duas levam pra mesma tela).
    document.querySelectorAll(".sidebar__link[data-view]").forEach((link) => {
        link.classList.toggle("sidebar__link--active", link === linkClicado);
        if (link === linkClicado) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
    });

    document.querySelectorAll(".view").forEach((secao) => {
        secao.classList.toggle("view--active", secao.dataset.viewContent === view);
    });
    document.querySelectorAll('.mobile-nav a').forEach((link) => {
        if (link.dataset.openView === view) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
    });

    document.getElementById("topbar-titulo").textContent = TITULOS_VIEW[view] || "FinTheka Studio";
    document.title = `${TITULOS_VIEW[view] || 'FinTheka'} · FinTheka Studio`;
    if (!emRecuperacao) history.replaceState(null, '', `#${view}`);

    // Carrega dados sob demanda quando a pessoa entra em cada tela
    if (view === "estatisticas") carregarMoedas();
    if (view === "relatorios") renderizarRelatorios(transacoesCache);
    if (view === "contatos") renderizarContatos(transacoesCache);
    if (view === "admin") carregarAdmin();
    if (view === "mercado") abrirMercado();
    if (view === "porquinho") carregarCofrinhos();
    if (view === "inicio") carregarMercadoInicio();
}


/* =============================================================
    3. TRANSAÇÕES: CARREGAR E RENDERIZAR
   ============================================================= */

async function carregarTransacoes() {
    const usuarioId = usuarioAtual?.id;
    if (!usuarioId) return;
    const versao = ++versaoTransacoes;
    const sessao = versaoSessao;

    try {
        // Paginação: o PostgREST limita respostas; não truncar saldos após 1.000 linhas.
        const transacoes = [];
        for (let inicio = 0; ; inicio += 500) {
            const { data, error } = await sb.from("transacoes").select("*")
                .eq("usuario_id", usuarioId).order("data", { ascending: false })
                .order("id", { ascending: false }).range(inicio, inicio + 499);
            if (error) throw error;
            if (versao !== versaoTransacoes || sessao !== versaoSessao) return;
            if (transacoes.length + data.length > 10000) throw Object.assign(new Error('Limite de histórico'), { code: 'LIMITE_HISTORICO' });
            transacoes.push(...data.map(doBanco));
            if (data.length < 500) break;
        }
        transacoesCache = transacoes;
        erroCargaTransacoes = '';
        atualizarFiltroCategorias();
        if ($('transacao-dialog').open) renderizarCategoriasFormulario();

        aplicarFiltros();
        renderizarPainel(transacoes);
        renderizarRelatorios(transacoes);
        renderizarContatos(transacoes);
    } catch (erro) {
        if (versao !== versaoTransacoes || sessao !== versaoSessao) return;
        console.error(erro);
        const aviso = erro?.code === 'LIMITE_HISTORICO' ? 'Histórico acima do limite de 10.000 transações. Procure o suporte para organizar seus registros.' : '';
        // Uma falha de atualização invalida também filtros, totais e relatórios.
        // Dados antigos não podem reaparecer como se a consulta tivesse funcionado.
        transacoesCache = [];
        erroCargaTransacoes = aviso || 'Não foi possível carregar as transações. Tente de novo em instantes.';
        atualizarFiltroCategorias();
        aplicarFiltros();
        renderizarRelatorios([]);
        renderizarContatos([]);
        falhaPainel(aviso);
    }
}

function renderizarTransacoes(transacoes) {
    const corpoTabela = document.getElementById("tabela-corpo");
    corpoTabela.innerHTML = "";
    if (erroCargaTransacoes) {
        corpoTabela.innerHTML = `<tr><td colspan="8">${escaparHtml(erroCargaTransacoes)}</td></tr>`;
        $('paginacao-info').textContent = 'Histórico indisponível';
        $('pagina-anterior').disabled = $('proxima-pagina').disabled = true;
        return;
    }
    const paginas = Math.max(1, Math.ceil(transacoes.length / TAMANHO_PAGINA));
    paginaTransacoes = Math.min(paginaTransacoes, paginas);
    const inicio = (paginaTransacoes - 1) * TAMANHO_PAGINA;
    $("paginacao-info").textContent = transacoes.length ? `${inicio + 1}–${Math.min(inicio + TAMANHO_PAGINA, transacoes.length)} de ${transacoes.length} transações` : '0 transações';
    $("pagina-anterior").disabled = paginaTransacoes <= 1;
    $("proxima-pagina").disabled = paginaTransacoes >= paginas;

    if (transacoes.length === 0) {
        corpoTabela.innerHTML = `<tr><td colspan="8"><div class="empty-state">${icone('transactions')}Nenhuma transação para mostrar.<p>Adicione um movimento ou ajuste os filtros para consultar seu histórico.</p></div></td></tr>`;
        return;
    }

    transacoes.slice(inicio, inicio + TAMANHO_PAGINA).forEach((t) => {
        const linha = document.createElement("tr");
        linha.dataset.id = t.id;

        // Tudo que vem do usuário/banco passa por escaparHtml antes de ir pro innerHTML
        linha.innerHTML = `
            <td><input type="checkbox" aria-label="Selecionar ${escaparHtml(t.descricao)}"> ${formatarData(t.data)}</td>
            <td>${escaparHtml(t.descricao)}</td>
            <td>${escaparHtml(t.recebidoDe)}</td>
            <td><span class="badge badge--purple">${escaparHtml(t.categoria)}</span></td>
            <td class="${t.valor < 0 ? "text-red" : "text-green"}">${formatarMoeda(t.valor)}</td>
            <td><span class="payment-badge">${iconePagamento(t.tipoPagamento)}<span>${escaparHtml(t.tipoPagamento)}</span></span></td>
            <td><span class="mobile-payment-status">${t.pago ? (t.valor < 0 ? 'Pago' : 'Recebido') : 'Pendente'}</span><span class="toggle ${t.pago ? "toggle--on" : ""}" role="switch" tabindex="0" aria-label="Marcar pagamento de ${escaparHtml(t.descricao)}" aria-checked="${t.pago ? "true" : "false"}"></span></td>
            <td><div class="table-actions"><button type="button" class="table__btn-editar" aria-label="Editar transação">Editar</button><button type="button" class="table__btn-excluir" aria-label="Excluir transação">${icone('trash')}</button></div></td>
        `;

        corpoTabela.appendChild(linha);
    });

    ativarSelecaoDeLinhas();
    ativarToggles();
    ativarBotoesExcluir();
    document.querySelectorAll('.table__btn-editar').forEach((button) => button.addEventListener('click', () => abrirFormularioNovaTransacao(button.closest('tr').dataset.id)));
}

function atualizarResumoTabela(transacoes) {
    if (erroCargaTransacoes) {
        for (const id of ['despesas-pagas', 'despesas-previstas', 'tabela-total', 'total-recebido', 'total-previsto', 'resultado-previsto', 'saldo-atual', 'previsao-mes', 'rodape-valor']) $(id).textContent = '--';
        document.querySelectorAll('.progress--green span, .progress--red span').forEach((barra) => {
            barra.style.width = '0%';
            barra.textContent = '--';
        });
        return;
    }
    // Previsto = tudo que está cadastrado. Recebido = só o que já está marcado como pago.
    const soma = (lista) => lista.reduce((s, t) => s + Math.round(t.valor * 100), 0) / 100;
    const previsto = soma(transacoes);
    const receitas = soma(transacoes.filter((t) => t.valor >= 0));
    const receitasPagas = soma(transacoes.filter((t) => t.valor >= 0 && t.pago));
    const despesas = -soma(transacoes.filter((t) => t.valor < 0));
    const despesasPagas = -soma(transacoes.filter((t) => t.valor < 0 && t.pago));
    $("despesas-pagas").textContent = formatarMoeda(despesasPagas);
    $("despesas-previstas").textContent = formatarMoeda(despesas);

    document.getElementById("tabela-total").textContent = formatarMoeda(previsto);
    document.getElementById("total-recebido").textContent = formatarMoeda(receitasPagas);
    document.getElementById("total-previsto").textContent = formatarMoeda(receitas);
    document.getElementById("resultado-previsto").textContent = formatarMoeda(previsto);
    const saldo = soma(transacoesCache.filter((t) => t.pago));
    document.getElementById("saldo-atual").textContent = formatarMoeda(saldo);
    document.getElementById("previsao-mes").textContent = formatarMoeda(previsto);
    document.getElementById("rodape-valor").textContent = formatarMoeda(saldo);
    for (const [id, valor] of [["resultado-previsto", previsto], ["tabela-total", previsto], ["saldo-atual", saldo]]) {
        $(id).classList.toggle("text-red", valor < 0);
        $(id).classList.toggle("text-green", valor >= 0 && id !== "resultado-previsto");
    }

    // Barra verde de "Recebimentos" (antes ficava fixa em 100%)
    const barra = document.querySelector(".progress--green span");
    if (barra) {
        const porcentagem = receitas > 0 ? Math.min(100, (receitasPagas / receitas) * 100) : 0;
        barra.style.width = `${porcentagem}%`;
        barra.textContent = `${porcentagem.toFixed(2).replace(".", ",")}%`;
    }
    const barraDespesa = document.querySelector(".progress--red span");
    const pct = despesas ? Math.min(100, despesasPagas / despesas * 100) : 0;
    barraDespesa.style.width = `${pct}%`;
    barraDespesa.textContent = `${pct.toFixed(2).replace(".", ",")}%`;
}


/* =============================================================
    4. TOGGLE "PAGO?" / EXCLUIR / NOVA TRANSAÇÃO
   ============================================================= */

function ativarToggles() {
    document.querySelectorAll(".toggle").forEach((toggle) => {
        toggle.addEventListener("click", () => alternarPago(toggle));
        toggle.addEventListener("keydown", (evento) => {
            if (evento.key === "Enter" || evento.key === " ") {
                evento.preventDefault();
                alternarPago(toggle);
            }
        });
    });
}

async function alternarPago(toggle) {
    if (toggle.getAttribute("aria-busy") === "true") return;
    toggle.setAttribute("aria-busy", "true");
    const linha = toggle.closest("tr");
    const id = linha.dataset.id;
    const sessaoPagamento = versaoSessao;

    try {
        const atual = transacoesCache.find((t) => String(t.id) === String(id));
        const { data, error } = await sb.from("transacoes").update({ pago: !atual.pago }).eq("id", id).eq("usuario_id", usuarioAtual.id).select().single();
        if (error) throw error;
        if (sessaoPagamento !== versaoSessao) return;

        const transacaoAtualizada = { pago: data.pago };
        toggle.classList.toggle("toggle--on", transacaoAtualizada.pago);
        toggle.setAttribute("aria-checked", transacaoAtualizada.pago ? "true" : "false");

        // Atualiza o cache e os totais (Recebido / barra de progresso) sem recarregar a tabela
        const emCache = transacoesCache.find((t) => String(t.id) === String(id));
        if (emCache) emCache.pago = transacaoAtualizada.pago;
        aplicarFiltros();
        renderizarPainel(transacoesCache);
        renderizarRelatorios(transacoesCache);
        renderizarContatos(transacoesCache);
        notificar(data.pago ? "Pagamento confirmado." : "Pagamento marcado como pendente.");
    } catch (erro) {
        if (sessaoPagamento !== versaoSessao) return;
        console.error(erro);
        alert(mensagemGravacao(erro, "Não foi possível atualizar o status de pagamento."));
    } finally {
        toggle.removeAttribute("aria-busy");
    }
}

function ativarBotoesExcluir() {
    document.querySelectorAll(".table__btn-excluir").forEach((botao) => {
        botao.addEventListener("click", async () => {
            const linha = botao.closest("tr");
            const id = linha.dataset.id;
            const sessaoExclusao = versaoSessao;
            const usuarioId = usuarioAtual?.id;
            if (!usuarioId) return;

            if (!confirm("Excluir esta transação?")) return;
            if (botao.disabled) return;
            botao.disabled = true;

            try {
                const { error } = await sb.from("transacoes").delete().eq("id", id).eq("usuario_id", usuarioId).select("id").single();
                if (sessaoExclusao !== versaoSessao) return;
                if (error) throw error;
                await carregarTransacoes();
                if (sessaoExclusao === versaoSessao) notificar("Transação excluída.");
            } catch (erro) {
                if (sessaoExclusao !== versaoSessao) return;
                console.error(erro);
                alert("Não foi possível excluir a transação.");
            } finally {
                botao.disabled = false;
            }
        });
    });
}

function ativarSelecaoDeLinhas() {
    document.querySelectorAll(".table tbody input[type='checkbox']").forEach((checkbox) => {
        checkbox.addEventListener("change", () => {
            const linha = checkbox.closest("tr");
            linha.classList.toggle("table__row--selected", checkbox.checked);
        });
    });
}

function ativarBotaoNovaTransacao() {
    ativarCategoriasFormulario();
    ativarPagamentosFormulario();
    const botoes = [
        document.getElementById("btn-nova-transacao"),
        document.getElementById("btn-nova-transacao-2"),
    ].filter(Boolean);

    botoes.forEach((botao) => botao.addEventListener("click", () => abrirFormularioNovaTransacao()));
    const dialog = $("transacao-dialog");
    const form = $("transacao-form");
    let salvando = null;
    $("transacao-cancelar").addEventListener("click", () => dialog.close());
    dialog.addEventListener("cancel", (e) => { if (salvando === versaoSessao) e.preventDefault(); });
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!usuarioAtual || salvando === versaoSessao || !form.reportValidity()) return;
        if (!$('categoria-editor').hidden) {
            $('categoria-erro').textContent = 'Use a nova categoria ou cancele sua criação antes de salvar.';
            $('categoria-nova-nome').focus();
            return;
        }
        const sessaoFormulario = versaoSessao;
        const campos = Object.fromEntries(new FormData(form));
        const idEdicao = form.dataset.transacaoId || null;
        const dono = usuarioAtual.id;
        const valor = converterValor(campos.valor);
        if (!Number.isFinite(valor) || valor <= 0) {
            $("transacao-erro").textContent = "Digite um valor positivo com até duas casas decimais.";
            return;
        }
        salvando = sessaoFormulario;
        form.querySelectorAll("button").forEach((b) => { b.disabled = true; });
        try {
            const dados = { ...campos, valor: campos.tipo === "despesa" ? -valor : valor };
            if (idEdicao) {
                const linha = validarTransacao(dados);
                const { error } = await sb.from('transacoes').update({ ...linha, pago: campos.pago === 'on' }).eq('id', idEdicao).eq('usuario_id', dono).select('id').single();
                if (error) throw error;
            } else await criarTransacao(dados);
            if (sessaoFormulario !== versaoSessao) return;
            dialog.close();
            await carregarTransacoes();
            if (sessaoFormulario === versaoSessao) notificar(idEdicao ? 'Transação atualizada.' : 'Transação adicionada.');
        } catch (erro) {
            if (sessaoFormulario !== versaoSessao) return;
            $("transacao-erro").textContent = mensagemGravacao(erro, "Não foi possível salvar. Confira a conexão antes de tentar novamente.");
        } finally {
            if (salvando === sessaoFormulario) salvando = null;
            if (sessaoFormulario === versaoSessao) form.querySelectorAll("button").forEach((b) => { b.disabled = false; });
        }
    });
}

async function abrirFormularioNovaTransacao(id = null) {
    if (!usuarioAtual) return;
    const atual = id ? transacoesCache.find((t) => String(t.id) === String(id)) : null;
    if (id && !atual) return;
    const form = $("transacao-form");
    form.reset();
    delete form.dataset.transacaoId;
    form.elements.tipoPagamento.querySelectorAll('[data-legado]').forEach((o) => o.remove());
    $('transacao-titulo').textContent = atual ? 'Editar transação' : 'Nova transação';
    form.elements.tipo.value = atual?.valor < 0 ? 'despesa' : 'receita';
    form.elements.data.value = atual?.data || dataLocal();
    prepararCategoriasFormulario();
    if (atual) {
        form.dataset.transacaoId = String(atual.id);
        form.elements.descricao.value = atual.descricao;
        form.elements.valor.value = Math.abs(atual.valor).toFixed(2).replace('.', ',');
        form.elements.recebidoDe.value = atual.recebidoDe;
        form.elements.pago.checked = atual.pago;
        if (![...form.elements.tipoPagamento.options].some((o) => o.value === atual.tipoPagamento)) {
            const option = new Option(atual.tipoPagamento, atual.tipoPagamento);
            option.dataset.legado = 'true'; form.elements.tipoPagamento.add(option);
        }
        form.elements.tipoPagamento.value = atual.tipoPagamento;
        atualizarPagamentoFormulario();
        selecionarCategoria(atual.categoria);
    }
    $("transacao-erro").textContent = "";
    $("transacao-dialog").showModal();
}

async function criarTransacao(dados) {
    const usuarioId = usuarioAtual?.id;
    if (!usuarioId) throw new Error("Sessão inválida");
    const linha = validarTransacao(dados);
    const { data, error } = await sb.from("transacoes").insert({ ...linha, pago: dados.pago === 'on', usuario_id: usuarioId }).select().single();
    if (error) throw error;
    return doBanco(data);
}


/* =============================================================
    6. RELATÓRIOS (por categoria e por cliente)
   ============================================================= */

function renderizarRelatorios(transacoes) {
    if (erroCargaTransacoes) {
        for (const id of ['relatorio-composicao', 'relatorio-fluxo', 'relatorios-lista', 'relatorios-clientes']) $(id).textContent = 'Dados indisponíveis. Atualize as transações para tentar novamente.';
        return;
    }
    renderizarAnalisesRelatorios(transacoes);
    const listaCategorias = document.getElementById("relatorios-lista");
    const listaClientes = document.getElementById("relatorios-clientes");
    if (!listaCategorias || !listaClientes) return;

    if (transacoes.length === 0) {
        listaCategorias.innerHTML = "<p>Nenhuma transação ainda.</p>";
        listaClientes.innerHTML = "<p>Nenhuma transação ainda.</p>";
        return;
    }

    renderizarAgrupamento(listaCategorias, agruparPor(transacoes, "categoria"));
    renderizarAgrupamento(listaClientes, agruparPor(transacoes, "recebidoDe"));
}

function agruparPor(transacoes, campo) {
    const mapa = Object.create(null);

    transacoes.forEach((t) => {
        const chave = t[campo] || "Não informado";
        mapa[chave] = (mapa[chave] || 0) + Math.round(Number(t.valor || 0) * 100);
    });

    return Object.entries(mapa)
        .map(([nome, total]) => ({ nome, total: total / 100 }))
        .sort((a, b) => b.total - a.total);
}

function renderizarAgrupamento(container, grupos) {
    const maiorValor = grupos.reduce((max, g) => Math.max(max, Math.abs(g.total)), 1);

    container.innerHTML = grupos
        .map((grupo) => {
            const porcentagem = Math.round((Math.abs(grupo.total) / maiorValor) * 100);
            return `
                <div class="report-list__item ${grupo.total < 0 ? 'report-list__item--negative' : ''}">
                    <div class="report-list__row">
                        <span>${escaparHtml(grupo.nome)}</span>
                        <strong>${formatarMoeda(grupo.total)}</strong>
                    </div>
                    <div class="report-list__bar-track">
                        <div class="report-list__bar-fill" style="width: ${porcentagem}%"></div>
                    </div>
                </div>
            `;
        })
        .join("");
}


/* =============================================================
    7. CONTATOS
   ============================================================= */

function renderizarContatos(transacoes) {
    const container = document.getElementById("contatos-lista");
    if (!container) return;
    if (erroCargaTransacoes) {
        container.textContent = 'Dados indisponíveis. Atualize as transações para tentar novamente.';
        return;
    }

    if (transacoes.length === 0) {
        container.innerHTML = "<p>Nenhum contato ainda — cadastre transações pra eles aparecerem aqui.</p>";
        return;
    }

    const mapa = Object.create(null);
    transacoes.forEach((t) => {
        const nome = t.recebidoDe || "Não informado";
        if (!mapa[nome]) mapa[nome] = { total: 0, quantidade: 0 };
        mapa[nome].total += Math.round(Number(t.valor || 0) * 100);
        mapa[nome].quantidade += 1;
    });

    const contatos = Object.entries(mapa)
        .map(([nome, dados]) => ({ nome, ...dados, total: dados.total / 100 }))
        .sort((a, b) => b.total - a.total);

    container.innerHTML = contatos
        .map(
            (c) => `
        <div class="contacts-list__item">
            <div>
                <p class="contacts-list__name">${escaparHtml(c.nome)}</p>
                <p class="contacts-list__meta">${c.quantidade} transação(ões)</p>
            </div>
            <strong class="${c.total < 0 ? 'text-red' : 'text-green'}">${formatarMoeda(c.total)}</strong>
        </div>
    `
        )
        .join("");
}


/* =============================================================
    8. ESTATÍSTICAS (grid de moedas)
   ============================================================= */

function ativarBotaoAtualizarCotacoes() {
    const botao = document.getElementById("btn-atualizar-cotacoes");
    if (botao) botao.addEventListener("click", carregarMoedas);
}

async function carregarMoedas() {
    const sessaoMoedas = versaoSessao;
    const grid = document.getElementById("moedas-grid");
    grid.innerHTML = "<p>Carregando cotações...</p>";

    try {
        const dados = await consultarCotacoes();
        if (sessaoMoedas !== versaoSessao) return;

        if (!dados.moedas || dados.moedas.length === 0) {
            grid.innerHTML = "<p>Nenhuma cotação disponível no momento.</p>";
            return;
        }

        grid.innerHTML = dados.moedas
            .map((moeda) => {
                const variacao = Number(moeda.variacao) || 0;
                const variacaoClasse = variacao >= 0 ? "text-green" : "text-red";
                const variacaoSinal = variacao >= 0 ? "+" : "";
                return `
                <div class="currency-card">
                    <p class="currency-card__codigo">${escaparHtml(moeda.codigo)}</p>
                    <p class="currency-card__nome">${escaparHtml(moeda.nome)}</p>
                    <p class="currency-card__valor">${formatarMoeda(moeda.valor)}</p>
                    <p class="currency-card__variacao ${variacaoClasse}">${variacaoSinal}${variacao}%</p>
                </div>
            `;
            })
            .join("");
    } catch (erro) {
        if (sessaoMoedas !== versaoSessao) return;
        console.error(erro);
        grid.textContent = erro.message || "Não foi possível carregar as cotações agora.";
    }
}


/* =============================================================
    9. IMPORTAÇÕES (CSV)
   ============================================================= */

function ativarImportacaoCsv() {
    const botao = document.getElementById("btn-importar-csv");
    if (!botao) return;

    botao.addEventListener("click", async () => {
        if (botao.disabled || !usuarioAtual) return;
        const sessaoImportacao = versaoSessao;
        const usuarioId = usuarioAtual.id;
        const input = document.getElementById("input-csv");
        const resultado = document.getElementById("importacao-resultado");

        if (!input.files || input.files.length === 0) {
            resultado.className = "import-resultado import-resultado--erro";
            resultado.textContent = "Escolha um arquivo .csv antes de importar.";
            return;
        }

        resultado.className = "import-resultado";
        resultado.textContent = "Importando...";
        if (input.files[0].size > 1000000) {
            resultado.className = "import-resultado import-resultado--erro";
            resultado.textContent = "Arquivo grande demais (máximo 1 MB).";
            return;
        }

        botao.disabled = true;
        const arquivo = input.files[0];
        try {
            // Remove o BOM que o Excel coloca no começo do arquivo
            const texto = (await arquivo.text()).replace(/^\uFEFF/, "");
            if (sessaoImportacao !== versaoSessao) return;
            const linhas = lerCsv(texto);

            if (linhas.length > 501) {
                resultado.className = "import-resultado import-resultado--erro";
                resultado.textContent = "Máximo de 500 linhas por arquivo.";
                return;
            }

            const registros = [];
            let ignoradas = 0;

            for (const linha of linhas) {
                const [data, descricao, recebidoDe, categoria, valor, tipoPagamento] = linha;

                // Pula a linha de cabeçalho (data,descricao,...)
                if ((data || "").toLowerCase() === "data") {
                    ignoradas += 1;
                    continue;
                }

                const dataISO = normalizarData(data);
                const valorNumero = converterValor(valor);

                if (!dataISO || !descricao || Number.isNaN(valorNumero)) {
                    throw new Error(`Linha ${registros.length + ignoradas + 1}: data, descrição ou valor inválido.`);
                }

                if (linha.length !== 6) throw new Error("Cada registro precisa ter exatamente seis colunas.");
                registros.push(validarTransacao({
                        data: dataISO,
                        descricao,
                        recebidoDe: recebidoDe || "",
                        categoria: categoria || "Outros",
                        valor: valorNumero,
                        tipoPagamento: tipoPagamento || "Única",
                    }));
            }
            if (!registros.length) throw new Error("O arquivo não contém transações.");
            if (registros.length > 500) throw new Error("Máximo de 500 transações por arquivo.");
            // Uma única operação: todos os registros entram ou nenhum é salvo.
            const { error } = await sb.from("transacoes").insert(registros.map((registro) => ({ ...registro, usuario_id: usuarioId })));
            if (sessaoImportacao !== versaoSessao) return;
            if (error) throw new Error(mensagemGravacao(error, "Falha ao importar. Confira a conexão e o histórico antes de reenviar o arquivo."));

            const avisoCabecalho = ignoradas > 0 ? " (cabeçalho ignorado)" : "";
            resultado.className = "import-resultado import-resultado--sucesso";
            resultado.textContent = `Importação concluída: ${registros.length} transação(ões) importada(s)${avisoCabecalho}.`;
            input.value = "";

            await carregarTransacoes();
        } catch (erro) {
            if (sessaoImportacao !== versaoSessao) return;
            console.error(erro);
            resultado.className = "import-resultado import-resultado--erro";
            resultado.textContent = erro.message || "Não foi possível ler o arquivo CSV.";
        } finally {
            if (sessaoImportacao === versaoSessao) botao.disabled = false;
        }
    });
}

// Aceita "2026-05-10" ou "10/05/2026". Devolve "AAAA-MM-DD" ou null se for inválida.
function normalizarData(texto) {
    const t = String(texto || "").trim();
    const br = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const iso = br ? `${br[3]}-${br[2]}-${br[1]}` : t;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || iso < "0001-01-01") return null;
    const date = new Date(`${iso}T12:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
}


/* =============================================================
    10. INVESTIMENTOS (calculadora + gráfico)
   ============================================================= */

// O simulador usa o motor independente em SimuladorCore.js e a interface em Simulador.js.

/* =============================================================
    11. INSIGHT COM IA
   ============================================================= */

function ativarBotaoInsight() {
    const botao = document.getElementById("btn-gerar-insight");
    if (botao) botao.addEventListener("click", gerarInsight);
}

async function gerarInsight() {
    const botao = document.getElementById("btn-gerar-insight");
    const paragrafo = document.getElementById("insight-texto");

    if (botao.disabled) return;
    const sessaoInsight = versaoSessao;
    botao.disabled = true;
    botao.setAttribute("aria-busy", "true");
    botao.textContent = "Gerando...";
    paragrafo.classList.remove("insights__texto--erro");
    paragrafo.textContent = "Analisando suas transações...";

    try {
        const { data: dados, error } = await sb.functions.invoke(window.APP_CONFIG?.INSIGHTS_FUNCTION || 'insights');
        if (sessaoInsight !== versaoSessao) return;
        if (error) throw new Error(await mensagemFuncao(error, "Não foi possível gerar o insight agora."));
        if (!dados?.insight) throw new Error("O serviço de IA não retornou uma resposta.");

        paragrafo.textContent = dados.insight;
    } catch (erro) {
        if (sessaoInsight !== versaoSessao) return;
        console.error(erro);
        paragrafo.classList.add("insights__texto--erro");
        paragrafo.textContent = `Erro: ${erro.message}`;
    } finally {
        if (sessaoInsight === versaoSessao) {
            botao.disabled = false;
            botao.removeAttribute("aria-busy");
            botao.innerHTML = `${icone('sparkles')} Gerar insight`;
        }
    }
}


/* =============================================================
    COTAÇÃO USD/EUR (sidebar + mini cotação da página inicial)
   ============================================================= */

async function carregarCotacao() {
    const sessaoCotacao = versaoSessao;
    const elUsd = document.getElementById("cotacao-usd");
    const elEur = document.getElementById("cotacao-eur");

    try {
        const dados = await consultarCotacoes();
        if (sessaoCotacao !== versaoSessao) return;
        elUsd.textContent = formatarMoeda(dados.usd);
        elEur.textContent = formatarMoeda(dados.eur);
    } catch (erro) {
        if (sessaoCotacao !== versaoSessao) return;
        console.error(erro);
        elUsd.textContent = "--";
        elEur.textContent = "--";
        $("cotacao-box").title = erro.message || "Cotações indisponíveis";
    }
}


/* =============================================================
    12. UTILITÁRIOS DE FORMATAÇÃO
   ============================================================= */

// Evita que texto digitado/importado (ex: "<img onerror=...>") vire HTML de verdade
function escaparHtml(texto) {
    return String(texto ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function mensagemGravacao(erro, padrao) {
    return erro?.code === '54000'
        ? 'Limite de armazenamento ou de gravações atingido. Aguarde antes de tentar novamente; se o limite de registros foi alcançado, libere espaço.'
        : padrao;
}

// Aceita "1500.50", "1500,50" e "1.500,50". Devolve NaN se não for número.
function converterValor(texto) {
    let t = String(texto ?? "").trim();
    if (t === "") return NaN;

    if (t.includes(",")) {
        if (!/^[-+]?(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}$/.test(t)) return NaN;
        t = t.replace(/\./g, "").replace(",", ".");
    }
    return /^[-+]?\d+(\.\d{1,2})?$/.test(t) && Number.isFinite(Number(t)) ? Number(t) : NaN;
}

function formatarMoeda(valor) {
    const numero = Number(valor);
    if (!Number.isFinite(numero)) return "R$ --";
    return (Math.abs(numero) < .005 ? 0 : numero).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(dataISO) {
    if (typeof dataISO !== "string") return "--";
    const [ano, mes, dia] = dataISO.split("-");
    if (!ano || !mes || !dia) return escaparHtml(dataISO);
    return escaparHtml(`${dia}/${mes}/${ano}`);
}

/* ===== Helpers do Supabase ===== */
function doBanco(l) {
    return { id: l.id, data: l.data, descricao: l.descricao, recebidoDe: l.recebido_de, categoria: l.categoria, valor: Number(l.valor), tipoPagamento: l.tipo_pagamento, pago: l.pago };
}

function validarTransacao(d) {
    const t = (v, max) => {
        const texto = String(v ?? "").trim();
        if (texto.length > max) throw new Error(`Campo excede ${max} caracteres.`);
        return texto;
    };
    const valor = Number(d.valor);
    if (!normalizarData(d.data) || !t(d.descricao, 200) || !Number.isFinite(valor) || Math.abs(Math.round(valor * 100) / 100) >= 1e11) {
        throw new Error("Dados inválidos");
    }
    return {
        data: normalizarData(d.data), descricao: t(d.descricao, 200), recebido_de: t(d.recebidoDe, 120),
        categoria: t(d.categoria, 60) || "Outros", valor: Math.round(valor * 100) / 100,
        tipo_pagamento: t(d.tipoPagamento, 60) || "Única",
    };
}

function dataLocal(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function ativarFiltros() {
    for (const [id, passo] of [["pagina-anterior", -1], ["proxima-pagina", 1]]) {
        $(id).addEventListener("click", () => {
            paginaTransacoes += passo;
            renderizarTransacoes(transacoesFiltradas);
        });
    }
    ["filtro-periodo", "filtro-status", "filtro-tipo", "filtro-categoria"].forEach((id) => $(id).addEventListener("change", aplicarFiltros));
    ["busca-topo", "busca-lateral"].forEach((id) => $(id).addEventListener("input", (e) => {
        $("busca-topo").value = $("busca-lateral").value = e.target.value;
        aplicarFiltros();
    }));
    $("btn-recarregar").addEventListener("click", async (e) => {
        e.currentTarget.disabled = true;
        try { await carregarTransacoes(); } finally { $("btn-recarregar").disabled = false; }
    });
    $("btn-ajuda").addEventListener("click", () => $("help-dialog").showModal());
}

function aplicarFiltros() {
    const busca = $("busca-topo").value.trim().toLocaleLowerCase("pt-BR");
    const mes = dataLocal().slice(0, 7);
    const status = $("filtro-status").value;
    const tipo = $("filtro-tipo").value;
    const lista = transacoesCache.filter((t) =>
        ($("filtro-periodo").value !== "mes" || t.data.startsWith(mes)) &&
        (status === "todos" || t.pago === (status === "pago")) &&
        (tipo === "todos" || (tipo === "receitas" ? t.valor >= 0 : t.valor < 0)) &&
        (!$('filtro-categoria').value || t.categoria === $('filtro-categoria').value) &&
        [t.descricao, t.recebidoDe, t.categoria].some((v) => String(v).toLocaleLowerCase("pt-BR").includes(busca)));
    paginaTransacoes = 1;
    transacoesFiltradas = lista;
    renderizarTransacoes(lista);
    atualizarResumoTabela(lista);
}

// CSV com delimitador fixo por arquivo, campos entre aspas e quebras de linha.
function lerCsv(texto) {
    const primeira = texto.split(/\r?\n/, 1)[0];
    let aspas = false, virgulas = 0, pontos = 0;
    for (const c of primeira) {
        if (c === '"') aspas = !aspas;
        else if (!aspas && c === ",") virgulas++;
        else if (!aspas && c === ";") pontos++;
    }
    const sep = pontos > virgulas ? ";" : ",";
    const linhas = [];
    let linha = [], campo = "", emAspas = false, fechado = false;
    const salvarCampo = () => { linha.push(campo.trim()); campo = ""; fechado = false; };
    for (let i = 0; i < texto.length; i++) {
        const c = texto[i];
        if (emAspas) {
            if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
            else if (c === '"') { emAspas = false; fechado = true; }
            else campo += c;
        } else if (c === '"' && !campo.trim() && !fechado) { campo = ""; emAspas = true; }
        else if (c === sep) salvarCampo();
        else if (c === "\n" || c === "\r") {
            if (c === "\r" && texto[i + 1] === "\n") i++;
            salvarCampo();
            if (linha.some(Boolean)) linhas.push(linha);
            linha = [];
        } else if (c === '"' || (fechado && c.trim())) throw new Error("CSV com aspas inválidas.");
        else campo += c;
    }
    if (emAspas) throw new Error("CSV com aspas não fechadas.");
    salvarCampo();
    if (linha.some(Boolean)) linhas.push(linha);
    return linhas;
}

const cacheCotacoes = new Map();
async function consultarCotacoes(body) {
    const chave = JSON.stringify(body || {});
    const hit = cacheCotacoes.get(chave);
    if (hit && hit.ate > Date.now()) return hit.promise;
    const promise = (async () => {
        const { data, error } = await sb.functions.invoke("cotacoes", body ? { body } : undefined);
        if (error) throw new Error(await mensagemFuncao(error, "Cotações indisponíveis. Tente mais tarde."));
        if (!data || data.erro) throw new Error(data?.erro || "Resposta de cotações inválida.");
        return data;
    })();
    cacheCotacoes.set(chave, { ate: Date.now() + 60000, promise });
    // Também mantém falhas por um minuto para evitar repetir chamadas limitadas.
    return await promise;
}

async function mensagemFuncao(error, padrao) {
    const status = error.context?.status;
    if (status === 404) return "Este serviço ainda não foi publicado. Tente novamente mais tarde.";
    if (status === 401) return "Sessão inválida. Saia e entre novamente.";
    try {
        const body = await error.context?.clone().json();
        if (body?.erro) return String(body.erro).slice(0, 240);
    } catch { /* Sem resposta JSON. */ }
    return padrao;
}
