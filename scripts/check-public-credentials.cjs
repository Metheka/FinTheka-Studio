// Verifica os arquivos públicos sem imprimir valores de possíveis segredos.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function chavePublica(chave) {
    if (typeof chave !== 'string' || chave.length > 8192) return false;
    if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(chave)) return true;
    try {
        const partes = chave.split('.');
        return partes.length === 3 && JSON.parse(Buffer.from(partes[1], 'base64url')).role === 'anon';
    } catch { return false; }
}

function contemSegredo(texto) {
    if (/-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----|\bsb_secret_[A-Za-z0-9_-]{15,}|\bgsk_[A-Za-z0-9]{20,}|\bsk-ant-[A-Za-z0-9_-]{15,}|\bsk-proj-[A-Za-z0-9_-]{20,}|\bAKIA[A-Z0-9]{16}|\bgh[pousr]_[A-Za-z0-9]{20,}/.test(texto)) return true;
    for (const [jwt] of texto.matchAll(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)) {
        try {
            const role = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url')).role;
            if (role === 'service_role' || role === 'authenticated') return true;
        } catch { /* Não é um JWT reconhecido. */ }
    }
    return false;
}

function verificarPastaPublica(pasta = path.join(__dirname, '../public')) {
    const contexto = { window: {} };
    // Lê apenas o config.js do próprio projeto, sem acesso ao ambiente/segredos.
    vm.runInNewContext(fs.readFileSync(path.join(pasta, 'config.js'), 'utf8'), contexto, { timeout: 1000 });
    const config = contexto.window.APP_CONFIG;
    if (!config || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.SUPABASE_URL) || !chavePublica(config.SUPABASE_ANON_KEY)) {
        throw new Error('Configuração pública inválida: use HTTPS e uma chave publishable ou anon. Nenhum valor foi exibido.');
    }
    function visitar(diretorio) {
        for (const nome of fs.readdirSync(diretorio)) {
            const arquivo = path.join(diretorio, nome), info = fs.lstatSync(arquivo);
            if (info.isSymbolicLink()) throw new Error(`Link simbólico não permitido na pasta pública: ${path.relative(pasta, arquivo)}`);
            if (info.isDirectory()) { visitar(arquivo); continue; }
            if (info.isFile() && contemSegredo(fs.readFileSync(arquivo, 'utf8'))) {
                throw new Error(`Possível credencial privada em ${path.relative(pasta, arquivo)}. Publicação bloqueada; nenhum valor foi exibido.`);
            }
        }
    }
    visitar(pasta);
}

if (require.main === module) {
    try { verificarPastaPublica(); console.log('PASS credenciais públicas: configuração válida e nenhum segredo reconhecido encontrado.'); }
    catch { console.error('FAIL credenciais públicas: configuração inválida ou possível segredo na pasta public. Revise os arquivos antes de publicar. Nenhum valor foi exibido.'); process.exitCode = 1; }
}
module.exports = { chavePublica, contemSegredo, verificarPastaPublica };
