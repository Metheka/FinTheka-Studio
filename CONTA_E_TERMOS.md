# Termos e exclusão de conta

O cadastro exige uma caixa desmarcada de aceite dos Termos de Serviço, com links para os termos e a privacidade. O formulário envia a versão `2026-11-27` e o aceite nos metadados de cadastro. A migração abaixo registra a versão e o horário do servidor em uma tabela protegida e exige aceite válido para novos cadastros. Não altera contas existentes nem inventa aceites antigos. O próprio usuário pode consultar seu registro de aceite, mas não reescrevê-lo.

“Minha conta”, abaixo do e-mail no menu, permite consultar os termos e excluir a própria conta. A exclusão exige senha atual e a palavra `EXCLUIR`. Uma Edge Function valida a sessão com o Supabase, confirma a senha no servidor e chama a API administrativa para apagar somente o usuário autenticado. O navegador nunca recebe a chave administrativa. Não há exclusão apenas visual: se o serviço não confirmar, a tela apresenta a falha.

## Ativar no Supabase online

Para publicar pelo navegador sem instalar a CLI, há uma cópia completa da função em `supabase/ativacao/04-excluir-conta.ts`; siga [o guia do editor do painel](supabase/ativacao/LEIA-ME.md). Ela é gerada do mesmo código da função original, com os helpers incluídos.

1. Execute `supabase/migrations/202611270001_terms_acceptance.sql` no SQL Editor do projeto correto. Essa migração depende apenas de Supabase Auth; não exige as tabelas dos recursos ainda pendentes. Não altera as tabelas financeiras existentes. Publicar a nova interface antes de ativar essa regra evita bloquear cadastros pela versão antiga do formulário.
2. Publique a função nova com a Supabase CLI autenticada e conectada ao projeto correto:

   ```sh
   supabase functions deploy excluir-conta --project-ref htueuvvndtlusfyaqlqa
   ```

3. Confira `ALLOWED_ORIGIN` com `http://127.0.0.1:5000` e as demais origens que utiliza. A função usa `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` somente no servidor. Os três últimos normalmente são disponibilizados pelo ambiente Supabase; nunca copie a chave administrativa para `public/config.js`.
4. Ensaie com uma **conta descartável** criada com aceite: senha incorreta não exclui; cancelar não exclui; confirmação correta remove a conta, os registros vinculados e o aceite. Uma segunda conta deve permanecer intacta. Não use sua conta principal para testar a exclusão definitiva.

As relações no schema do projeto removem perfil, transações, metas, movimentos e controles de uso ao apagar `auth.users`. A exclusão depende dessas relações no banco real; se o projeto hospedado tiver estruturas adicionais, confira suas regras antes do ensaio. O aplicativo não usa Storage para arquivos de usuário; eventual conteúdo adicionado a outros serviços deve ter sua política de exclusão definida antes do lançamento. Backups e arquivos exportados não são apagados por esse fluxo. Tokens de acesso já emitidos podem existir até expirar; os registros vinculados são removidos e suas chaves estrangeiras impedem novas gravações para a conta excluída.

O código foi preparado sem excluir contas nem alterar o Supabase remoto nesta implementação. Até publicar a função, o botão informa a indisponibilidade em vez de afirmar sucesso. Até aplicar a migração, o cadastro envia os metadados de aceite, mas o registro independente e a exigência no banco ainda não estão ativos.

Referência técnica: a [API administrativa de exclusão do Supabase](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser) deve ser usada no servidor, com a identidade previamente validada por [getUser](https://supabase.com/docs/reference/javascript/auth-getuser).

## Ambiente local opcional

`npm start` continua usando o Supabase original. Para testar tudo isoladamente, use `npm run start:local`: aplica a migração no banco separado e implementa a exclusão com a mesma confirmação e verificação de senha. Nada é sincronizado com a nuvem.

## Verificação

`npm run check:local` executa lógica, banco, segurança e navegador. Os testes novos verificam aceite obrigatório, preservação de contas antigas, registro imutável, isolamento, recusa de identidade falsa, senha incorreta, falha administrativa e exclusão real em banco descartável. `npm run check:edge-types` inclui os tipos da função nova.

Os termos descrevem o protótipo acadêmico atual. Contato de suporte e retenção de backups continuam pendentes de definição para uma publicação pública; não foi declarado que o projeto possui certificação ou conformidade jurídica integral.
