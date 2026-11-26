# FinTheka Studio: passo a passo (Supabase + Firebase Hosting)

> **Repositório independente:** a raiz agora contém diretamente `public/`, `supabase/`, `scripts/` e `tests/`. Não existe mais a pasta intermediária `Finanças Proget/fintheka/`. Execute os comandos nesta raiz; a entrada atual do repositório é [README.md](README.md). Referências antigas à pasta `fintheka` abaixo indicam esta mesma raiz. Os patches históricos foram arquivados fora do Git em `artifacts/source-backups/`.

> **Segurança — 25/11/2026:** as correções locais acrescentam a quinta migração `202611250001_abuse_protection.sql`, limites de gravação e aprovação administrativa para IA/cotações. O deploy ainda depende de conexão administrativa. As instruções vigentes estão no início de [LANCAMENTO.md](LANCAMENTO.md) e [OPERACAO.md](OPERACAO.md); referências a quatro migrações abaixo são históricas. Backups antigos agora ficam em `artifacts/source-backups/`; patches históricos estão desativados.

## Aparência e gráficos

O site usa paleta café/cobre nos temas claro e noturno, com composição de despesas em pizza/rosca, fluxo de receitas/despesas por mês e oscilação diária de câmbio. Os gráficos usam apenas os registros da conta e o histórico de cotações já consultado. Relatórios informa explicitamente quando considera todo o histórico, últimos seis meses e pagamentos pendentes.

A aba Simulador acompanha a paleta do restante do site nos dois temas. O gráfico e os cálculos foram preservados; seus arquivos não foram alterados. `public/Profissional.css` padroniza todas as abas, com cartões brancos sobre fundo cinza no claro. `public/Analises.js` e `public/PainelGraficos.js` apresentam os gráficos adicionais.

A visão geral mostra receitas e despesas por dia do mês, comparação dos últimos seis meses, evolução do saldo confirmado e prévia do dólar. A prévia consulta o mesmo histórico autenticado de 90 dias usado pelo Mercado, compartilhando o cache de 60 segundos. Se a função de cotações não estiver disponível, mostra a falha sem inventar dados. O atalho de IA fica no canto superior direito, abaixo de Adicionar, e abre a conversa sem consumir uma chamada de IA.

## Porquinho e Assistente IA

As duas abas estão no menu lateral e nos atalhos inferiores do celular. O cartão de IA na página inicial também abre a conversa. A antiga análise única continua em Transações → Gerar insight.

O Porquinho oferece metas com nome, cor e data opcional, progresso, edição, registros manuais de valores guardados/retirados e últimos dez movimentos. Os registros ficam no Supabase e não transferem dinheiro nem alteram transações. **Aplique a quarta migração** `supabase/migrations/202611240002_piggy_bank.sql` para ativá-lo. Não há armazenamento financeiro alternativo em localStorage. Metas com saldo registrado só podem ser excluídas após retirar o saldo; excluir remove também seu histórico.

O Assistente IA aceita perguntas e mantém o contexto recente apenas enquanto a página está aberta. Para respostas reais, publique a função `insights` atualizada e configure `GROQ_API_KEY` e `ALLOWED_ORIGIN`. Chat e insight compartilham 3 tentativas por conta em 24 horas, intervalo de 30 segundos e cota global de 100. Não há chamada automática ao abrir a aba, nem resposta local fingindo ser IA quando o serviço não estiver disponível. A conversa enviada inclui texto digitado; veja a página de privacidade.

## Categorias e lançamentos

O formulário oferece 11 opções de categoria para receitas e 29 para despesas, busca, criação de nomes próprios, oito formas de pagamento e confirmação de recebimento/pagamento no cadastro. Categorias próprias são persistidas na coluna `categoria` da transação e reaproveitadas do histórico da conta, incluindo registros importados. Não é necessária migração adicional para essas melhorias.

Uma categoria criada no formulário é um rascunho até salvar a transação. Ela deixa de aparecer nas sugestões quando a última transação com esse nome for excluída. Não há biblioteca independente de categorias, renomeação em lote, parcelamento automático ou lançamentos recorrentes nesta versão. Dados antigos não são reclassificados. O filtro por categoria afeta a tabela e seus totais; o saldo geral continua considerando todos os pagamentos confirmados.

O tema claro é o padrão para novas visitas; preferências já salvas são respeitadas. Os fundos são branco/cinza no claro e preto/grafite no escuro, incluindo o menu lateral. Ícones de navegação, categorias e meios de pagamento são coloridos. Alterne a aparência pelo botão de tema no topo.

Em telas de até 650 pixels, o histórico aparece como cartões, com navegação inferior e formulário em painel inferior. No computador, o histórico mantém a tabela e o menu lateral. Os layouts mudam automaticamente conforme a largura disponível. Isso não altera as transações nem a forma de salvar dados. As ilustrações de cartões não identificam uma bandeira vinculada à conta.

