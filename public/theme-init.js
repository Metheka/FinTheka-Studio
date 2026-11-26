// Aplica a preferência antes do primeiro desenho da página.
try {
    document.documentElement.dataset.tema = localStorage.getItem('tema') === 'escuro' ? 'escuro' : 'claro';
} catch { /* O tema claro do HTML funciona sem armazenamento. */ }
