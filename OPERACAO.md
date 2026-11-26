# Operação do FinTheka — 25/11/2026

## Proteção de abuso — aplicar a quinta migração

As regras abaixo só entram em produção depois de aplicar `202611250001_abuse_protection.sql` e publicar as duas funções atualizadas. A implantação desta etapa ainda está pendente de conexão administrativa.

| Recurso | Registros por conta | Inserções/atualizações por minuto | Inserções/atualizações em 24 horas |
| --- | ---: | ---: | ---: |
| Transações | 10.000 | 600 | 3.000 |
| Metas | 100 | 120 | 500 |
| Movimentos de metas | 50.000 | 60 | 1.000 |

As janelas de gravação são ancoradas na primeira escrita e reiniciam após um minuto ou 24 horas. Não são janelas móveis. Um movimento novo usa uma escrita de movimento e uma atualização da meta. Reenviar uma requisição já concluída não conta outra vez. Excluir libera espaço sem reiniciar a contagem de frequência. Contadores ficam no schema privado, com RLS e sem acesso de clientes. Operações em lote que ultrapassem um limite são desfeitas integralmente, inclusive seus contadores e saldos.

Contas legadas acima dos limites são preservadas. Inserir novos registros fica bloqueado até liberar espaço; alterações continuam sujeitas à frequência. O frontend não carrega históricos acima dos tetos nem apresenta totais parciais como se fossem completos. Organize esses casos por atendimento autenticado antes de liberar o acesso: exporte e confira os dados, combine com o titular quais registros podem ser removidos e não apague dados automaticamente para caber na cota.

## Liberação de IA e cotações

Contas novas não podem consumir a cota dos provedores só por se cadastrarem. Depois de verificar o titular, um operador com acesso ao SQL Editor pode liberar uma conta específica. Substitua o e-mail abaixo pelo e-mail verificado; confira se `returning` mostra exatamente a conta esperada. Não libere todos os cadastros em lote: isso anularia a proteção contra criação abusiva de contas.

```sql
insert into public.acessos_servicos(usuario_id, insights, cotacoes)
select id, true, true from auth.users
where email = 'SUBSTITUA-PELO-EMAIL-VERIFICADO'
  and email_confirmed_at is not null
on conflict(usuario_id) do update
  set insights=true, cotacoes=true, expira_em=null
returning usuario_id;
```

Pode-se liberar só um serviço e definir `expira_em` para acesso temporário. Para revogar, atualize `insights=false, cotacoes=false` para o UUID confirmado ou remova a linha. O papel de administrador do aplicativo não permite aprovar a si mesmo nem ler essa tabela pela API. Novas reservas são bloqueadas após a revogação; chamadas já iniciadas podem terminar.

Os limites globais continuam existindo. Não aprove contas sem controle de identidade: várias contas aprovadas ainda podem disputar a capacidade compartilhada. Monitore também cadastro, autenticação e tráfego na infraestrutura; cotas de aplicação não garantem resistência ilimitada a DDoS.

Responsável informado: **Metheka**. Este é o procedimento preparado para a operação; backup, recuperação, e-mail e exclusão remota ainda não foram executados nesta revisão. O lançamento depende dessas validações, além do guia [LANCAMENTO.md](LANCAMENTO.md).

## Suporte sem divulgar e-mail pessoal

Criar uma caixa exclusiva do produto. Com domínio próprio, usar um endereço como `suporte@SEU-DOMINIO`; sem domínio, criar uma caixa separada no provedor escolhido. Não divulgar o endereço pessoal. Configurar autenticação em duas etapas e testar envio/recebimento de fora da conta. Um alias que encaminhe para a caixa pessoal só preserva sua privacidade se as respostas também saírem pelo alias; verificar isso antes de publicar.

Depois de criar e testar a caixa: substituir o aviso de pré-lançamento em `public/privacidade.html` pelo contato real, publicar o prazo de atendimento e os prazos efetivamente configurados para backups/logs. Não inventar endereço, identidade jurídica ou promessa de retenção. O endereço do suporte pode ser diferente do remetente SMTP de autenticação.

## Acesso administrativo e proteção de cadastro

- Ativar autenticação em duas etapas nas contas proprietárias de Supabase, Firebase, Groq e e-mail. Guardar códigos de recuperação fora do repositório.
- Restringir membros e tokens administrativos ao necessário. Nunca usar a chave `service_role` no navegador ou em chamados de suporte.
- No Supabase, confirmar e-mail obrigatório e mínimo de 12 caracteres para senhas novas, alinhado ao formulário. Ativar proteção contra senhas comprometidas se disponível no plano. Conferir limites de cadastro, login, recuperação e envio de e-mails no painel.
- Conferir a proteção contra abuso de cadastro oferecida pelo Supabase. Se for habilitar CAPTCHA, integrar o desafio no formulário e enviar o token ao SDK antes de ativar a exigência no servidor. **CAPTCHA ainda não está implementado no cliente**; habilitá-lo isoladamente pode interromper cadastros/recuperações.
- Não considerar o limite de cotações uma proteção completa contra DDoS ou criação massiva de contas. Ele controla solicitações autenticadas ao handler; o gateway e a autenticação continuam sujeitos às cotas da infraestrutura.

