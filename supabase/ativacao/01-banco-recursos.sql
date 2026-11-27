-- GERADO por npm run prepare:supabase. Copie o arquivo inteiro no SQL Editor.
-- Prepara Porquinho e controle de cotações no banco existente, preservando registros.
-- Não executa schema.sql, não insere dados de exemplo e não altera aceites dos termos.
begin;
do $$ begin
  if to_regclass('public.perfis') is null or to_regclass('public.transacoes') is null then
    raise exception 'Abra o projeto que já contém perfis e transacoes do FinTheka.';
  end if;
end $$;
-- A proteção dos serviços utiliza esta tabela mesmo com a IA ainda desativada.
create table if not exists public.uso_insights (
  usuario_id uuid not null references auth.users(id) on delete cascade,
  usado_em timestamptz not null default now()
);
alter table public.uso_insights enable row level security;
revoke all on public.uso_insights from public,anon,authenticated;
grant select,insert,delete on public.uso_insights to service_role;
-- Fonte: migrations/202611240001_quotes_quota.sql
-- Aplicar após as duas migrações de 12/11. Não altera transações/perfis.
create table if not exists public.uso_cotacoes (
  usuario_id uuid not null references auth.users(id) on delete cascade,
  usado_em timestamptz not null default now()
);
create index if not exists uso_cotacoes_data on public.uso_cotacoes (usado_em);
create index if not exists uso_cotacoes_usuario_data on public.uso_cotacoes (usuario_id, usado_em);
alter table public.uso_cotacoes enable row level security;
revoke all on public.uso_cotacoes from public, anon, authenticated;

create or replace function public.reservar_cotacao(p_usuario uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_usuario is null then return false; end if;
  -- Mesma trava para todas as instâncias; cache local não substitui limite global.
  perform pg_catalog.pg_advisory_xact_lock(7812345002::bigint);
  delete from public.uso_cotacoes where usado_em <= now() - interval '1 minute';
  if (select count(*) from public.uso_cotacoes) >= 300 then return false; end if;
  if (select count(*) from public.uso_cotacoes where usuario_id = p_usuario) >= 30 then return false; end if;
  insert into public.uso_cotacoes (usuario_id) values (p_usuario);
  return true;
end $$;
revoke all on function public.reservar_cotacao(uuid) from public, anon, authenticated;
grant execute on function public.reservar_cotacao(uuid) to service_role;

-- Fonte: migrations/202611240002_piggy_bank.sql
-- Aplicar após as três migrações anteriores. Apenas registros manuais de economia.
create table if not exists public.cofrinhos (
  id bigint generated always as identity primary key,
  usuario_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null check (char_length(btrim(nome)) between 1 and 80),
  meta numeric(14,2) not null check (meta > 0 and meta < 100000000000),
  saldo numeric(14,2) not null default 0 check (saldo >= 0 and saldo < 100000000000),
  prazo date check (prazo is null or prazo between date '0001-01-01' and date '9999-12-31'),
  cor text not null default 'rosa' check (cor in ('rosa','verde','violeta','ambar')),
  criado_em timestamptz not null default now()
);
create index if not exists cofrinhos_usuario on public.cofrinhos(usuario_id, id);
create table if not exists public.movimentos_cofrinho (
  id bigint generated always as identity primary key,
  cofrinho_id bigint not null references public.cofrinhos(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('guardar','retirar')),
  valor numeric(14,2) not null check (valor > 0 and valor < 100000000000),
  requisicao uuid not null,
  criado_em timestamptz not null default now(),
  unique(usuario_id, requisicao)
);
create index if not exists movimentos_cofrinho_usuario on public.movimentos_cofrinho(usuario_id, cofrinho_id, criado_em desc);
alter table public.cofrinhos enable row level security;
alter table public.movimentos_cofrinho enable row level security;
revoke all on public.cofrinhos, public.movimentos_cofrinho from public, anon, authenticated;
grant select, delete on public.cofrinhos to authenticated;
grant insert (usuario_id,nome,meta,prazo,cor) on public.cofrinhos to authenticated;
grant update (nome,meta,prazo,cor) on public.cofrinhos to authenticated;
grant select on public.movimentos_cofrinho to authenticated;
drop policy if exists cofrinhos_ver on public.cofrinhos;
create policy cofrinhos_ver on public.cofrinhos for select to authenticated using (usuario_id = (select auth.uid()));
drop policy if exists cofrinhos_criar on public.cofrinhos;
create policy cofrinhos_criar on public.cofrinhos for insert to authenticated with check (usuario_id = (select auth.uid()));
drop policy if exists cofrinhos_editar on public.cofrinhos;
create policy cofrinhos_editar on public.cofrinhos for update to authenticated using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));
drop policy if exists cofrinhos_apagar on public.cofrinhos;
create policy cofrinhos_apagar on public.cofrinhos for delete to authenticated using (usuario_id = (select auth.uid()) and saldo = 0);
drop policy if exists movimentos_cofrinho_ver on public.movimentos_cofrinho;
create policy movimentos_cofrinho_ver on public.movimentos_cofrinho for select to authenticated using (usuario_id = (select auth.uid()));

