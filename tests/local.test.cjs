const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');
const { openDatabase } = require('../scripts/local-db.cjs');
const { createLocalApi } = require('../scripts/local-api.cjs');
const { createServer } = require('../scripts/serve.cjs');
const key = 'sb_publishable_local_presentation';

test('modo local com SDK real: cadastro, RLS, CRUD, CSV, metas, serviços, sessão e persistência', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fintheka-local-'));
  const data = path.join(directory, 'postgres');
  let db, server;
  const clients = [];
  const start = async () => {
    db = await openDatabase(data);
    server = createServer(createLocalApi(db));
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${server.address().port}`;
  };
  const stop = async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await db.close();
  };
  const client = (origin) => {
    const c = createClient(`${origin}/local`, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    clients.push(c); return c;
  };
  try {
    let origin = await start();
    await assert.rejects(openDatabase(data), /já está aberto/);
    const a = client(origin), b = client(origin);
    const password = 'SenhaLocal123!';
    const termos = { termos_aceitos: true, termos_versao: '2026-11-27' };
    assert.ok((await a.auth.signUp({ email: 'sem-aceite@example.com', password })).error);
    assert.equal((await db.query('select count(*)::int as n from auth.users')).rows[0].n, 0);
    const registered = await a.auth.signUp({ email: 'a@example.com', password, options: { data: { nome: 'Pessoa A', papel: 'admin', ...termos } } });
    assert.ifError(registered.error);
    const aId = registered.data.user.id;
    assert.equal((await a.from('perfis').select('nome,papel').single()).data.papel, 'admin');
    assert.ifError((await b.auth.signUp({ email: 'b@example.com', password, options: { data: { nome: 'Pessoa B', papel: 'admin', ...termos } } })).error);
    assert.equal((await a.from('aceites_termos').select('*')).data.length, 1);
    assert.equal((await a.from('aceites_termos').select('*').single()).data.versao, termos.termos_versao);
    assert.ok((await a.from('aceites_termos').update({ versao: 'falso' }).eq('usuario_id', aId)).error);
    assert.equal((await b.from('perfis').select('papel').single()).data.papel, 'cliente');
    const inserted = await a.from('transacoes').insert({ data: '2026-11-27', descricao: 'Receita A', valor: 100, pago: true }).select().single();
    assert.ifError(inserted.error);
    assert.equal(inserted.data.data, '2026-11-27');
    const id = inserted.data.id;
    assert.equal((await b.from('transacoes').select('*').eq('id', id)).data.length, 0);
    assert.ok((await b.from('transacoes').insert({ usuario_id: aId, data: '2026-11-27', descricao: 'Invasão', valor: 1 })).error);
    assert.ok((await b.from('perfis').update({ papel: 'admin' }).eq('id', registered.data.user.id)).error);
    assert.ok((await b.from('transacoes').update({ valor: 5 }).eq('id', id).select().single()).error);
    assert.ifError((await a.from('transacoes').update({ pago: false }).eq('id', id).select().single()).error);
    assert.ifError((await a.from('transacoes').insert(Array.from({ length: 2 }, (_, i) => ({ data: '2026-11-27', descricao: `CSV ${i}`, valor: -10.25 })))).error);
    assert.equal((await a.from('transacoes').select('*').order('data', { ascending: false }).order('id', { ascending: false }).range(1, 1)).data.length, 1);
    const badBatch = await a.from('transacoes').insert([{ data: '2026-11-27', descricao: 'Rollback', valor: 1 }, { data: '2026-11-27', descricao: '', valor: 1 }]);
    assert.ok(badBatch.error);
    assert.equal((await a.from('transacoes').select('*')).data.length, 3);
    const cofre = await a.from('cofrinhos').insert({ nome: 'Viagem', meta: 500, cor: 'rosa' }).select('id').single();
    assert.ifError(cofre.error);
    const movement = { p_cofrinho: cofre.data.id, p_tipo: 'guardar', p_valor: 50, p_requisicao: require('node:crypto').randomUUID() };
    for (let i = 0; i < 2; i++) assert.ifError((await a.rpc('movimentar_cofrinho', movement)).error);
    assert.equal(Number((await a.from('cofrinhos').select('saldo').single()).data.saldo), 50);
    assert.ok((await b.rpc('movimentar_cofrinho', { ...movement, p_requisicao: require('node:crypto').randomUUID() })).error);
    assert.ok((await a.from('cofrinhos').update({ saldo: 500 }).eq('id', cofre.data.id)).error);
    assert.ok((await a.from('cofrinhos').delete().eq('id', cofre.data.id).select('id').single()).error);
    assert.equal((await a.from('movimentos_cofrinho').select('tipo,valor,criado_em').order('id', { ascending: false }).limit(10)).data.length, 1);
    const insight = await a.functions.invoke('insights');
    assert.ifError(insight.error);
    assert.match(insight.data.insight, /100,00/);
    assert.match(insight.data.insight, /20,50/);
    assert.match(insight.data.insight, /sem IA externa/);
    assert.match((await b.functions.invoke('insights', { body: { mensagens: [{ role: 'user', content: 'metas' }] } })).data.resposta, /Nos 0 lançamentos/);
    const quotes = await a.functions.invoke('cotacoes', { body: { par: 'USD', dias: 90 } });
    assert.ifError(quotes.error); assert.equal(quotes.data.historico.length, 90);
    assert.equal(quotes.data.demonstracao, true);
    assert.equal((await a.rpc('resumo_usuarios')).data.length, 2);
    assert.equal((await b.rpc('resumo_usuarios')).data.length, 0);
    const blocked = await fetch(`${origin}/local/rest/v1/transacoes`);
    assert.equal(blocked.status, 401);
    assert.equal((await fetch(`${origin}/local/auth/v1/signup`, { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
    const hostStatus = await new Promise((resolve, reject) => {
      require('node:http').get(`${origin}/`, { headers: { Host: 'evil.example' } }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); }).on('error', reject);
    });
    assert.equal(hostStatus, 403);
    assert.equal((await fetch(`${origin}/.local-data/postgres/PG_VERSION`)).status, 404);
    const renewed = await a.auth.refreshSession();
    assert.ifError(renewed.error);
    const refresh = renewed.data.session.refresh_token;
    const dump = await db.dumpDataDir('gzip');
    const { PGlite } = require('@electric-sql/pglite');
    const copy = new PGlite({ loadDataDir: dump });
    try { assert.equal((await copy.query('select count(*)::int as n from public.transacoes')).rows[0].n, 3); }
    finally { await copy.close(); }
    await stop();
    // Exercise the actual transport commands in an isolated data directory.
    const { execFileSync } = require('node:child_process');
    const backupDir = path.join(directory, 'backups');
    const env = { ...process.env, FINTHEKA_DATA_DIR: data, FINTHEKA_BACKUP_DIR: backupDir };
    execFileSync(process.execPath, [path.resolve(__dirname, '../scripts/local-admin.cjs'), 'backup'], { env });
    const backup = path.join(backupDir, fs.readdirSync(backupDir)[0]);
    const restoredData = path.join(directory, 'restored', 'postgres');
    execFileSync(process.execPath, [path.resolve(__dirname, '../scripts/local-admin.cjs'), 'restore', backup], { env: { ...env, FINTHEKA_DATA_DIR: restoredData } });
    const restored = await openDatabase(restoredData);
    try {
      assert.equal((await restored.query('select count(*)::int as n from public.transacoes')).rows[0].n, 3);
      assert.equal((await restored.query('select count(*)::int as n from auth.sessions')).rows[0].n, 0);
    } finally { await restored.close(); }
    execFileSync(process.execPath, [path.resolve(__dirname, '../scripts/local-admin.cjs'), 'restore', backup], { env: { ...env, FINTHEKA_DATA_DIR: restoredData } });
    assert.ok(fs.readdirSync(path.dirname(restoredData)).some((n) => n.startsWith('postgres-antes-')));
    origin = await start();
    const reopened = client(origin);
    assert.ifError((await reopened.auth.refreshSession({ refresh_token: refresh })).error);
    assert.equal((await reopened.from('transacoes').select('*')).data.length, 3);
    assert.equal(Number((await reopened.from('cofrinhos').select('saldo').single()).data.saldo), 50);
    assert.ifError((await reopened.from('transacoes').delete().eq('id', id).select('id').single()).error);
    assert.ifError((await reopened.auth.signOut({ scope: 'local' })).error);
    assert.ok((await reopened.from('transacoes').select('*')).error);
    const login = await reopened.auth.signInWithPassword({ email: 'A@example.com', password });
    assert.ifError(login.error);
    assert.equal((await reopened.from('transacoes').select('*')).data.length, 2);
    assert.ok((await reopened.functions.invoke('excluir-conta', { body: { senha: 'errada', confirmacao: 'EXCLUIR' } })).error);
    assert.equal((await reopened.from('transacoes').select('*')).data.length, 2);
    assert.ok((await reopened.functions.invoke('excluir-conta', { body: { senha: password, confirmacao: 'EXCLUIR', id: 'outra-conta' } })).error);
    const deleted = await reopened.functions.invoke('excluir-conta', { body: { senha: password, confirmacao: 'EXCLUIR' } });
    assert.ifError(deleted.error); assert.equal(deleted.data.excluida, true);
    for (const table of ['perfis', 'transacoes', 'cofrinhos', 'movimentos_cofrinho', 'aceites_termos']) {
      const owner = table === 'perfis' ? 'id' : 'usuario_id';
      assert.equal((await db.query(`select count(*)::int as n from public.${table} where ${owner}=$1`, [aId])).rows[0].n, 0);
    }
    assert.equal((await db.query('select count(*)::int as n from auth.users')).rows[0].n, 1);
    assert.ok((await reopened.from('transacoes').select('*')).error);
  } finally {
    for (const c of clients) await c.auth.stopAutoRefresh();
    if (server?.listening) await stop();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
