-- FinTheka Studio: rode este arquivo INTEIRO no SQL Editor do Supabase.

create table public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null default '' check (char_length(nome) <= 100),
  email text,
  papel text not null default 'cliente' check (papel in ('cliente','admin')),
  criado_em timestamptz not null default now()
);

create table public.transacoes (
  id bigint generated always as identity primary key,
  usuario_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data date not null,
  descricao text not null check (char_length(descricao) between 1 and 200),
  recebido_de text not null default '' check (char_length(recebido_de) <= 120),
  categoria text not null default 'Outros' check (char_length(categoria) <= 60),
  valor numeric(14,2) not null check (abs(valor) < 100000000000),
  tipo_pagamento text not null default 'Única' check (char_length(tipo_pagamento) <= 60),
  pago boolean not null default false,
  criado_em timestamptz not null default now()
);
create index on public.transacoes (usuario_id, data desc);

-- controle de uso da IA (só as Edge Functions acessam)
create table public.uso_insights (
  usuario_id uuid not null references auth.users(id) on delete cascade,
  usado_em timestamptz not null default now()
);

alter table public.perfis enable row level security;
alter table public.transacoes enable row level security;
alter table public.uso_insights enable row level security;

-- permissões mínimas: ninguém sem login, e ninguém altera "papel" ou "usuario_id"
revoke all on public.perfis, public.transacoes, public.uso_insights from anon, authenticated;
grant select on public.perfis to authenticated;
grant update (nome) on public.perfis to authenticated;
grant select, insert, delete on public.transacoes to authenticated;
grant update (data, descricao, recebido_de, categoria, valor, tipo_pagamento, pago)
  on public.transacoes to authenticated;

-- regras de linha: cada usuário só enxerga e mexe no que é dele
create policy perfil_ver on public.perfis for select to authenticated
  using (id = (select auth.uid()));
create policy perfil_editar on public.perfis for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy transacoes_ver on public.transacoes for select to authenticated
  using (usuario_id = (select auth.uid()));
create policy transacoes_criar on public.transacoes for insert to authenticated
  with check (usuario_id = (select auth.uid()));
create policy transacoes_editar on public.transacoes for update to authenticated
  using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));
create policy transacoes_apagar on public.transacoes for delete to authenticated
  using (usuario_id = (select auth.uid()));

-- todo cadastro novo vira "cliente" automaticamente
create or replace function public.novo_usuario() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.perfis (id, email, nome)
  values (new.id, new.email, left(coalesce(new.raw_user_meta_data->>'nome', ''), 100));
  return new;
end $$;
create trigger ao_criar_usuario after insert on auth.users
  for each row execute function public.novo_usuario();

-- área do administrador: resumo por usuário (vazio para quem não é admin)
create or replace function public.is_admin() returns boolean
language sql security definer stable set search_path = '' as $$
  select exists (select 1 from public.perfis where id = auth.uid() and papel = 'admin');
$$;

create or replace function public.resumo_usuarios()
returns table (id uuid, nome text, email text, papel text, qtd bigint, total numeric)
language sql security definer stable set search_path = '' as $$
  select p.id, p.nome, p.email, p.papel, count(t.id), coalesce(sum(t.valor), 0)
  from public.perfis p left join public.transacoes t on t.usuario_id = p.id
  where public.is_admin()
  group by p.id
  order by p.criado_em;
$$;
revoke execute on function public.is_admin(), public.resumo_usuarios() from public, anon;
grant execute on function public.resumo_usuarios() to authenticated;

-- DEPOIS de criar sua conta no site, torne-se admin (troque o e-mail):
-- update public.perfis set papel = 'admin' where email = 'seu@email.com';