create or replace function public.movimentar_cofrinho(p_cofrinho bigint, p_tipo text, p_valor numeric, p_requisicao uuid)
returns public.cofrinhos language plpgsql security definer set search_path = '' as $$
declare
  dono uuid := auth.uid();
  alvo public.cofrinhos;
  anterior public.movimentos_cofrinho;
  novo_saldo numeric;
begin
  if dono is null then raise exception 'Sessão inválida.'; end if;
  if p_tipo is null or p_tipo not in ('guardar','retirar') or p_requisicao is null
     or p_valor is null or not (p_valor > 0 and p_valor < 100000000000)
     or p_valor <> round(p_valor,2) then raise exception 'Movimento inválido.'; end if;
  -- Trava de linha impede duas retiradas concorrentes de gastar o mesmo saldo.
  select * into alvo from public.cofrinhos where id=p_cofrinho and usuario_id=dono for update;
  if not found then raise exception 'Porquinho não encontrado.'; end if;
  select * into anterior from public.movimentos_cofrinho where usuario_id=dono and requisicao=p_requisicao;
  if found then
    if anterior.cofrinho_id<>p_cofrinho or anterior.tipo<>p_tipo or anterior.valor<>p_valor then
      raise exception 'Pedido já utilizado com outros dados.';
    end if;
    return alvo;
  end if;
  novo_saldo := alvo.saldo + case when p_tipo='guardar' then p_valor else -p_valor end;
  if novo_saldo < 0 then raise exception 'Saldo insuficiente no porquinho.'; end if;
  if novo_saldo >= 100000000000 then raise exception 'Saldo acima do limite.'; end if;
  insert into public.movimentos_cofrinho(cofrinho_id,usuario_id,tipo,valor,requisicao)
    values(p_cofrinho,dono,p_tipo,p_valor,p_requisicao);
  update public.cofrinhos set saldo=novo_saldo where id=alvo.id returning * into alvo;
  return alvo;
end $$;
revoke all on function public.movimentar_cofrinho(bigint,text,numeric,uuid) from public,anon;
grant execute on function public.movimentar_cofrinho(bigint,text,numeric,uuid) to authenticated;

-- Fonte: migrations/202611250001_abuse_protection.sql
-- Aplicar depois das quatro migrações anteriores. Não remove dados existentes.
-- Impede novas escritas entre a contagem inicial e a instalação dos triggers.
-- Também evita sobrescrever um incremento concorrente ao reaplicar a migração.
set local lock_timeout = '10s';
lock table public.transacoes, public.cofrinhos, public.movimentos_cofrinho in share row exclusive mode;
create schema if not exists privado;
revoke all on schema privado from public, anon, authenticated;

-- Contadores não podem ser alterados pelo cliente. Uma linha bloqueada por
-- usuário/recurso serializa escritas concorrentes, inclusive inserções em lote.
create table if not exists privado.limites_escrita (
  usuario_id uuid not null references auth.users(id) on delete cascade,
  recurso text not null check (recurso in ('transacoes','cofrinhos','movimentos_cofrinho')),
  quantidade bigint not null default 0 check (quantidade >= 0),
  minuto timestamptz not null default clock_timestamp(),
  no_minuto integer not null default 0,
  dia timestamptz not null default clock_timestamp(),
  no_dia integer not null default 0,
  primary key(usuario_id,recurso)
);
revoke all on privado.limites_escrita from public, anon, authenticated;
alter table privado.limites_escrita enable row level security;

-- Reaplicação reconcilia somente volumes; não reinicia limites de frequência.
insert into privado.limites_escrita(usuario_id,recurso,quantidade)
select usuario_id,'transacoes',count(*) from public.transacoes group by usuario_id
union all select usuario_id,'cofrinhos',count(*) from public.cofrinhos group by usuario_id
union all select usuario_id,'movimentos_cofrinho',count(*) from public.movimentos_cofrinho group by usuario_id
on conflict(usuario_id,recurso) do update set quantidade=excluded.quantidade;

create or replace function privado.controlar_escrita() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  dono uuid;
  teto bigint;
  por_minuto integer;
  por_dia integer;
  instante timestamptz := pg_catalog.clock_timestamp();
  acrescimo integer := case when TG_OP='INSERT' then 1 else 0 end;
