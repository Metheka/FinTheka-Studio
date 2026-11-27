/* Identificação explícita dos recursos locais, sem alterar o modo hospedado. */
document.addEventListener('DOMContentLoaded', () => {
  if (!window.APP_CONFIG?.LOCAL_BACKEND) return;
  const aviso = document.createElement('p');
  aviso.className = 'local-status';
  aviso.textContent = 'Modo local · Dados salvos neste computador · Câmbio de exemplo · Assistente por regras, sem IA externa';
  document.body.prepend(aviso);
  document.body.classList.add('modo-local');
  document.querySelector('.auth__intro').textContent = 'Modo local. Crie sua conta para começar; não precisa confirmar e-mail.';
  document.querySelector('.sidebar__cotacao-title').textContent = 'Câmbio · exemplo em reais';
  document.querySelector('.insights__aviso').textContent = 'A análise local calcula os totais de até 200 lançamentos recentes e oferece orientações por regras. Não envia dados a provedores e não usa inteligência artificial.';
  const sobre = document.querySelector('.chat-about');
  sobre.querySelector('h3').textContent = 'Assistente local';
  const textos = sobre.querySelectorAll('p');
  textos[0].textContent = 'Neste modo, as respostas usam cálculos e regras locais. Não há conexão com a Groq nem com outro modelo de IA.';
  textos[1].textContent = 'Os totais vêm de até 200 lançamentos recentes da sua conta. A conversa fica apenas nesta sessão e é apagada ao trocar de conta.';
  textos[2].textContent = 'As cotações e os gráficos de mercado são exemplos simulados para demonstração; não representam preços atuais.';
});
