# Ativar Porquinho, Mercado e exclusão pelo painel

Os arquivos desta pasta estão completos para copiar. Eles são gerados a partir do código do projeto com `npm run prepare:supabase`; não foram executados no seu Supabase pelo assistente. O SQL não contém dados de exemplo, não remove seus registros e não precisa executar `schema.sql` novamente. Os termos que você informou já ter ativado são preservados.

## 1. Banco e Porquinho — SQL Editor

Abra `01-banco-recursos.sql` no VS Code, copie **tudo** e execute em **SQL Editor → New query → Run**, no mesmo projeto do site. Ele prepara as tabelas e a função dos porquinhos, os controles de uso das cotações e os limites de escrita. Faz tudo em uma transação. Depois de sucesso, atualize o site, entre e teste criar um porquinho e registrar um valor.

Este pacote reúne as migrações de cotas, Porquinho e proteção de abuso. Não precisa executar novamente esses três arquivos separadamente. Ele suporta a base com `perfis` e `transacoes` já existentes, criando também o controle privado de uso de IA se faltar, sem liberar IA para ninguém. Não substitui a revisão de backup e dos dados do seu projeto.

## 2. Liberar cotações para sua conta — SQL Editor

Abra `02-liberar-cotacoes.sql` e altere **apenas a linha de atribuição**, colocando o e-mail com que você entra no site:

```sql
email_conta text := 'seu-email-de-login@exemplo.com';
```

Mantenha as outras linhas como estão. Copie o arquivo inteiro e execute em uma nova consulta do SQL Editor. Isso aprova só essa conta para cotações. Não libera IA nem promove a administrador. Uma conta nova não recebe a aprovação automaticamente. Autorizações que já tenham expirado exigem revisar sua data de expiração, sem liberá-las silenciosamente.

## 3. Publicar Mercado/Cotações — Edge Functions

Este passo usa **Edge Functions**, não SQL Editor:

1. Se já existir a função **`cotacoes`**, abra seu editor. Se não existir, use **Deploy a new function → Via Editor** e dê exatamente o nome **`cotacoes`**.
2. No arquivo `index.ts` do painel, substitua o conteúdo pelo arquivo inteiro **`03-cotacoes.ts`** desta pasta. Ele já inclui os helpers necessários; não precisa criar arquivos adicionais nem copiar a pasta `_shared` no painel.
3. Clique em **Deploy function** ou **Deploy updates**.
4. Nas configurações/detalhes dessa função, deixe **Verify JWT** desligado, como no `supabase/config.toml` do projeto. Esta implementação verifica o token do usuário dentro do próprio código com `auth.getUser`; não permite consultar cotações sem login e aprovação. É importante publicar este código completo antes de ajustar essa opção.

