-- Aplicar após as duas migrações de 12/11. Não altera transações/perfis.
begin;
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
commit;
