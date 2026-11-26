const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const crypto = require('node:crypto');
const root = path.join(__dirname, '../..');
const server = require('../../scripts/serve.cjs');
const hosting = require('../../firebase.json').hosting;

test('Hosting publica somente public, sem backups, arquivos ocultos ou SQL', () => {
    assert.equal(hosting.public, 'public');
    for (const pattern of ['**/.*', '**/*.bak*', '**/*.sql', '**/node_modules/**']) assert.ok(hosting.ignore.includes(pattern));
    const publicDir = path.join(root, 'public');
    const config = { window: {} };
    vm.runInNewContext(fs.readFileSync(path.join(publicDir, 'config.js'), 'utf8'), config);
    const key = config.window.APP_CONFIG.SUPABASE_ANON_KEY;
    if (!key.startsWith('sb_publishable_')) {
        const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url'));
        assert.equal(payload.role, 'anon', 'O frontend nunca pode carregar uma chave service_role');
    }
    const files = fs.readdirSync(publicDir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile());
    for (const entry of files) {
        if (/\.bak/i.test(entry.name)) continue;
        const file = path.join(entry.parentPath, entry.name);
        const content = fs.readFileSync(file, 'utf8');
        assert.ok(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bsb_secret_[A-Za-z0-9_-]{15,}|\bgsk_[A-Za-z0-9]{20,}|\bsk-ant-[A-Za-z0-9_-]{15,}/.test(content), `Possível segredo em ${path.relative(publicDir, file)}`);
        // Inspeciona a função de cada JWT, sem imprimir o token.
        for (const [jwt] of content.matchAll(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)) {
            let payload;
            try { payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url')); } catch { continue; }
            assert.notEqual(payload.role, 'service_role', `Chave privilegiada em ${path.relative(publicDir, file)}`);
        }
    }
});

test('bibliotecas servidas são idênticas às versões instaladas e auditadas', () => {
    for (const [source, target] of [
        ['@supabase/supabase-js/dist/umd/supabase.js', 'supabase.js'],
        ['lightweight-charts/dist/lightweight-charts.standalone.production.js', 'lightweight-charts.js'],
    ]) {
        const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
        assert.equal(hash(path.join(root, 'public/vendor', target)), hash(path.join(root, 'node_modules', source)), `Bundle ${target} deve corresponder à dependência auditada`);
    }
});

test('HTTP local aplica cabeçalhos reais e bloqueia arquivos internos e travessia de diretórios', async () => {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const request = (pathname) => new Promise((resolve, reject) => {
        http.get({ hostname: '127.0.0.1', port, path: pathname }, (response) => {
            response.resume(); response.on('end', () => resolve({ status: response.statusCode, headers: response.headers }));
        }).on('error', reject);
    });
    try {
        const page = await request('/');
        assert.equal(page.status, 200);
        const csp = page.headers['content-security-policy'];
        for (const expected of ["script-src 'self'", "script-src-attr 'none'", "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'"]) assert.ok(csp.includes(expected));
        assert.ok(!/script-src[^;]*(?:unsafe-inline|unsafe-eval|https?:|\*)/.test(csp));
        assert.ok(csp.includes("font-src 'self'"));
        assert.ok(!csp.includes('fonts.googleapis.com') && !csp.includes('fonts.gstatic.com'));
        assert.equal(page.headers['x-frame-options'], 'DENY');
        assert.equal(page.headers['x-content-type-options'], 'nosniff');
        assert.equal(page.headers['referrer-policy'], 'strict-origin-when-cross-origin');
        assert.equal(page.headers['cross-origin-opener-policy'], 'same-origin');
        assert.equal(page.headers['cross-origin-resource-policy'], 'same-origin');
        assert.equal(page.headers['strict-transport-security'], 'max-age=31536000');
        for (const pathname of ['/index.html.bak', '/Automac.js.bak2', '/.env', '/.git/config', '/supabase/schema.sql', '/firebase.json', '/package.json', '/../package.json', '/%2e%2e%5cpackage.json', '/%2e%2e%2fsupabase%2fschema.sql']) {
            assert.equal((await request(pathname)).status, 404, pathname);
        }
        for (const asset of ['/Studio.css', '/Studio.js', '/logo.svg', '/icons.svg', '/privacidade.html']) assert.equal((await request(asset)).status, 200);
    } finally {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
    }
});
