/* Ilustrações locais de pagamento; não representam uma bandeira vinculada à conta. */
const PAGAMENTOS_VISUAIS = {
    'Pix': ['pix', '<path fill="#21b89a" d="m16 2 8 8-4 4-4-4-4 4-4-4 8-8Zm0 28-8-8 4-4 4 4 4-4 4 4-8 8ZM2 16l6-6 6 6-6 6-6-6Zm28 0-6 6-6-6 6-6 6 6Z"/>'],
    'Cartão de crédito': ['credito', '<rect x="1" y="5" width="30" height="22" rx="5" fill="#38343f"/><rect x="5" y="10" width="7" height="6" rx="1.5" fill="#edcc81"/><path d="M5 21h7" stroke="#bbb5c9" stroke-width="2" stroke-linecap="round"/><circle cx="21" cy="20" r="4" fill="#ef655b"/><circle cx="26" cy="20" r="4" fill="#f7b447" fill-opacity=".92"/>'],
    'Cartão de débito': ['debito', '<rect x="1" y="5" width="30" height="22" rx="5" fill="#7560b7"/><rect x="1" y="10" width="30" height="4" fill="#c5b6ee"/><path d="M5 22h7" stroke="#ede5ff" stroke-width="2" stroke-linecap="round"/><circle cx="22" cy="21" r="3.5" fill="#f18e88"/><circle cx="26" cy="21" r="3.5" fill="#f3c467" fill-opacity=".94"/>'],
    'Dinheiro': ['dinheiro', '<rect x="1" y="6" width="30" height="20" rx="4" fill="#339c6a"/><rect x="5" y="10" width="22" height="12" rx="2" stroke="#b5edc9" fill="none"/><circle cx="16" cy="16" r="4" fill="#b5edc9"/><path d="M16 14v4" stroke="#24734e" stroke-width="2"/>'],
    'Transferência bancária': ['transferencia', '<rect x="1" y="3" width="30" height="26" rx="7" fill="#b28bde" fill-opacity=".22"/><path d="M7 11h18l-5-5M25 21H7l5 5" stroke="#a477d1" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>'],
    'Boleto': ['boleto', '<rect x="3" y="2" width="26" height="28" rx="5" fill="#eae7df"/><path d="M8 9h2v14H8zm4 0h1v14h-1zm3 0h3v14h-3zm5 0h1v14h-1zm3 0h1v14h-1z" fill="#45413c"/>'],
    'Débito automático': ['automatico', '<circle cx="16" cy="16" r="13" fill="#e6aa49" fill-opacity=".2"/><circle cx="16" cy="16" r="9" stroke="#c88e2c" stroke-width="2" fill="none"/><path d="M16 10v7l4 2" stroke="#c88e2c" stroke-width="2" stroke-linecap="round"/>'],
};

function visualPagamento(nome) {
    return Object.hasOwn(PAGAMENTOS_VISUAIS, nome) ? PAGAMENTOS_VISUAIS[nome] : ['outro', '<rect x="2" y="5" width="28" height="22" rx="5" fill="#92928f" fill-opacity=".22"/><path d="M7 12h18M7 21h8" stroke="#92928f" stroke-width="2" stroke-linecap="round"/>'];
}

function iconePagamento(nome) {
    return `<svg class="payment-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">${visualPagamento(nome)[1]}</svg>`;
}

function atualizarPagamentoFormulario() {
    const nome = $('transacao-form').elements.tipoPagamento.value;
    $('pagamento-icone').innerHTML = iconePagamento(nome);
    document.querySelectorAll('[data-payment]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.payment === nome)));
}

function ativarPagamentosFormulario() {
    $('transacao-form').elements.tipoPagamento.addEventListener('change', atualizarPagamentoFormulario);
    for (const button of document.querySelectorAll('[data-payment]')) {
        button.querySelector('.payment-quick__icon').innerHTML = iconePagamento(button.dataset.payment);
        button.addEventListener('click', () => {
            $('transacao-form').elements.tipoPagamento.value = button.dataset.payment;
            atualizarPagamentoFormulario();
        });
    }
    atualizarPagamentoFormulario();
}
