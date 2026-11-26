-- Aplicar depois de 202611120001_hardening.sql. Não apaga transações.
begin;
create index if not exists uso_insights_data on public.uso_insights (usado_em);
create or replace function public.reservar_insight(p_usuario uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_usuario is null then return false; end if;
  -- Todas as instâncias compartilham o mesmo bloqueio antes de verificar a cota.
  perform pg_catalog.pg_advisory_xact_lock(7812345001::bigint);
  delete from public.uso_insights where usado_em <= now() - interval '24 hours';
  if (select count(*) from public.uso_insights) >= 100 then return false; end if;
  if (select count(*) from public.uso_insights where usuario_id = p_usuario) >= 3 then return false; end if;
  if exists (select 1 from public.uso_insights where usuario_id = p_usuario and usado_em > now() - interval '30 seconds') then return false; end if;
  insert into public.uso_insights (usuario_id) values (p_usuario);
  return true;
end $$;
revoke all on function public.reservar_insight(uuid) from public, anon, authenticated;
grant execute on function public.reservar_insight(uuid) to service_role;
commit;
