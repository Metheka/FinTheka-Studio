const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const base = path.join(__dirname, '../../supabase');
const migration = fs.readFileSync(path.join(base, 'migrations/202611250001_abuse_protection.sql'), 'utf8');
const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
const limite = (e) => e.code === '54000';

test('proteção de abuso no banco real: limites, atomicidade, aprovação e preservação', async (t) => {
    const db = new PGlite();
    const login = async (id = a, role = 'authenticated') => {
        await db.exec('reset role');
        await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
        await db.exec(`set role ${role}`);
    };
    const admin = async () => { await db.exec('reset role'); };
    const insert = (n = 1) => db.exec(`insert into public.transacoes(data,descricao,valor) select current_date,'teste',1 from generate_series(1,${n})`);
    const contador = async (recurso = 'transacoes', id = a) => {
        await admin();
        return (await db.query('select * from privado.limites_escrita where usuario_id=$1 and recurso=$2', [id,recurso])).rows[0];
    };
    try {
        await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
            create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
            create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
            grant usage on schema auth,public to anon,authenticated,service_role;
            grant execute on function auth.uid() to anon,authenticated,service_role;`);
        await db.exec(fs.readFileSync(path.join(base, 'schema.sql'), 'utf8'));
        for (const f of fs.readdirSync(path.join(base, 'migrations')).sort().filter((f) => f < '202611250001')) {
            await db.exec(fs.readFileSync(path.join(base, 'migrations', f), 'utf8'));
        }
        await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)', [a,'a@example.invalid',b,'b@example.invalid']);
        // Simula conta legada acima do novo teto, sem apagar nem truncar histórico.
        await db.query("insert into public.transacoes(usuario_id,data,descricao,valor) select $1,current_date,'legado',1 from generate_series(1,10001)", [b]);
        await db.query("insert into public.cofrinhos(usuario_id,nome,meta) select $1,'legado',100 from generate_series(1,100)", [b]);
        await db.exec(migration);

        await t.test('escritas em lote respeitam frequência e rollback integral', async () => {
            await login(); await insert(501);
            await assert.rejects(insert(100), limite);
            assert.equal((await db.query('select count(*)::int n from public.transacoes')).rows[0].n,501);
            await insert(99);
            await db.exec("insert into public.transacoes(id,data,descricao,valor) overriding system value select min(id),current_date,'repetido',1 from public.transacoes on conflict do nothing");
            await assert.rejects(insert(), limite);
            assert.equal((await contador()).no_minuto,600);
            await login();
            await assert.rejects(db.exec('update public.transacoes set pago=true'), limite);
            assert.equal((await db.query('select count(*)::int n from public.transacoes where pago')).rows[0].n,0);
            await admin();
            await db.query("update privado.limites_escrita set minuto=now()-interval '61 seconds' where usuario_id=$1", [a]);
            await login(); await insert();
            assert.equal((await contador()).no_minuto,1);
        });

        await t.test('limite diário não é zerado ao apagar e recriar registros', async () => {
            await admin();
            await db.query("update privado.limites_escrita set no_dia=2999,no_minuto=0 where usuario_id=$1 and recurso='transacoes'", [a]);
            await login(); await insert(); await assert.rejects(insert(),limite);
            await db.exec('delete from public.transacoes where id=(select min(id) from public.transacoes)');
            await assert.rejects(insert(),limite);
            assert.equal((await contador()).no_dia,3000);
            await admin();
            await db.query("update privado.limites_escrita set dia=now()-interval '25 hours' where usuario_id=$1", [a]);
            await login(); await insert();
            assert.equal((await contador()).no_dia,1);
        });

        await t.test('migração preserva legado, limita volume e libera espaço após excluir', async () => {
            await login(b); await assert.rejects(insert(),limite);
            await db.exec('update public.transacoes set pago=true where id=(select min(id) from public.transacoes)');
            await db.exec('delete from public.transacoes where id in (select id from public.transacoes order by id limit 2)');
            await insert(); await assert.rejects(insert(),limite);
            await assert.rejects(db.exec("insert into public.cofrinhos(nome,meta) values('excesso',100)"),limite);
            await db.exec('delete from public.cofrinhos where id=(select min(id) from public.cofrinhos)');
            await db.exec("insert into public.cofrinhos(nome,meta) values('permitido',100)");
            await admin();
            const antes = await contador('transacoes',b);
            await db.exec(migration);
            const depois = await contador('transacoes',b);
            assert.equal(Number(depois.quantidade),10000);
            assert.equal(depois.no_minuto,antes.no_minuto);
            assert.equal(depois.no_dia,antes.no_dia);
        });

        await t.test('RPC não ultrapassa cota; falha não altera saldo nem histórico; reenvio não consome outra reserva', async () => {
            await login();
            const id=(await db.query("insert into public.cofrinhos(nome,meta) values('teste',100) returning id")).rows[0].id;
            const pedido='33333333-3333-4333-8333-333333333333';
            const mover=(p=pedido)=>db.query("select public.movimentar_cofrinho($1,'guardar',10,$2)",[id,p]);
            await mover(); await mover();
            assert.equal(Number((await contador('movimentos_cofrinho')).quantidade),1);
            assert.equal((await contador('movimentos_cofrinho')).no_minuto,1);
            await admin();
            await db.query("update privado.limites_escrita set quantidade=50000 where usuario_id=$1 and recurso='movimentos_cofrinho'",[a]);
            await login(); await assert.rejects(mover('44444444-4444-4444-8444-444444444444'),limite);
            assert.equal(Number((await db.query('select saldo from public.cofrinhos where id=$1',[id])).rows[0].saldo),10);
            assert.equal((await db.query('select count(*)::int n from public.movimentos_cofrinho')).rows[0].n,1);
            // Falha na atualização da meta também desfaz a inserção de movimento.
            await admin();
            await db.query("update privado.limites_escrita set quantidade=1 where usuario_id=$1 and recurso='movimentos_cofrinho'",[a]);
            await db.query("update privado.limites_escrita set no_minuto=120 where usuario_id=$1 and recurso='cofrinhos'",[a]);
            await login(); await assert.rejects(mover('55555555-5555-4555-8555-555555555555'),limite);
            assert.equal(Number((await contador('movimentos_cofrinho')).quantidade),1);
        });

        await t.test('cliente não altera contadores, acessos, propriedade ou permissões', async () => {
            for (const role of ['anon','authenticated']) {
                await login(a,role);
                for (const sql of ['select * from privado.limites_escrita','delete from privado.limites_escrita',
                    'select * from public.acessos_servicos',`insert into public.acessos_servicos(usuario_id,insights,cotacoes) values('${a}',true,true)`,
                    `select public.reservar_insight_seguro('${a}')`,`select public.reservar_cotacao_segura('${a}')`,
                    `select public.reservar_insight('${a}')`,`select public.reservar_cotacao('${a}')`]) {
                    await assert.rejects(db.exec(sql),/permission denied/);
                }
            }
            await login();
            await assert.rejects(db.query("insert into public.transacoes(usuario_id,data,descricao,valor) values($1,current_date,'invasão',1)",[b]),/row-level security/);
            assert.equal((await db.query('select * from public.transacoes where usuario_id=$1',[b])).rows.length,0);
        });

        await t.test('cadastro não libera provedores; aprovação, revogação, expiração e cotas são efetivas', async () => {
            const reservar=(fn,id=a)=>db.query(`select public.${fn}($1) ok`,[id]);
            await login(a,'service_role');
            for (const fn of ['reservar_insight_seguro','reservar_cotacao_segura','reservar_insight','reservar_cotacao']) {
                await assert.rejects(reservar(fn),e=>e.code==='42501');
            }
            await db.query('insert into public.acessos_servicos(usuario_id,insights,cotacoes) values($1,true,true)',[a]);
            assert.equal((await reservar('reservar_insight_seguro')).rows[0].ok,true);
            assert.equal((await reservar('reservar_insight_seguro')).rows[0].ok,false);
            for(let i=0;i<30;i++) assert.equal((await reservar('reservar_cotacao_segura')).rows[0].ok,true);
            assert.equal((await reservar('reservar_cotacao_segura')).rows[0].ok,false);
            await assert.rejects(reservar('reservar_cotacao_segura',b),e=>e.code==='42501');
            await db.query('update public.acessos_servicos set insights=false where usuario_id=$1',[a]);
            await assert.rejects(reservar('reservar_insight_seguro'),e=>e.code==='42501');
            await db.query("update public.acessos_servicos set expira_em=now()-interval '1 second' where usuario_id=$1",[a]);
            await assert.rejects(reservar('reservar_cotacao_segura'),e=>e.code==='42501');
        });

        await t.test('exclusão da conta remove registros e contadores sem impedir a cascata', async () => {
            await admin();
            await db.query('delete from auth.users where id=$1',[a]);
            assert.equal((await db.query('select * from privado.limites_escrita where usuario_id=$1',[a])).rows.length,0);
            assert.equal((await db.query('select * from public.acessos_servicos where usuario_id=$1',[a])).rows.length,0);
            assert.equal((await db.query('select * from public.transacoes where usuario_id=$1',[a])).rows.length,0);
        });
    } finally { await db.close(); }
});
