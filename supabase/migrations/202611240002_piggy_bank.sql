-- Aplicar após as três migrações anteriores. Apenas registros manuais de economia.
begin;
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
commit;
