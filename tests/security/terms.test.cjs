const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

test('termos: preserva contas antigas, exige aceite novo, registra horário servidor e impede adulteração', async () => {
  const db = new PGlite();
  const old = '11111111-1111-4111-8111-111111111111', novo = '22222222-2222-4222-8222-222222222222';
  try {
    await db.exec(`create role anon nologin; create role authenticated nologin;
      create schema auth; create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth,public to authenticated; grant execute on function auth.uid() to authenticated;`);
    await db.query('insert into auth.users(id) values($1)', [old]);
    const sql = fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations/202611270001_terms_acceptance.sql'), 'utf8');
    await db.exec(sql); await db.exec(sql);
    assert.equal((await db.query('select count(*)::int as n from auth.users')).rows[0].n, 1);
    assert.equal((await db.query('select count(*)::int as n from public.aceites_termos')).rows[0].n, 0);
    await assert.rejects(db.query('insert into auth.users(id) values($1)', [novo]), /Aceite os Termos/);
    await assert.rejects(db.query('insert into auth.users values($1,$2)', [novo, { termos_aceitos: true, termos_versao: 'antiga' }]), /Aceite os Termos/);
    await db.query('insert into auth.users values($1,$2)', [novo, { termos_aceitos: true, termos_versao: '2026-11-27', aceito_em: '1900-01-01' }]);
    const receipt = (await db.query('select * from public.aceites_termos')).rows[0];
    assert.equal(receipt.versao, '2026-11-27'); assert.ok(new Date(receipt.aceito_em).getFullYear() > 2000);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [old]); await db.exec('set role authenticated');
    assert.equal((await db.query('select * from public.aceites_termos')).rows.length, 0);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [novo]);
    assert.equal((await db.query('select * from public.aceites_termos')).rows.length, 1);
    await assert.rejects(db.exec("update public.aceites_termos set versao='falso'"), /permission denied/);
    await assert.rejects(db.exec('delete from public.aceites_termos'), /permission denied/);
    await db.exec('reset role');
    await db.query("update auth.users set raw_user_meta_data='{}' where id=$1", [novo]);
    assert.equal((await db.query('select versao from public.aceites_termos')).rows[0].versao, '2026-11-27');
    await db.query('delete from auth.users where id=$1', [novo]);
    assert.equal((await db.query('select count(*)::int as n from public.aceites_termos')).rows[0].n, 0);
    assert.equal((await db.query('select count(*)::int as n from auth.users')).rows[0].n, 1);
  } finally { await db.close(); }
});