begin
  if TG_OP='DELETE' then
    update privado.limites_escrita set quantidade=greatest(0,quantidade-1)
    where usuario_id=old.usuario_id and recurso=TG_TABLE_NAME;
    return old;
  end if;
  dono := new.usuario_id;
  if TG_OP='UPDATE' and new.usuario_id is distinct from old.usuario_id then
    raise exception 'Não é permitido transferir registros entre contas.' using errcode='42501';
  end if;
  case TG_TABLE_NAME
    when 'transacoes' then teto:=10000; por_minuto:=600; por_dia:=3000;
    when 'cofrinhos' then teto:=100; por_minuto:=120; por_dia:=500;
    when 'movimentos_cofrinho' then teto:=50000; por_minuto:=60; por_dia:=1000;
    else raise exception 'Recurso inválido.';
  end case;
  insert into privado.limites_escrita as l
    (usuario_id,recurso,quantidade,minuto,no_minuto,dia,no_dia)
    values(dono,TG_TABLE_NAME,acrescimo,instante,1,instante,1)
  on conflict(usuario_id,recurso) do update set
    quantidade=l.quantidade+acrescimo,
    minuto=case when l.minuto <= instante-interval '1 minute' then instante else l.minuto end,
    no_minuto=case when l.minuto <= instante-interval '1 minute' then 1 else l.no_minuto+1 end,
    dia=case when l.dia <= instante-interval '24 hours' then instante else l.dia end,
    no_dia=case when l.dia <= instante-interval '24 hours' then 1 else l.no_dia+1 end
  where (acrescimo=0 or l.quantidade+acrescimo<=teto)
    and (l.minuto <= instante-interval '1 minute' or l.no_minuto<por_minuto)
    and (l.dia <= instante-interval '24 hours' or l.no_dia<por_dia);
  if not found then
    raise exception 'Limite de armazenamento ou de gravações atingido. Aguarde ou libere espaço.' using errcode='54000';
  end if;
  return new;
end $$;
revoke all on function privado.controlar_escrita() from public,anon,authenticated;

-- AFTER evita contar INSERT ... ON CONFLICT DO NOTHING que não criou linha.
drop trigger if exists limite_escrita on public.transacoes;
create trigger limite_escrita after insert or update or delete on public.transacoes
  for each row execute function privado.controlar_escrita();
drop trigger if exists limite_escrita on public.cofrinhos;
create trigger limite_escrita after insert or update or delete on public.cofrinhos
  for each row execute function privado.controlar_escrita();
drop trigger if exists limite_escrita on public.movimentos_cofrinho;
create trigger limite_escrita after insert or update or delete on public.movimentos_cofrinho
  for each row execute function privado.controlar_escrita();

-- Cadastro não concede orçamento dos provedores. O operador libera cada conta
-- explicitamente no painel SQL, depois de verificar a identidade do cliente.
create table if not exists public.acessos_servicos (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  insights boolean not null default false,
  cotacoes boolean not null default false,
  expira_em timestamptz
);
alter table public.acessos_servicos enable row level security;
revoke all on public.acessos_servicos from public,anon,authenticated;
grant select,insert,update,delete on public.acessos_servicos to service_role;

create or replace function public.reservar_insight(p_usuario uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_usuario is null then return false; end if;
  if not exists(select 1 from public.acessos_servicos where usuario_id=p_usuario
    and insights and (expira_em is null or expira_em>now())) then
    raise exception 'Conta ainda não autorizada para usar a IA.' using errcode='42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(7812345001::bigint);
  delete from public.uso_insights where usado_em<=now()-interval '24 hours';
  if (select count(*) from public.uso_insights)>=100 then return false; end if;
  if (select count(*) from public.uso_insights where usuario_id=p_usuario)>=3 then return false; end if;
  if exists(select 1 from public.uso_insights where usuario_id=p_usuario and usado_em>now()-interval '30 seconds') then return false; end if;
  insert into public.uso_insights(usuario_id) values(p_usuario);
  return true;
end $$;
create or replace function public.reservar_cotacao(p_usuario uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_usuario is null then return false; end if;
  if not exists(select 1 from public.acessos_servicos where usuario_id=p_usuario
    and cotacoes and (expira_em is null or expira_em>now())) then
    raise exception 'Conta ainda não autorizada para consultar cotações.' using errcode='42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(7812345002::bigint);
  delete from public.uso_cotacoes where usado_em<=now()-interval '1 minute';
  if (select count(*) from public.uso_cotacoes)>=300 then return false; end if;
  if (select count(*) from public.uso_cotacoes where usuario_id=p_usuario)>=30 then return false; end if;
  insert into public.uso_cotacoes(usuario_id) values(p_usuario);
  return true;
end $$;
revoke all on function public.reservar_insight(uuid),public.reservar_cotacao(uuid) from public,anon,authenticated;
grant execute on function public.reservar_insight(uuid),public.reservar_cotacao(uuid) to service_role;

-- Nomes novos obrigam os handlers atualizados a falhar de forma fechada se
-- esta migração ainda não foi aplicada; não usam silenciosamente cotas antigas.
create or replace function public.reservar_insight_seguro(p_usuario uuid) returns boolean
language sql set search_path = '' as $$ select public.reservar_insight(p_usuario); $$;
create or replace function public.reservar_cotacao_segura(p_usuario uuid) returns boolean
language sql set search_path = '' as $$ select public.reservar_cotacao(p_usuario); $$;
revoke all on function public.reservar_insight_seguro(uuid),public.reservar_cotacao_segura(uuid) from public,anon,authenticated;
grant execute on function public.reservar_insight_seguro(uuid),public.reservar_cotacao_segura(uuid) to service_role;

notify pgrst, 'reload schema';
commit;
