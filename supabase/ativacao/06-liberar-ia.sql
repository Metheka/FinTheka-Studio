-- Troque SEU_EMAIL_AQUI pelo e-mail da conta que usará na apresentação.
-- Libera só IA; preserva a permissão de cotações, não muda papel nem cria conta.
do $$
declare
  email_conta text := 'SEU_EMAIL_AQUI';
  dono uuid;
begin
  if email_conta = 'SEU_EMAIL_AQUI' then
    raise exception 'Substitua o valor de email_conta pelo seu e-mail antes de executar.';
  end if;
  select id into dono from auth.users where lower(email)=lower(btrim(email_conta));
  if dono is null then raise exception 'Conta não encontrada. Confira o e-mail usado para entrar no site.'; end if;
  if exists(select 1 from public.acessos_servicos where usuario_id=dono and expira_em<=now()) then
    raise exception 'Esta autorização possui expiração vencida. Confira expira_em antes de reativá-la.';
  end if;
  insert into public.acessos_servicos(usuario_id,insights) values(dono,true)
  on conflict(usuario_id) do update set insights=true;
end $$;
