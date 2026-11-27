const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

test('inicialização padrão usa Supabase original e mantém banco local desligado', async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'fintheka-startup-'));
  const dataDir = path.join(temporary, 'postgres');
  const child = spawn(process.execPath, [path.resolve(__dirname, '../scripts/serve.cjs')], {
    env: { ...process.env, PORT: '0', FINTHEKA_DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const closed = new Promise((resolve) => child.once('close', resolve));
  try {
    const origin = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('Servidor não iniciou.')), 10000);
      child.once('error', (e) => { clearTimeout(timer); reject(e); });
      child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Servidor encerrou: ${code}`)); });
      child.stdout.on('data', (chunk) => {
        output += chunk;
        const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
        if (match) { clearTimeout(timer); resolve(match[0]); }
      });
    });
    const config = await (await fetch(`${origin}/config.js`)).text();
    assert.equal(config, fs.readFileSync(path.resolve(__dirname, '../public/config.js'), 'utf8'));
    assert.ok(!config.includes('LOCAL_BACKEND'));
    const configContext = { window: {} };
    require('node:vm').runInNewContext(config, configContext);
    assert.equal(configContext.window.APP_CONFIG.INSIGHTS_FUNCTION, 'quick-service');
    assert.equal(fs.existsSync(dataDir), false);
    assert.equal((await fetch(`${origin}/local/rest/v1/transacoes`)).status, 404);
  } finally {
    child.kill(); await closed;
    assert.equal(path.dirname(temporary), path.resolve(os.tmpdir()));
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
