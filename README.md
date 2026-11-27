# FinTheka Studio

Aplicação de gestão financeira com receitas, despesas, relatórios, metas de economia, simulador e assistente. O frontend usa HTML, CSS e JavaScript. `npm start` serve o site no computador e mantém autenticação, banco e funções no Supabase online. O Firebase Hosting continua configurado para publicação futura.

**Apresentação na escola:** siga [APRESENTACAO_LOCAL.md](APRESENTACAO_LOCAL.md). O banco local de testes está desligado por padrão; só é ativado com `npm run start:local`.

**Termos e conta:** aceite obrigatório no cadastro e exclusão em “Minha conta”. A ativação da função e do registro de aceites no Supabase está descrita em [CONTA_E_TERMOS.md](CONTA_E_TERMOS.md).

**Códigos para copiar no painel:** [supabase/ativacao/LEIA-ME.md](supabase/ativacao/LEIA-ME.md) reúne o SQL do Porquinho/controles, a liberação individual de cotações/IA e os arquivos completos das funções para o editor do Supabase.

A função de IA publicada neste projeto chama-se `quick-service`, configurada em `public/config.js`. Esse nome é apenas interno; a interface continua mostrando Assistente IA e Gerar insight.

Este repositório contém somente o FinTheka. Os arquivos do projeto ficam diretamente nesta raiz. Para trabalhar no VS Code, abra esta pasta ou `FinTheka.code-workspace`.

**Revisão de conclusão de 25/11/2026:** 140 testes automatizados aprovados com capturas habilitadas, tipos das funções aprovados e nenhuma vulnerabilidade conhecida reportada pelo npm. O diagnóstico remoto continua reprovado. Veja [AUDITORIA_FINAL.md](AUDITORIA_FINAL.md) para correções, evidências e pendências, e [TCC.md](TCC.md) para a base da parte escrita.

## Executar localmente

Use Node.js 24 e npm. Na raiz do repositório:

```sh
npm ci
npm start
```

Abra `http://127.0.0.1:5000` e entre com sua conta do Supabase. Precisa de internet. Os registros existentes permanecem no banco online e aparecem ao entrar com a mesma conta, inclusive em outro computador. Uma conta nova começa com seus próprios registros; não recebe os dados de outras contas. O Supabase atualmente exige confirmação de e-mail para novos cadastros.

O GitHub leva o código; o site usa o projeto Supabase definido em `public/config.js`. Não é necessário copiar ou recriar o banco para trocar de computador. A chave publishable desse arquivo é pública; as permissões e o RLS protegem o banco. `npm run start:remote` continua como alias do comportamento padrão. O modo isolado de testes usa `npm run start:local`, mantém contas separadas e não sincroniza com o Supabase.

## Estrutura

| Pasta | Conteúdo |
| --- | --- |
| `public/` | Site e bibliotecas distribuídas com suas licenças |
| `supabase/` | Schema, seis migrações e funções de IA, cotações e exclusão da conta |
| `scripts/` | Servidor local e verificações |
| `tests/` | Testes de lógica, banco, segurança e navegador |

Dependências, caches, resultados de testes, capturas e backups locais são ignorados pelo Git. Os scripts históricos de patch foram arquivados localmente em `artifacts/source-backups/` e não fazem parte do repositório.

## Verificar

```sh
npm run check:credentials
npm run check:local
npm test
npm run test:security
npm run test:browser
```

Os testes de navegador usam o Chrome instalado. `npm run check:local` reúne as verificações necessárias ao modo local. `npm run check:edge-types` verifica as funções com Deno e pode precisar de rede. `npm run check:release` acrescenta verificações remotas; uma falha remota não é corrigida apenas publicando os arquivos no GitHub.

## GitHub e publicação do site

O Git deste projeto é independente do repositório da pasta superior. A branch inicial é `main`. Para enviar a um repositório vazio criado na sua conta do GitHub, use o endereço HTTPS informado pelo próprio GitHub:

```sh
git remote add origin https://github.com/SEU-USUARIO/fintheka.git
git push -u origin main
```

Substitua `SEU-USUARIO` e o nome pelo destino correto. O envio ao GitHub não publica o site no Firebase, não executa migrações e não configura os serviços externos.

**A implantação das correções de segurança ainda está pendente.** Antes de abrir o site ao público, siga [LANCAMENTO.md](LANCAMENTO.md) para aplicar as migrações, configurar e publicar as funções, aprovar as contas e validar o ambiente real. Consulte também [OPERACAO.md](OPERACAO.md), [REVISAO.md](REVISAO.md) e o guia detalhado [LEIA-ME.md](LEIA-ME.md).

Nunca adicione chaves administrativas, senhas, tokens privados ou dumps ao Git. Configure os segredos dos provedores no servidor. Nenhuma licença de redistribuição do código próprio foi definida; as licenças das bibliotecas estão em `public/vendor/`.
