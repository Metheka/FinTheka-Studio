const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { build } = require('../scripts/prepare-supabase.cjs');

test('pacote de ativação: SQL atômico, reaplicação, registros preservados e aprovação individual', async () => {
  const files = build(), db = new PGlite();
  const dono = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';
  try {
    await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
      create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth,public to anon,authenticated,service_role; grant execute on function auth.uid() to anon,authenticated,service_role;`);
    await db.exec(fs.readFileSync(path.resolve(__dirname, '../supabase/schema.sql'), 'utf8'));
    await db.exec('drop table public.uso_insights'); // Também cobre banco com somente as duas tabelas principais.
    await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)', [dono, 'teste@example.com', other, 'outra@example.com']);
    await db.query("insert into public.transacoes(usuario_id,data,descricao,valor) values($1,current_date,'Existente',123.45)", [dono]);
    await db.exec(fs.readFileSync(path.resolve(__dirname, '../supabase/migrations/202611270001_terms_acceptance.sql'), 'utf8'));
    for (let i = 0; i < 2; i++) await db.exec(files['01-banco-recursos.sql']);
    assert.equal((await db.query('select * from public.transacoes')).rows.length, 1);
    assert.equal(Number((await db.query('select valor from public.transacoes')).rows[0].valor), 123.45);
    assert.equal((await db.query('select * from public.perfis')).rows.length, 2);
    assert.equal((await db.query('select * from public.aceites_termos')).rows.length, 0);
    await assert.rejects(db.exec(files['02-liberar-cotacoes.sql']), /Substitua/);
    const approval = files['02-liberar-cotacoes.sql'].replace("email_conta text := 'SEU_EMAIL_AQUI'", "email_conta text := 'teste@example.com'");
    await db.exec(approval); await db.exec(approval);
    const acessos = (await db.query('select * from public.acessos_servicos')).rows;
    assert.equal(acessos.length, 1); assert.equal(acessos[0].usuario_id, dono);
    assert.equal(acessos[0].cotacoes, true); assert.equal(acessos[0].insights, false);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [dono]); await db.exec('set role authenticated');
    const id = (await db.query("insert into public.cofrinhos(nome,meta) values('Reserva',500) returning id")).rows[0].id;
    assert.equal(Number((await db.query("select (public.movimentar_cofrinho($1,'guardar',25,$2)).saldo as saldo", [id, require('node:crypto').randomUUID()])).rows[0].saldo), 25);
    await db.exec('reset role; set role service_role');
    assert.equal((await db.query('select public.reservar_cotacao_segura($1) as ok', [dono])).rows[0].ok, true);
    await assert.rejects(db.query('select public.reservar_cotacao_segura($1)', [other]), /autorizada/);
    await db.exec('reset role');
    await assert.rejects(db.exec(files['06-liberar-ia.sql']), /Substitua/);
    const approvalAI = files['06-liberar-ia.sql'].replace("email_conta text := 'SEU_EMAIL_AQUI'", "email_conta text := 'teste@example.com'");
    await db.exec(approvalAI);
    const account = (await db.query('select * from public.acessos_servicos where usuario_id=$1', [dono])).rows[0];
    assert.equal(account.insights, true); assert.equal(account.cotacoes, true);
    assert.equal((await db.query('select count(*)::int as n from public.acessos_servicos')).rows[0].n, 1);
    await db.exec('set role service_role');
    assert.equal((await db.query('select public.reservar_insight_seguro($1) as ok', [dono])).rows[0].ok, true);
    assert.equal((await db.query('select public.reservar_insight_seguro($1) as ok', [dono])).rows[0].ok, false);
    await assert.rejects(db.query('select public.reservar_insight_seguro($1)', [other]), /autorizada/);
    await db.exec('reset role');
    // O pacote falha integralmente, sem recursos parcialmente criados, se a base não existir.
    await db.exec('drop table public.perfis cascade');
    await assert.rejects(db.exec(files['01-banco-recursos.sql']), /Abra o projeto/);
    await db.exec('rollback');
  } finally { await db.close(); }
});

test('arquivos para colar no painel estão atualizados e não dependem de imports relativos', () => {
  for (const [file, content] of Object.entries(build())) {
    // O editor pode formatar a cópia TypeScript ao salvar, sem mudar seu código.
    const actual = fs.readFileSync(path.resolve(__dirname, '../supabase/ativacao', file), 'utf8');
    const normalize = (value) => file.endsWith('.ts') ? value.replace(/\s+/g, '') : value;
    assert.equal(normalize(actual), normalize(content));
    if (file.endsWith('.ts')) {
      assert.ok(!/from ["']\.\.?\//.test(content));
      assert.equal((content.match(/import \{ createClient \}/g) || []).length, 1);
    }
  }
});
