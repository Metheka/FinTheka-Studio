# FinTheka Studio

Aplicação de gestão financeira com receitas, despesas, relatórios, metas de economia, simulador e assistente de IA. O frontend usa HTML, CSS e JavaScript; Supabase fornece autenticação, banco e Edge Functions; Firebase Hosting entrega o site.

Este repositório contém somente o FinTheka. Os arquivos do projeto ficam diretamente nesta raiz. Para trabalhar no VS Code, abra esta pasta ou `FinTheka.code-workspace`.

## Executar localmente

Use Node.js 24 e npm. Na raiz do repositório:

```sh
npm ci
npm start
```

Abra `http://127.0.0.1:5000`. O login depende do projeto Supabase configurado em `public/config.js`. A chave publishable desse arquivo é pública; dados e operações são protegidos por autenticação, permissões e RLS no servidor.

## Estrutura

| Pasta | Conteúdo |
| --- | --- |
| `public/` | Site e bibliotecas distribuídas com suas licenças |
| `supabase/` | Schema, cinco migrações e funções de IA/cotações |
| `scripts/` | Servidor local e verificações |
| `tests/` | Testes de lógica, banco, segurança e navegador |

Dependências, caches, resultados de testes, capturas e backups locais são ignorados pelo Git. Os scripts históricos de patch foram arquivados localmente em `artifacts/source-backups/` e não fazem parte do repositório.

## Verificar

```sh
npm run check:credentials
npm test
npm run test:security
npm run test:browser
```

Os testes de navegador usam o Chrome instalado. `npm run check:edge-types` verifica as funções com Deno e pode precisar de rede. `npm run check:release` acrescenta verificações remotas; uma falha remota não é corrigida apenas publicando os arquivos no GitHub.

## GitHub e publicação do site

O Git deste projeto é independente do repositório da pasta superior. A branch inicial é `main`. Para enviar a um repositório vazio criado na sua conta do GitHub, use o endereço HTTPS informado pelo próprio GitHub:

```sh
git remote add origin https://github.com/SEU-USUARIO/fintheka.git
git push -u origin main
```

Substitua `SEU-USUARIO` e o nome pelo destino correto. O envio ao GitHub não publica o site no Firebase, não executa migrações e não configura os serviços externos.

**A implantação das correções de segurança ainda está pendente.** Antes de abrir o site ao público, siga [LANCAMENTO.md](LANCAMENTO.md) para aplicar as migrações, configurar e publicar as funções, aprovar as contas e validar o ambiente real. Consulte também [OPERACAO.md](OPERACAO.md), [REVISAO.md](REVISAO.md) e o guia detalhado [LEIA-ME.md](LEIA-ME.md).

Nunca adicione chaves administrativas, senhas, tokens privados ou dumps ao Git. Configure os segredos dos provedores no servidor. Nenhuma licença de redistribuição do código próprio foi definida; as licenças das bibliotecas estão em `public/vendor/`.
