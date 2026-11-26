const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { chavePublica, contemSegredo, verificarPastaPublica } = require('../../scripts/check-public-credentials.cjs');
const codigo = fs.readFileSync(path.join(__dirname, '../../public/Auth.js'), 'utf8');
const jwt = (role) => [Buffer.from('{"alg":"HS256"}').toString('base64url'), Buffer.from(JSON.stringify({ role })).toString('base64url'), 'assinaturaFicticia'].join('.');

function inicializar(endereco, chave = 'sb_publishable_fixture') {
    let clientes = 0;
    const campos = new Map();
    const contexto = vm.createContext({
        location: new URL(endereco), atob,
        window: { APP_CONFIG: { SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_ANON_KEY: chave },
            addEventListener() {}, supabase: { createClient() { clientes++; return {}; } } },
        document: { getElementById(id) {
            if (!campos.has(id)) campos.set(id, { classList: { toggle() {} } });
            return campos.get(id);
        } },
    });
    vm.runInContext(codigo, contexto);
    return { contexto, campos, clientes, resultado: vm.runInContext('sb !== null', contexto) };
}

test('credenciais: login fora de HTTPS é bloqueado antes de criar cliente ou habilitar senha', () => {
    for (const endereco of ['http://financeiro.example', 'http://localhost.evil.example', 'http://127.0.0.1.evil.example', 'file:///index.html']) {
        const r = inicializar(endereco);
        assert.equal(r.resultado, false); assert.equal(r.clientes, 0);
        vm.runInContext('ativarAuth()', r.contexto);
        assert.equal(r.campos.get('auth-enviar').disabled, true);
        assert.equal(r.campos.get('auth-senha').disabled, true);
        assert.ok(r.campos.get('auth-msg').textContent.includes('HTTPS'));
    }
});

test('credenciais: HTTPS e desenvolvimento loopback permitem autenticação', () => {
    for (const endereco of ['https://financeiro.example', 'http://localhost:5000', 'http://127.0.0.1:5000', 'http://[::1]:5000']) {
        const r = inicializar(endereco);
        assert.equal(r.resultado, true); assert.equal(r.clientes, 1);
    }
});

test('credenciais: frontend aceita chave pública e recusa chaves privilegiadas e inválidas', () => {
    for (const chave of ['sb_publishable_fixture', jwt('anon')]) {
        assert.equal(chavePublica(chave), true);
        assert.equal(inicializar('https://financeiro.example', chave).resultado, true);
    }
    for (const chave of ['sb_secret_' + 'fixture'.repeat(5), jwt('service_role'), jwt('authenticated'), 'texto', '', null]) {
        assert.equal(chavePublica(chave), false);
        const r = inicializar('https://financeiro.example', chave);
        assert.equal(r.resultado, false); assert.equal(r.clientes, 0);
    }
});

test('credenciais: scanner reconhece segredos e tokens de acesso sem rejeitar a chave pública', () => {
    for (const texto of ['sb_secret_' + 'fixture'.repeat(5), 'gsk_' + 'x'.repeat(30), jwt('service_role'), jwt('authenticated'), '-----BEGIN PRIVATE KEY-----']) assert.equal(contemSegredo(texto), true);
    for (const texto of ['sb_publishable_fixture', jwt('anon'), 'SUPABASE_SERVICE_ROLE_KEY']) assert.equal(contemSegredo(texto), false);
});

test('credenciais: publicação falha com segredo em arquivo público sem exibir seu valor', () => {
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'fintheka-credenciais-'));
    const segredo = 'sb_secret_' + 'fixture'.repeat(5);
    try {
        fs.writeFileSync(path.join(pasta, 'config.js'), 'window.APP_CONFIG={SUPABASE_URL:"https://fixture.supabase.co",SUPABASE_ANON_KEY:"sb_publishable_fixture"};');
        verificarPastaPublica(pasta);
        fs.writeFileSync(path.join(pasta, 'vazamento.js'), `const exemplo="${segredo}";`);
        assert.throws(() => verificarPastaPublica(pasta), (erro) => erro.message.includes('vazamento.js') && !erro.message.includes(segredo));
    } finally {
        // Apenas os dois arquivos criados neste teste; não há remoção recursiva.
        for (const nome of ['config.js', 'vazamento.js']) if (fs.existsSync(path.join(pasta, nome))) fs.unlinkSync(path.join(pasta, nome));
        fs.rmdirSync(pasta);
    }
});

test('credenciais: pasta pública atual e integração com predeploy são verificadas', () => {
    verificarPastaPublica();
    const hosting = require('../../firebase.json').hosting;
    assert.ok(hosting.predeploy.includes('node scripts/check-public-credentials.cjs'));
});
