const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

test('PostgreSQL: RLS, privilégios, criação de perfis e limite atômico de IA', async () => {
  const db = new PGlite();
  const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222';
  try {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth, public to anon, authenticated, service_role;
      grant execute on function auth.uid() to anon, authenticated, service_role;
    `);
    await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/schema.sql'), 'utf8'));
    const migration = fs.readFileSync(path.join(__dirname, '../supabase/migrations/202611120001_hardening.sql'), 'utf8');
    await db.exec(migration);
    await db.exec(migration); // Pode ser reaplicada sem apagar dados.
    await db.query('insert into auth.users(id,email,raw_user_meta_data) values ($1,$2,$3),($4,$5,$6)', [a, 'a@example.com', { nome: 'Cliente A', papel: 'admin' }, b, 'b@example.com', { nome: 'Cliente B' }]);
    assert.equal((await db.query('select papel from public.perfis where id=$1', [a])).rows[0].papel, 'cliente');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [a]);
    await db.exec('set role authenticated');
    await db.exec("insert into public.transacoes(data,descricao,valor) values ('2026-11-12','Receita A',100)");
    assert.equal((await db.query('select * from public.perfis')).rows.length, 1);
    await assert.rejects(db.query("insert into public.transacoes(usuario_id,data,descricao,valor) values ($1,'2026-11-12','Invasão',50)", [b]), /row-level security/i);
    await assert.rejects(db.exec("update public.perfis set papel='admin'"), /permission denied/i);
    await assert.rejects(db.query('update public.transacoes set usuario_id=$1', [b]), /permission denied/i);
    await assert.rejects(db.query('select public.reservar_insight($1)', [a]), /permission denied/i);
    assert.equal((await db.query('select * from public.resumo_usuarios()')).rows.length, 0);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [b]);
    assert.equal((await db.query('select * from public.transacoes')).rows.length, 0);
    assert.equal((await db.query("update public.transacoes set valor=0 returning id")).rows.length, 0);
    assert.equal((await db.query('delete from public.transacoes returning id')).rows.length, 0);
    await db.exec("insert into public.transacoes(data,descricao,valor) values ('2026-11-12','Despesa B',-25)");
    assert.equal((await db.query('select count(*)::int as total from public.transacoes')).rows[0].total, 1);
    await db.exec('reset role; set role anon');
    for (const table of ['perfis', 'transacoes', 'uso_insights']) await assert.rejects(db.query(`select * from public.${table}`), /permission denied/i);
    await assert.rejects(db.query('select * from public.resumo_usuarios()'), /permission denied/i);
    await db.exec('reset role');
    await db.query("update public.perfis set papel='admin' where id=$1", [a]);
    await db.query("update auth.users set email='novo@example.com' where id=$1", [a]);
    assert.equal((await db.query('select email from public.perfis where id=$1', [a])).rows[0].email, 'novo@example.com');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [a]);
    await db.exec('set role authenticated');
    assert.equal((await db.query('select * from public.resumo_usuarios()')).rows.length, 2);
    await db.exec('reset role; set role service_role');
    for (let i = 0; i < 10; i++) assert.equal((await db.query('select public.reservar_insight($1) as ok', [a])).rows[0].ok, true);
    assert.equal((await db.query('select public.reservar_insight($1) as ok', [a])).rows[0].ok, false);
    assert.equal((await db.query('select public.reservar_insight($1) as ok', [b])).rows[0].ok, true);
    await db.exec('reset role');
    assert.equal((await db.query('select count(*)::int as total from public.transacoes')).rows[0].total, 2);
    const freeAI = fs.readFileSync(path.join(__dirname, '../supabase/migrations/202611120002_free_ai.sql'), 'utf8');
    await db.exec(freeAI);
    await db.exec(freeAI);
    await db.exec('delete from public.uso_insights; set role service_role');
    const reservar = async (usuario) => (await db.query('select public.reservar_insight($1) as ok', [usuario])).rows[0].ok;
    assert.equal(await reservar(a), true);
    assert.equal(await reservar(a), false); // Intervalo de 30 segundos.
    for (let i = 0; i < 2; i++) {
      await db.exec("reset role; update public.uso_insights set usado_em = usado_em - interval '31 seconds'; set role service_role");
      assert.equal(await reservar(a), true);
    }
    await db.exec("reset role; update public.uso_insights set usado_em = usado_em - interval '31 seconds'; set role service_role");
    assert.equal(await reservar(a), false); // Três por conta, mesmo após intervalo.
    assert.equal(await reservar(b), true);
    await db.exec("reset role; update public.uso_insights set usado_em = now() - interval '25 hours'; set role service_role");
    assert.equal(await reservar(a), true); // Janela expirada libera uso.
    await db.exec('reset role');
    await db.query("insert into public.uso_insights(usuario_id,usado_em) select $1, now() - interval '1 minute' from generate_series(1,99)", [a]);
    await db.exec('set role service_role');
    assert.equal(await reservar(b), false); // Cota geral vale para outras contas.
    await db.exec('reset role; set role authenticated');
    await assert.rejects(reservar(a), /permission denied/i);
    await db.exec('reset role');
    assert.equal((await db.query('select count(*)::int as total from public.transacoes')).rows[0].total, 2);
  } finally { await db.close(); }
});
