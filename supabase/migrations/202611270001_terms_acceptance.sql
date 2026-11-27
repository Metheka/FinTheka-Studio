-- Aceites novos são registrados pelo servidor. Não altera contas existentes.
begin;
create table if not exists public.aceites_termos (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  versao text not null,
  aceito_em timestamptz not null default now()
);
alter table public.aceites_termos enable row level security;
revoke all on public.aceites_termos from public,anon,authenticated;
grant select on public.aceites_termos to authenticated;
drop policy if exists aceite_proprio on public.aceites_termos;
create policy aceite_proprio on public.aceites_termos for select to authenticated
  using (usuario_id=(select auth.uid()));
create or replace function public.registrar_aceite_cadastro() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.raw_user_meta_data->'termos_aceitos' is distinct from 'true'::jsonb
     or new.raw_user_meta_data->>'termos_versao' is distinct from '2026-11-27' then
    raise exception 'Aceite os Termos de Serviço vigentes para criar a conta.' using errcode='23514';
  end if;
  insert into public.aceites_termos(usuario_id,versao) values(new.id,'2026-11-27');
  return new;
end $$;
revoke all on function public.registrar_aceite_cadastro() from public,anon,authenticated;
drop trigger if exists registrar_aceite on auth.users;
create trigger registrar_aceite after insert on auth.users
for each row execute function public.registrar_aceite_cadastro();
commit;
