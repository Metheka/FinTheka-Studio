-- Banco existente: aplicar após schema.sql. Preserva transações e perfis.
begin;
create index if not exists uso_insights_usuario_data on public.uso_insights (usuario_id, usado_em);
create or replace function public.reservar_insight(p_usuario uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_usuario is null then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_usuario::text, 0));
  delete from public.uso_insights where usuario_id = p_usuario and usado_em < now() - interval '24 hours';
  if (select count(*) from public.uso_insights where usuario_id = p_usuario) >= 10 then return false; end if;
  insert into public.uso_insights (usuario_id) values (p_usuario);
  return true;
end $$;
revoke all on function public.reservar_insight(uuid) from public, anon, authenticated;
grant execute on function public.reservar_insight(uuid) to service_role;
grant select, insert, delete on public.uso_insights to service_role;
revoke all on public.uso_insights from public, anon, authenticated;
revoke execute on function public.novo_usuario() from public, anon, authenticated;

insert into public.perfis (id, email, nome)
select id, email, left(coalesce(raw_user_meta_data->>'nome', ''), 100) from auth.users
on conflict (id) do nothing;

create or replace function public.sincronizar_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.perfis set email = new.email where id = new.id;
  return new;
end $$;
revoke all on function public.sincronizar_email() from public, anon, authenticated;
drop trigger if exists ao_alterar_email on auth.users;
create trigger ao_alterar_email after update of email on auth.users
for each row execute function public.sincronizar_email();
commit;
