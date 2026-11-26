/* Categorias pertencem às transações da conta; nenhum nome é gravado no navegador. */
const CATEGORIAS_PADRAO = {
    receita: [
        ['Salário', 'wallet'], ['Freelance', 'file'], ['Serviços', 'users'], ['Vendas', 'bag'],
        ['Investimentos', 'growth'], ['Aluguéis', 'home'], ['Reembolsos', 'refresh'],
        ['Presentes', 'gift'], ['Benefícios', 'shield'], ['Outras receitas', 'plus'], ['Outros', 'grid'],
    ],
    despesa: [
        ['Supermercado', 'bag'], ['Restaurantes', 'food'], ['Delivery', 'food'], ['Alimentação', 'food'],
        ['Moradia', 'home'], ['Aluguel', 'home'], ['Água', 'drop'], ['Energia', 'bolt'],
        ['Internet e telefone', 'globe'], ['Transporte', 'car'], ['Combustível', 'car'],
        ['Aplicativos de transporte', 'car'], ['Saúde', 'heart'], ['Farmácia', 'heart'],
        ['Educação', 'book'], ['Lazer', 'sun'], ['Assinaturas', 'calendar'], ['Compras', 'bag'],
        ['Roupas e acessórios', 'bag'], ['Cuidados pessoais', 'heart'], ['Pets', 'paw'],
        ['Viagens', 'globe'], ['Academia e esportes', 'heart'], ['Impostos e taxas', 'file'],
        ['Seguros', 'shield'], ['Dívidas e empréstimos', 'wallet'], ['Presentes e doações', 'gift'],
        ['Casa', 'home'], ['Outros', 'grid'],
    ],
};
let categoriasRascunho = { receita: [], despesa: [] };
let mostrarTodasCategorias = false;

function chaveCategoria(nome) {
    return String(nome).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR');
}

function listarCategorias(tipo, transacoes, extras = []) {
    const categorias = new Map();
    for (const [nome, icone] of CATEGORIAS_PADRAO[tipo] || []) categorias.set(chaveCategoria(nome), { nome, icone, personalizada: false });
    for (const nome of [...transacoes.filter((t) => (t.valor < 0 ? 'despesa' : 'receita') === tipo).map((t) => t.categoria), ...extras]) {
        const texto = String(nome || '').trim();
        const chave = chaveCategoria(texto);
        if (texto && texto.length <= 60 && !categorias.has(chave)) categorias.set(chave, { nome: texto, icone: 'grid', personalizada: true });
    }
    return [...categorias.values()];
}

function selecionarCategoria(nome) {
    const devolverFoco = $('categorias-opcoes').contains(document.activeElement);
    $('transacao-form').elements.categoria.value = nome;
    $('categoria-selecionada').textContent = nome;
    $('categoria-editor').hidden = true;
    $('categoria-nova-nome').value = '';
    $('categoria-busca').value = '';
    renderizarCategoriasFormulario();
    if (devolverFoco) $('categorias-opcoes').querySelector('[aria-pressed="true"]')?.focus();
}

function renderizarCategoriasFormulario() {
    const form = $('transacao-form');
    const tipo = form.elements.tipo.value;
    const busca = chaveCategoria($('categoria-busca').value);
    const categorias = listarCategorias(tipo, transacoesCache, categoriasRascunho[tipo]);
    const filtradas = categorias.filter((c) => chaveCategoria(c.nome).includes(busca));
    const selecionada = chaveCategoria(form.elements.categoria.value);
    // Mantém a seleção acessível mesmo quando está além das primeiras sugestões.
    let visiveis = filtradas;
    if (!busca && !mostrarTodasCategorias) {
        const ordenadas = [...filtradas.filter((c) => c.personalizada), ...filtradas.filter((c) => !c.personalizada)];
        visiveis = ordenadas.slice(0, 8);
        const ativa = filtradas.find((c) => chaveCategoria(c.nome) === selecionada);
        if (ativa && !visiveis.includes(ativa)) visiveis = [...visiveis.slice(0, 7), ativa];
    }
    const fragmento = document.createDocumentFragment();
    for (const categoria of visiveis) {
        const botao = document.createElement('button');
        botao.type = 'button';
        botao.className = 'category-choice';
        botao.dataset.cor = ({ food: 'laranja', bag: 'ambar', home: 'violeta', heart: 'rosa', car: 'violeta', drop: 'verde', bolt: 'ambar', wallet: 'verde', growth: 'verde', gift: 'rosa', book: 'violeta', paw: 'laranja', globe: 'verde', shield: 'violeta', calendar: 'laranja' })[categoria.icone] || 'neutro';
        botao.setAttribute('aria-pressed', String(chaveCategoria(categoria.nome) === selecionada));
        // Ícones são constantes do catálogo; nomes privados são sempre texto.
        botao.innerHTML = icone(categoria.icone);
        const texto = document.createElement('span');
        texto.textContent = categoria.nome;
        botao.append(texto);
        botao.addEventListener('click', () => selecionarCategoria(categoria.nome));
        fragmento.append(botao);
    }
    $('categorias-opcoes').replaceChildren(fragmento);
    $('categoria-vazia').hidden = filtradas.length > 0;
    $('categorias-expandir').hidden = Boolean(busca) || categorias.length <= 8;
    $('categorias-expandir').textContent = mostrarTodasCategorias ? 'Mostrar menos' : `Ver todas (${categorias.length})`;
    $('categorias-expandir').setAttribute('aria-expanded', String(mostrarTodasCategorias));
}