Referências oficiais: [editor e publicação](https://supabase.com/docs/guides/functions/quickstart-dashboard), [verificação JWT no painel](https://supabase.com/kb/troubleshooting/edge-function-401-error-response).

## 4. Segredos das funções

Em **Edge Functions → Secrets**, configure ou confira:

| Nome | Valor |
| --- | --- |
| `ALLOWED_ORIGIN` | `http://127.0.0.1:5000,http://localhost:5000` |
| `AWESOMEAPI_KEY` | Sua chave da AwesomeAPI, quando necessária para o acesso/cota do provedor |

Se `ALLOWED_ORIGIN` já tiver outros endereços válidos, acrescente os locais separados por vírgula, preservando os existentes. Use endereço sem barra no final. Se usar outra porta no site, inclua a origem exata daquela porta também. A mesma configuração atende à função de exclusão.

As funções usam `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` disponibilizados pelo ambiente Supabase. Não coloque a chave administrativa no HTML, em `public/config.js` ou no GitHub. Não precisa editar o código gerado para incluir segredos.

O Mercado depende da AwesomeAPI. Publicar a função não remove limites ou indisponibilidade do provedor. Se continuar ocorrendo erro de limite após a configuração, confira sua chave e as cotas no painel da AwesomeAPI. Não há troca automática para cotações inventadas no modo Supabase.

Referências: [segredos do Supabase](https://supabase.com/docs/guides/functions/secrets), [chave da AwesomeAPI](https://docs.awesomeapi.com.br/instrucoes-api-key).

## 5. Ativar também a exclusão da conta

Em **Edge Functions**, crie **`excluir-conta`** via editor (ou edite essa função, se já existir). Substitua seu `index.ts` pelo conteúdo inteiro de **`04-excluir-conta.ts`**, publique e deixe **Verify JWT** desligado nessa função também: ela valida a sessão e a senha no servidor antes da exclusão. Teste somente com uma conta descartável. O SQL dos termos que você já aplicou não publica essa função.

## Conferir no site

Use `npm start`, entre com a conta aprovada e atualize a página. No Porquinho, crie uma meta e registre uma economia; no Mercado, teste USD e EUR nos períodos disponíveis. Para excluir, use **Minha conta**, senha e confirmação `EXCLUIR`, exclusivamente na conta descartável do ensaio. Os passos 1–5 não ativam IA; siga a seção abaixo para isso.

## 6. Ativar Assistente IA e Gerar insight

1. Neste projeto, a função publicada chama-se **`quick-service`**, e `public/config.js` já aponta para esse nome técnico. Em **Edge Functions**, edite **`quick-service`**. Cole todo o arquivo **`05-insights.ts`** no `index.ts` do painel e publique. O arquivo continua com esse nome no repositório; os nomes “Assistente IA” e “Gerar insight” no site não mudam. Deixe **Verify JWT** desligado nessa função: a sessão e a autorização são verificadas dentro do código. Para publicar pela CLI, use `supabase functions deploy quick-service --project-ref htueuvvndtlusfyaqlqa`; o `config.toml` reaproveita a fonte `functions/insights/index.ts`.
2. Crie uma chave na [Groq](https://console.groq.com/keys), usando a sua conta. Em **Edge Functions → Secrets**, salve-a com o nome **`GROQ_API_KEY`**. Não cole a chave no código, no chat ou no GitHub. Confira também `ALLOWED_ORIGIN` conforme o passo 4.
3. Abra **`06-liberar-ia.sql`**, altere somente a linha `email_conta text := 'SEU_EMAIL_AQUI';` para seu e-mail de login e execute o arquivo inteiro no **SQL Editor**. Esse passo exige as tabelas e funções já preparadas no passo 1 deste guia. Ele libera apenas sua conta para IA e preserva a permissão anterior de cotações.
4. Entre com essa conta no site e envie uma pergunta curta no Assistente IA. Para conferir “Gerar insight”, tenha pelo menos uma transação cadastrada e aguarde 30 segundos entre respostas. Chat e insight compartilham 3 tentativas por conta em 24 horas, sujeitas às cotas gerais e da Groq. Falhas após reservar uma tentativa também consomem a cota. Se a conta descartável for excluída, não é possível continuar testando com ela.

O modelo foi atualizado para `openai/gpt-oss-20b`, com esforço baixo e resposta sem conteúdo interno de raciocínio. A Groq [retirou o modelo anterior para contas comuns](https://console.groq.com/docs/deprecations) em 16/08/2026. A configuração da chave, do plano, das cotas e da permissão do modelo precisa ser validada na sua conta; os testes locais não chamam o provedor com uma chave real nem garantem gratuidade do seu plano. Não há troca automática de provedor ou modelo.

Para verificar o serviço sem escrever dados, execute `npm run check:remote`. HTTP 401 nas funções sem sessão é esperado; não comprova sozinho a chamada autenticada ao provedor. Se algum passo retornar erro, guarde a mensagem do erro, sem compartilhar senhas ou chaves.

## Validação dos arquivos preparados

`node --test tests/activation.test.cjs` executa o pacote SQL em PostgreSQL descartável, preserva registros de teste existentes, confere reaplicação e liberação individual. `npm run check:edge-types` verifica também os arquivos completos das funções desta pasta. Os testes não comprovam que o seu projeto hospedado já esteja configurado.
