const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const root = path.resolve(__dirname, '../../supabase/functions');
function load(file, deps, suffix = '') {
  let code = stripTypeScriptTypes(fs.readFileSync(path.join(root, file), 'utf8'));
  code = code.replace(/^import .+from ["'][^"']+["'];?\s*$/gm, '').replace(/\bexport\s+(?=(?:async\s+)?(?:function|class|const))/g, '');
  return vm.compileFunction(code + '\n' + suffix, Object.keys(deps))(...Object.values(deps));
}
async function run({ token = 'valido', origin = 'http://127.0.0.1:5000', method = 'POST', body = { senha: 'senha-atual', confirmacao: 'EXCLUIR' }, passwordError = false, otherUser = false, deleteError = false, configured = true } = {}) {
  let handler; const calls = { verify: 0, delete: [] };
  const env = { ALLOWED_ORIGIN: 'http://127.0.0.1:5000', SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_ANON_KEY: 'public', SUPABASE_SERVICE_ROLE_KEY: configured ? 'private' : undefined };
  const createClient = (_url, key) => ({ auth: {
    getUser: async () => ({ data: { user: token === 'valido' ? { id: 'dono', email: 'dono@example.com' } : null }, error: token === 'valido' ? null : {} }),
    signInWithPassword: async (credentials) => {
      calls.verify++; assert.equal(credentials.email, 'dono@example.com');
      assert.equal(credentials.password, 'senha-atual');
      return { data: { user: passwordError ? null : { id: otherUser ? 'outro' : 'dono' } }, error: passwordError ? {} : null };
    },
    admin: { deleteUser: async (id, soft) => {
      assert.equal(key, 'private'); assert.equal(soft, false); calls.delete.push(id);
      return { error: deleteError ? { message: 'segredo privado' } : null };
    } },
  } });
  const deps = { Deno: { env: { get: (k) => env[k] }, serve: (fn) => { handler = fn; } }, createClient, Request, Response, Headers, TextDecoder, setTimeout, clearTimeout };
  const http = load('_shared/http.ts', deps, 'return { origemPermitida,responder,autenticar,lerJson,ErroRequisicao };');
  load('excluir-conta/index.ts', { ...deps, ...http });
  const response = await handler(new Request('https://fixture.supabase.co/functions/v1/excluir-conta', {
    method, headers: { Origin: origin, ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    ...(['GET', 'HEAD'].includes(method) ? {} : { body: JSON.stringify(body) }),
  }));
  return { response, data: await response.json(), calls };
}
test('exclusão: exige origem, sessão, confirmação e formato antes de reautenticar', async () => {
  for (const [options, status] of [[{ origin: 'https://evil.example' }, 403], [{ token: '' }, 401], [{ token: 'forjado' }, 401], [{ method: 'GET' }, 405], [{ body: { senha: 'senha-atual', confirmacao: 'sim' } }, 400], [{ body: { senha: 'senha-atual', confirmacao: 'EXCLUIR', id: 'vitima' } }, 400]]) {
    const r = await run(options); assert.equal(r.response.status, status); assert.equal(r.calls.verify, 0); assert.equal(r.calls.delete.length, 0);
  }
});
test('exclusão: senha inválida, usuário divergente ou configuração ausente não apagam conta', async () => {
  for (const [options, status] of [[{ passwordError: true }, 403], [{ otherUser: true }, 403], [{ configured: false }, 503]]) {
    const r = await run(options); assert.equal(r.response.status, status); assert.equal(r.calls.delete.length, 0);
  }
});
test('exclusão: apaga somente identidade autenticada; falha administrativa não vira sucesso', async () => {
  const ok = await run(); assert.equal(ok.response.status, 200); assert.equal(ok.data.excluida, true); assert.deepEqual(ok.calls.delete, ['dono']);
  const bad = await run({ deleteError: true }); assert.equal(bad.response.status, 503); assert.equal(bad.data.excluida, undefined); assert.ok(!JSON.stringify(bad.data).includes('segredo privado'));
});