> **Atualização em 24/11/2026:** o roteiro vigente é [LANCAMENTO.md](LANCAMENTO.md), com quatro migrações obrigatórias. A revisão de segurança e as evidências estão em [REVISAO.md](REVISAO.md). Suporte exclusivo, backup/restauração e exclusão de contas estão em [OPERACAO.md](OPERACAO.md). A página `public/privacidade.html` ainda precisa do contato de suporte e dos prazos de retenção antes da abertura ao público.

O simulador de planejamento usa `public/SimuladorCore.js` (cálculos), `public/Simulador.js` (interface) e `public/Simulador.css` (estilos). Ele funciona no navegador, sem enviar as hipóteses ou gravar transações. O detalhamento dos cálculos está na própria aba e em [REVISAO.md](REVISAO.md).

> **Redesign em 23/11/2026:** a interface atual está pronta para revisão local. Na pasta `fintheka`, execute `npm start` e abra `http://127.0.0.1:5000`. Use o login Supabase da sua conta. Para desenvolvimento, edite `public/index.html`, `public/Studio.css` e `public/Studio.js`; as operações existentes continuam em `Auth.js`, `Automac.js` e `Extras.js`. Testes e capturas estão descritos em [REVISAO.md](REVISAO.md). Publicar no Firebase não publica as funções no Supabase.

> **Atualização em 12/11/2026:** siga [LANCAMENTO.md](LANCAMENTO.md) para configurar a IA Groq Free e publicar. Consulte [REVISAO.md](REVISAO.md) para evidências. As instruções de patches abaixo são históricas e não devem ser repetidas. Em banco existente, aplique somente as migrações pendentes, na ordem indicada no guia de lançamento.

## 1. Supabase (login + banco)
1. Crie um projeto em supabase.com.
2. **Somente em banco novo:** execute `supabase/schema.sql` e depois as quatro migrações do guia de lançamento. Em banco existente, execute apenas as migrações pendentes, na ordem do guia.
3. **Authentication → Providers → Email**: deixe "Confirm email" LIGADO e senha mínima = 12. Confira SMTP, limites de autenticação e proteção contra abuso conforme o guia de operação.
4. **Authentication → URL Configuration**: em Site URL e Redirect URLs coloque o endereço do seu site (ex.: `https://SEU-APP.web.app`) e, para testes, `http://localhost:5000`.
5. **Project Settings → API**: copie a **URL** e a **anon key** para `public/config.js`. Nunca use a `service_role` no site.

## 2. Seus arquivos
O projeto atual já está preparado em `public/`, incluindo bibliotecas locais, marca e ícones. Não execute `aplicar-patch.js` nem `aplicar-patch-2.js`: são utilitários históricos e podem sobrescrever correções. O Hosting deve publicar a pasta `public/` completa.

## 3. Edge Functions (IA Groq Free e cotações; segredos ficam no servidor)
```
supabase login
supabase link --project-ref SEU_REF
supabase functions deploy insights
supabase functions deploy cotacoes
```
Use a CLI Supabase instalada conforme a documentação do serviço. Configure os segredos no painel, antes de publicar: `GROQ_API_KEY`, `ALLOWED_ORIGIN` e a chave de cotações se exigida pelo provedor. Evite colocar segredos em comandos que ficam no histórico do terminal. Mantenha a conta Groq no Free, sem ativar faturamento pago. Nunca exponha a chave no chat ou no código público. A versão atual não usa Anthropic. Veja as quatro migrações obrigatórias, limites de uso e configuração completa em [LANCAMENTO.md](LANCAMENTO.md).

## 4. Seu usuário administrador
Cadastre-se pelo site, confirme o e-mail e, no SQL Editor, rode:
`update public.perfis set papel = 'admin' where email = 'seu@email.com';`
Não existe nenhum caminho pelo site para virar admin.

## 5. Teste antes de publicar
Na pasta `fintheka`, execute `npm run check:release`. Para visualizar com os cabeçalhos configurados, use `npm start` e abra `http://127.0.0.1:5000`. Também é possível usar o emulador do Firebase Hosting, com a CLI instalada e configurada.
- Crie 2 contas de cliente: uma não pode ver as transações da outra.
- Só a sua conta admin enxerga a aba "Administração".

## 6. Publicar
`firebase login` → `firebase use --add` (escolha seu projeto) → `firebase deploy --only hosting`
O Firebase publica só a pasta `public/`. Não suba `server.js`, `.env` nem `db.json`.

## Dados antigos (db.json)
Entre no site e use a aba Importações (CSV) para trazer as transações para a sua conta.