function atualizarTipoFormulario() {
    const form = $('transacao-form');
    const despesa = form.elements.tipo.value === 'despesa';
    $('transacao-dialog').dataset.tipo = despesa ? 'despesa' : 'receita';
    $('transacao-contato-label').textContent = despesa ? 'Pago para' : 'Recebido de';
    $('transacao-status-label').textContent = despesa ? 'Já foi pago' : 'Já foi recebido';
    form.elements.descricao.placeholder = despesa ? 'Ex.: compras do supermercado' : 'Ex.: salário ou pagamento de um projeto';
    $('categoria-busca').value = '';
    mostrarTodasCategorias = false;
    selecionarCategoria('Outros');
}

function prepararCategoriasFormulario() {
    mostrarTodasCategorias = false;
    $('categoria-editor').hidden = true;
    $('categoria-erro').textContent = '';
    $('categoria-nova-nome').value = '';
    atualizarTipoFormulario();
    atualizarPagamentoFormulario();
}

function reiniciarCategoriasFormulario() {
    categoriasRascunho = { receita: [], despesa: [] };
    $('filtro-categoria').value = '';
    atualizarFiltroCategorias();
    prepararCategoriasFormulario();
}

function atualizarFiltroCategorias() {
    const select = $('filtro-categoria');
    const selecionada = select.value;
    const nomes = [...new Set(transacoesCache.map((t) => t.categoria))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    select.replaceChildren();
    for (const nome of ['', ...nomes]) {
        const option = document.createElement('option');
        option.value = nome;
        option.textContent = nome || 'Todas as categorias';
        select.append(option);
    }
    select.value = nomes.includes(selecionada) ? selecionada : '';
}

function ativarCategoriasFormulario() {
    const form = $('transacao-form');
    form.elements.tipo.addEventListener('change', atualizarTipoFormulario);
    $('categoria-busca').addEventListener('input', renderizarCategoriasFormulario);
    $('categorias-expandir').addEventListener('click', () => {
        mostrarTodasCategorias = !mostrarTodasCategorias;
        renderizarCategoriasFormulario();
    });
    $('categoria-criar').addEventListener('click', () => {
        $('categoria-editor').hidden = false;
        $('categoria-nova-nome').value = $('categoria-busca').value.trim();
        $('categoria-erro').textContent = '';
        $('categoria-nova-nome').focus();
    });
    $('categoria-cancelar').addEventListener('click', () => { $('categoria-editor').hidden = true; $('categoria-criar').focus(); });
    const criar = () => {
        const nome = $('categoria-nova-nome').value.trim().replace(/\s+/g, ' ');
        if (!nome || nome.length > 60) { $('categoria-erro').textContent = 'Use um nome de 1 a 60 caracteres.'; return; }
        const tipo = form.elements.tipo.value;
        const existente = listarCategorias(tipo, transacoesCache, categoriasRascunho[tipo]).find((c) => chaveCategoria(c.nome) === chaveCategoria(nome));
        if (!existente) categoriasRascunho[tipo].push(nome);
        selecionarCategoria(existente?.nome || nome);
        $('categorias-opcoes').querySelector('[aria-pressed="true"]')?.focus();
    };
    $('categoria-confirmar').addEventListener('click', criar);
    $('categoria-nova-nome').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); criar(); } });
    $('categoria-busca').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
}
