-- Aplicar depois das quatro migrações anteriores. Não remove dados existentes.
begin;
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
commit;
