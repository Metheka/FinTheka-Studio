# Apresentar o FinTheka localmente

O site abre no próprio computador e usa **o Supabase online original**, com as contas e os dados que já existem lá. Firebase e estrutura do Supabase estão preservados. O banco local de testes fica desligado por padrão.

## Preparar o computador do trabalho

Instale Node.js 24 LTS, com npm. Baixe/clone este repositório, abra um terminal **na pasta que contém `package.json`** e execute:

```powershell
npm ci
npm start
```

A instalação e o uso do Supabase precisam de internet. Instale e ensaie na rede da escola antes da apresentação. O GitHub não inclui `node_modules`; rode `npm ci` no outro computador.

Abra **http://127.0.0.1:5000** no Chrome ou Edge atualizado. Mantenha o terminal aberto. Use sempre o mesmo endereço para conservar a sessão do navegador. Não abra `index.html` por duplo clique; use o servidor iniciado por `npm start`.

No Windows, depois de instalar o Node, também pode dar dois cliques em **`Iniciar-FinTheka.cmd`**. Ele instala as dependências se estiverem ausentes e inicia o servidor. Mantenha a janela aberta durante a apresentação.

Entre com sua conta existente para acessar seus dados no Supabase, inclusive em outro computador. Não precisa recriar o banco, copiar registros nem criar uma nova conta. Uma conta nova, criada com e-mail e senha de 12 a 72 caracteres, começa com seus próprios registros e precisa confirmar o e-mail pelo link do Supabase. Confira antecipadamente que `http://127.0.0.1:5000` está nos redirecionamentos permitidos do Auth para os links de confirmação e recuperação. O modo online não promove contas a administrador automaticamente.

Se a porta estiver ocupada, encerre o outro servidor. Para escolher outra porta no PowerShell:

```powershell
$env:PORT = '5001'
npm start
```

Nesse caso abra `http://127.0.0.1:5001` e confira o redirecionamento do Auth para essa porta. Para parar, pressione **Ctrl+C** no terminal.

## O que demonstrar

1. Crie uma receita e uma despesa no mês atual e confirme o pagamento pelo controle da tabela.
2. Mostre saldo, filtros, categorias, gráficos, relatórios e contatos gerados pelos registros.
3. Importe um CSV e exporte os registros. Exemplo sem cabeçalho, com ponto e vírgula, data `AAAA-MM-DD` e valor negativo para despesa:

   ```csv
   2026-11-27;Pagamento recebido;Cliente exemplo;Serviços;1500,00;Pix
   2026-11-27;Material;Loja exemplo;Compras;-120,50;Cartão de débito
   ```

4. Crie um Porquinho, registre uma economia e uma retirada e consulte o histórico. São registros manuais: não movimentam dinheiro e não alteram automaticamente as transações.
5. Abra o simulador, ajuste prazo/aporte/taxa e exporte a projeção.
6. Mercado/Cotações, assistente e Porquinho dependem da configuração real das tabelas e Edge Functions do Supabase. A consulta de 27/11 encontrou Porquinho indisponível pela API, IA com HTTP 404 e cotações com HTTP 503. O frontend trata os erros, mas esses recursos precisam de configuração no projeto online para funcionar de verdade; rodar o site localmente ou fazer push não resolve isso.
7. Recarregue a página ou pare/inicie o servidor para mostrar que as transações e metas continuam gravadas. Saia e entre com outra conta para demonstrar a separação dos dados.

## Banco local opcional — apenas para testes posteriores

Para a apresentação, mantenha `npm start`. Se quiser ativar explicitamente o banco isolado de testes, pare o servidor e execute **`npm run start:local`**. Esse modo usa PGlite, contas separadas, cotações simuladas e assistente por regras. Não acessa nem copia os dados do Supabase e não insere exemplos automaticamente. Sua primeira conta nesse ambiente será administradora. Para voltar ao banco online, pare o servidor e use `npm start`.

### Transportar somente o banco local de testes

As instruções abaixo servem exclusivamente ao banco opcional em `.local-data/postgres`, ignorado pelo Git. Não se aplicam ao banco Supabase, que permanece online e é acessado pela mesma conta em qualquer computador.

1. Pare o servidor com Ctrl+C e crie um backup:

   ```powershell
   npm run local:backup
   ```

2. Copie o arquivo `backups/fintheka-....tar.gz` para o outro computador por um meio privado. Ele contém contas e registros; não o publique no GitHub.
3. No outro computador, instale as dependências, deixe o servidor parado e restaure:

   ```powershell
   npm run local:restore -- "caminho/do/fintheka-....tar.gz"
   npm run start:local
   ```

A restauração substitui o banco ativo pelo backup e preserva o banco anterior dentro de `.local-data/postgres-antes-...`. As sessões do backup são encerradas; entre com o e-mail e a senha da conta que você criou. Restaure apenas backups seus ou de origem confiável.

Não apague `.local-data` se quiser manter os registros. Não edite os arquivos internos do PostgreSQL. Os backups não são criptografados.

## Esqueceu a senha local

Sem envio de e-mail no modo local. No computador onde o banco está salvo, pare o servidor e execute:

```powershell
npm run local:password -- "seu@email.com"
```

Digite e confirme a nova senha no terminal; a digitação fica oculta. Depois execute `npm run start:local` e entre novamente nesse banco opcional. O comando não altera senhas do Supabase. Para sua conta online, use “Esqueci a senha” na tela de login.

## Conferir antes de apresentar

```powershell
npm run check:local
```

Inclui credenciais públicas, lógica, API e persistência local, segurança e navegador. Os testes de navegador precisam do Chrome instalado. O teste local completo bloqueia requisições externas para conferir a operação sem provedores. A captura de revisão visual opcional continua sendo pulada sem `CAPTURE_REDESIGN=1`.

## GitHub e serviços preservados

Faça o commit/push pelo VS Code ou pelos comandos Git de costume. `.local-data`, `backups`, dependências e resultados de testes ficam fora do commit. Firebase Hosting, a configuração remota em `public/config.js`, schema, migrações e Edge Functions continuam presentes.

`npm start` entrega a configuração original de `public/config.js`, conectada ao Supabase online. O alias abaixo tem o mesmo comportamento:

```powershell
npm run start:remote
```

O modo de apresentação exige internet e configuração dos serviços, conforme `LANCAMENTO.md`. O envio ao GitHub não implanta Firebase nem executa migrações remotas. O modo de testes só entrega configuração local quando iniciado com `npm run start:local`; não modifica `public/config.js`.
