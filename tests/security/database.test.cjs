const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

test('permissões do PostgreSQL contra chamadas diretas que contornam a interface', async (t) => {
    const db = new PGlite();
    const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222';
    const usuario = async (id, role = 'authenticated') => {
        await db.exec('reset role');
        await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
        await db.exec(`set role ${role}`);
    };
    try {
        await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
            create schema auth; create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
            create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
            grant usage on schema auth,public to anon,authenticated,service_role;
            grant execute on function auth.uid() to anon,authenticated,service_role;`);
        for (const file of ['schema.sql', 'migrations/202611120001_hardening.sql', 'migrations/202611120002_free_ai.sql', 'migrations/202611240001_quotes_quota.sql']) {
            await db.exec(fs.readFileSync(path.join(__dirname, '../../supabase', file), 'utf8'));
        }
        await db.query('insert into auth.users(id,email,raw_user_meta_data) values ($1,$2,$3),($4,$5,$6)', [a, 'a@example.com', { papel: 'admin', nome: 'A' }, b, 'b@example.com', { nome: 'B' }]);
        await usuario(a);
        await db.exec("insert into public.transacoes(data,descricao,valor) values ('2026-11-23','Conta A',100)");
        await usuario(b);
        await db.exec("insert into public.transacoes(data,descricao,valor) values ('2026-11-23','Conta B',-30)");

        await t.test('anônimo não lê, cria, altera nem apaga registros', async () => {
            await usuario('', 'anon');
            for (const statement of [
                'select * from public.transacoes', 'select * from public.perfis',
                "insert into public.transacoes(data,descricao,valor) values ('2026-11-23','Invasão',1)",
                'update public.transacoes set pago=true', 'delete from public.transacoes',
                "update public.perfis set nome='Invasão'", 'delete from public.perfis',
            ]) await assert.rejects(db.exec(statement), /permission denied/i);
        });

        await t.test('usuário A não acessa registros, perfil ou pagamentos de B', async () => {
            await usuario(a);
            assert.equal((await db.query('select * from public.transacoes where usuario_id=$1', [b])).rows.length, 0);
            assert.equal((await db.query('select * from public.perfis where id=$1', [b])).rows.length, 0);
            assert.equal((await db.query('update public.transacoes set pago=true where usuario_id=$1 returning id', [b])).rows.length, 0);
            assert.equal((await db.query('delete from public.transacoes where usuario_id=$1 returning id', [b])).rows.length, 0);
            assert.equal((await db.query("update public.perfis set nome='Invasão' where id=$1 returning id", [b])).rows.length, 0);
            await assert.rejects(db.query("insert into public.transacoes(usuario_id,data,descricao,valor) values ($1,'2026-11-23','Invasão',1)", [b]), /row-level security/i);
        });

        await t.test('metadados e alterações diretas não promovem cliente ou transferem propriedade', async () => {
            await usuario(a);
            assert.equal((await db.query('select papel from public.perfis')).rows[0].papel, 'cliente');
            for (const statement of [
                "update public.perfis set papel='admin'", "update public.perfis set email='vitima@example.com'",
                "update public.transacoes set usuario_id='22222222-2222-4222-8222-222222222222'",
                'delete from public.perfis', 'select public.novo_usuario()', 'select public.sincronizar_email()',
            ]) await assert.rejects(db.exec(statement), /permission denied/i);
            assert.equal((await db.query('select * from public.resumo_usuarios()')).rows.length, 0);
        });

        await t.test('cliente não lê, insere, modifica ou reseta sua cota de IA', async () => {
            await usuario(a);
            for (const statement of [
                'select * from public.uso_insights', `insert into public.uso_insights(usuario_id) values ('${a}')`,
                "update public.uso_insights set usado_em=now()-interval '25 hours'", 'delete from public.uso_insights',
                `select public.reservar_insight('${a}')`,
            ]) await assert.rejects(db.exec(statement), /permission denied/i);
        });

        await t.test('papel authenticated sem identidade não enxerga nem cria registros', async () => {
            await usuario('');
            assert.equal((await db.query('select * from public.transacoes')).rows.length, 0);
            assert.equal((await db.query('select * from public.perfis')).rows.length, 0);
            await assert.rejects(db.exec("insert into public.transacoes(data,descricao,valor) values ('2026-11-23','Sem identidade',1)"), /row-level security|not-null constraint/i);
        });

        await t.test('cotações: acesso direto bloqueado e limites individual/global respeitados após reaplicação', async () => {
            for (const role of ['anon', 'authenticated']) {
                await usuario(a, role);
                for (const sql of ['select * from public.uso_cotacoes', 'delete from public.uso_cotacoes',
                    `insert into public.uso_cotacoes(usuario_id) values ('${a}')`,
                    `select public.reservar_cotacao('${a}')`]) await assert.rejects(db.exec(sql), /permission denied/i);
            }
            await db.exec('reset role; set role service_role');
            const reservar = async (id) => (await db.query('select public.reservar_cotacao($1) as ok', [id])).rows[0].ok;
            assert.equal(await reservar(null), false);
            for (let i = 0; i < 30; i++) assert.equal(await reservar(a), true);
            assert.equal(await reservar(a), false);
            assert.equal(await reservar(b), true);
            await db.exec('reset role');
            await db.exec(fs.readFileSync(path.join(__dirname, '../../supabase/migrations/202611240001_quotes_quota.sql'), 'utf8'));
            assert.equal((await db.query('select count(*)::int as n from public.uso_cotacoes')).rows[0].n, 31);
            assert.equal((await db.query('select count(*)::int as n from public.transacoes')).rows[0].n, 2);
            await db.query('insert into public.uso_cotacoes(usuario_id) select $1 from generate_series(1,269)', [a]);
            await db.exec('set role service_role');
            assert.equal(await reservar(b), false);
            await db.exec("reset role; update public.uso_cotacoes set usado_em=now()-interval '61 seconds'; set role service_role");
            assert.equal(await reservar(a), true);
            await db.exec('reset role');
            assert.equal((await db.query('select count(*)::int as n from public.uso_cotacoes')).rows[0].n, 1);
        });

        await t.test('operações legítimas permanecem disponíveis e dados da outra conta são preservados', async () => {
            await usuario(a);
            assert.equal((await db.query("update public.transacoes set pago=true returning id")).rows.length, 1);
            assert.equal((await db.query("update public.perfis set nome='Novo nome' returning id")).rows.length, 1);
            assert.equal((await db.query('delete from public.transacoes returning id')).rows.length, 1);
            await usuario(b);
            const rows = (await db.query('select descricao,valor,pago from public.transacoes')).rows;
            assert.equal(rows.length, 1); assert.equal(rows[0].descricao, 'Conta B'); assert.equal(rows[0].pago, false);
        });
    } finally { await db.close(); }
});