Referências: [segurança de senhas](https://supabase.com/docs/guides/auth/password-security), [limites de autenticação](https://supabase.com/docs/guides/auth/rate-limits).

## Backup e recuperação

1. Conferir o plano e os backups disponíveis em Database → Backups. No Free, planejar exportações regulares e cópia externa; não presumir que exista backup automático recuperável. Seguir o [guia oficial de backup](https://supabase.com/docs/guides/platform/backups) e o [procedimento de backup/restauração por CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).
2. Definir e registrar frequência, retenção, local criptografado, responsável e perda máxima de dados aceitável. Sugestão inicial a validar: cópia diária, retenção por 7 dias e ensaio mensal de restauração. Não publicar essa promessa até o processo estar ativo e testado. Não guardar dumps em `public/`, no Git, em chats ou em pastas com compartilhamento público.
3. Fazer uma cópia antes de migrações. Incluir os dados necessários à recuperação das identidades de autenticação, perfis e transações; uma exportação CSV de transações não recupera contas, permissões ou funções. Seguir os escopos e as exclusões de schemas indicados pelo guia oficial; não improvisar restauração sobre o projeto ativo.
4. Guardar separadamente fonte versionada, migrações, configuração de autenticação, inventário dos secrets e instruções de deploy. O dump do banco não substitui os secrets nem publica Edge Functions.
5. Restaurar primeiro em ambiente isolado. Desabilitar envio real de e-mails e chamadas a provedores nesse ambiente. Conferir contagens e totais, login com contas de teste, permissões entre duas contas, migrações e cotas.
6. Registrar data da cópia, resultado do ensaio e tempo real de recuperação. Em incidente, avaliar os dados que seriam perdidos e obter confirmação do proprietário sobre o ponto de recuperação antes de substituir produção.

## Pedidos de cópia e exclusão

1. Receber o pedido no canal exclusivo. Confirmar o controle da conta por comunicação ao e-mail já cadastrado; nunca solicitar senha, token, chave de API ou código de recuperação. Não excluir contas com base apenas em nome ou captura de tela.
2. Para fornecer cópia, consultar somente os registros do usuário confirmado. Entregar por canal privado com acesso restrito. Não enviar dump geral nem dados de outras pessoas. Registrar apenas o necessário para acompanhar a solicitação.
3. Antes da exclusão, explicar a perda dos dados e confirmar a intenção do titular. No Supabase, localizar o UUID correto em Authentication → Users e usar a exclusão definitiva da conta. Não apagar somente a linha de `perfis`. As seis tabelas do aplicativo usam exclusão em cascata da identidade em `auth.users`.
4. Conferir que perfil, transações, uso de IA, uso de cotações, porquinhos e movimentos daquele UUID desapareceram. Verificar que outra conta continua intacta. Ensaiar todo o procedimento com conta descartável antes de abrir ao público. Cópias de dados e testes de restauração devem incluir metas e movimentos; conversas da IA não possuem tabela no banco.
5. A exclusão de usuário não faz o JWT já emitido expirar instantaneamente. As funções verificam o usuário no servidor; as relações do banco impedem recriar registros para uma identidade removida. Ainda assim, verificar sessões e revogações no fluxo real. Ver [gerenciamento de usuários](https://supabase.com/docs/guides/auth/managing-user-data).
6. Cópias antigas podem conter os dados até expirar a retenção. Em uma restauração, reaplicar exclusões confirmadas antes de reabrir o serviço. Guardar um registro mínimo e protegido das exclusões até expirar a última cópia aplicável, com prazo definido pelo responsável. Considerar também os logs e políticas dos provedores.

## Monitoramento e resposta

Verificar erros de autenticação, quantidade de cadastros, respostas 429/5xx, uso dos provedores e armazenamento. Não registrar transações completas, senhas ou tokens. Ajustar cotas conforme uso real sem remover validação de identidade.

As cotações permitem 30 consultas por conta e 300 no site em janela móvel de um minuto, contando inclusive respostas atendidas por cache. O contador é compartilhado no PostgreSQL. Chat e insight compartilham 3 tentativas por conta, 100 no site em 24 horas e intervalo de 30 segundos. As mensagens digitadas e o contexto recente também são enviados à Groq no chat. Esses limites não garantem gratuidade da infraestrutura.

Em suspeita de vazamento: restringir o serviço afetado, preservar registros técnicos mínimos, avaliar o alcance, rotacionar credenciais expostas e verificar o acesso entre contas antes de reabrir. Não remover evidências ou restaurar backup por tentativa. Usar os canais oficiais dos provedores e definir a comunicação aos afetados conforme o incidente concreto.
