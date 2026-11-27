# Base técnica do TCC do FinTheka Studio

> **Atualização para a apresentação de 27/11/2026:** `npm start` executa o frontend no computador e usa o Supabase online para autenticação, banco e funções. O Firebase está preservado, sem necessidade de publicar o frontend para a apresentação. Existe um banco PGlite separado, desligado por padrão, ativado somente com `npm run start:local` para testes; nele, cotações são simuladas e o assistente usa regras locais. Veja [APRESENTACAO_LOCAL.md](APRESENTACAO_LOCAL.md).

O FinTheka Studio é uma aplicação web para organizar receitas, despesas e metas de economia, consultar relatórios e explorar projeções financeiras. O sistema reúne uma interface responsiva, persistência por conta no Supabase e integrações de IA e cotações executadas no servidor. A implementação pode ser apresentada como um protótipo funcional com validação automatizada local; sua liberação pública ainda depende das etapas de implantação descritas em [LANCAMENTO.md](LANCAMENTO.md).

Esta base cobre os capítulos técnicos e o roteiro de demonstração. A versão acadêmica final depende da identificação do autor, instituição, curso, orientador e das regras de apresentação exigidas pela instituição. A fundamentação teórica e suas referências devem ser selecionadas e discutidas pelo autor com o orientador.

## Problema e objetivo

O problema de projeto é reunir registros financeiros dispersos em uma interface que permita distinguir valores cadastrados, pagamentos confirmados e metas de economia. A pergunta que orienta a implementação é: como construir uma aplicação web que organize esses registros por usuário e permita consultar sua evolução com consistência dos cálculos e controle de acesso?

O objetivo geral é desenvolver uma aplicação web de gestão financeira pessoal com cadastro de movimentações, relatórios, metas e simulações. Os objetivos específicos são permitir autenticação e recuperação de acesso; registrar e importar transações; apresentar resumos e gráficos; registrar movimentos de metas com proteção contra duplicação; simular cenários financeiros; integrar um assistente de IA com limites de uso; e verificar o isolamento dos dados e os principais fluxos por testes automatizados.

## Escopo implementado

| Requisito | Comportamento | Implementação principal | Evidência automatizada |
| --- | --- | --- | --- |
| RF01 Autenticação | Login, cadastro com confirmação, recuperação e saída | `public/Auth.js` | `tests/browser/app.spec.cjs`, `tests/security/credentials.test.cjs` |
| RF02 Transações | Criar receita/despesa, confirmar pagamento e excluir | `public/Automac.js`, `public/Pagamentos.js` | `tests/browser/app.spec.cjs`, `tests/core.test.cjs` |
| RF03 Consulta | Busca, filtros e paginação com totais do conjunto filtrado | `public/Automac.js`, `public/Categorias.js` | `tests/browser/app.spec.cjs`, `tests/categorias.test.cjs` |
| RF04 Relatórios | Agrupamentos, composição de despesas e fluxo mensal | `public/Studio.js`, `public/Analises.js`, `public/PainelGraficos.js` | `tests/studio.test.cjs`, `tests/analises.test.cjs` |
| RF05 Importação | CSV de até 500 registros, validado antes da inserção em lote | `public/Automac.js` | `tests/core.test.cjs`, `tests/browser/app.spec.cjs` |
| RF06 Simulação | Juros, aportes, inflação, custos, cenários, meta e exportação | `public/SimuladorCore.js`, `public/Simulador.js` | `tests/simulador.test.cjs`, `tests/browser/app.spec.cjs` |
| RF07 Metas | Criar/editar porquinho, guardar/retirar e consultar movimentos | `public/Porquinho.js`, quarta migração | `tests/security/porquinho.test.cjs`, `tests/browser/app.spec.cjs` |
| RF08 IA | Insight e conversa com contexto recente e cotas compartilhadas | `public/Assistente.js`, função `insights` | `tests/insights.test.cjs`, `tests/security/edge.test.cjs` |
| RF09 Cotações | Moedas, histórico, velas e médias móveis | `public/Extras.js`, função `cotacoes` | `tests/security/edge.test.cjs`, `tests/browser/app.spec.cjs` |
| RF10 Administração | Resumo por usuário disponível ao papel administrador | `public/Auth.js`, RPC `resumo_usuarios` | `tests/database.test.cjs`, `tests/security/database.test.cjs` |

As integrações RF07 a RF09 dependem de migrações, publicação das funções e configuração do serviço remoto. Os testes do navegador substituem as respostas da API por dados controlados; não comprovam a disponibilidade dessas integrações em produção.

## Arquitetura

A camada de apresentação usa HTML, CSS e JavaScript sem framework de interface. `public/index.html` reúne as telas, e os arquivos JavaScript separam autenticação, transações, gráficos, categorias, pagamentos, simulador, metas e conversa. O servidor `scripts/serve.cjs` serve o site localmente. `firebase.json` define a publicação de `public/` e os cabeçalhos de segurança do Hosting; não há etapa de compilação do frontend.

O Supabase oferece autenticação e acesso ao PostgreSQL. O navegador usa uma chave pública e o token da sessão. Políticas de segurança por linha, chamadas RLS, e permissões de tabela e coluna restringem as operações à identidade autenticada. Ocultar a área administrativa na interface complementa a apresentação, enquanto a autorização efetiva ocorre no banco.

As funções `insights` e `cotacoes` executam em Deno. Elas validam a sessão, a origem quando informada e o corpo da requisição antes de acessar provedores externos. A reserva de cota e a aprovação da conta são verificadas no PostgreSQL. Chaves administrativas e de provedores pertencem ao ambiente de servidor.

Fluxos principais:

1. Navegador → Supabase Auth → sessão autenticada.
2. Navegador com sessão → API de dados → permissões e RLS → registros da conta.
3. Navegador com sessão → Edge Function → autenticação e reserva de cota → Groq ou AwesomeAPI.
4. Navegador → motor local de simulação → tabela, gráfico e CSV da projeção.

## Modelo de dados

| Entidade | Finalidade e relações |
| --- | --- |
| `auth.users` | Identidade fornecida pelo serviço de autenticação |
| `perfis` | Nome, e-mail e papel; uma linha por identidade |
| `transacoes` | Data, descrição, contato, categoria, valor, forma e confirmação de pagamento; várias por identidade |
| `cofrinhos` | Nome, meta, saldo, prazo e cor; vários por identidade |
| `movimentos_cofrinho` | Tipo, valor e identificador de requisição; vários por porquinho e identidade |
| `uso_insights` | Reservas de chamadas de IA por identidade e horário |
| `uso_cotacoes` | Reservas de consultas de cotação por identidade e horário |
| `acessos_servicos` | Aprovação explícita para IA/cotações e expiração opcional |
| `privado.limites_escrita` | Contadores de volume e frequência por identidade e recurso |

O esquema inicial está em `supabase/schema.sql`, seguido por cinco migrações ordenadas pelo nome. Banco existente recebe somente as migrações pendentes; recriar o esquema não é o procedimento de atualização.

O saldo do porquinho e seu histórico são alterados juntos pela função transacional `movimentar_cofrinho`. O bloqueio da linha serializa movimentos concorrentes. A combinação de usuário e UUID da requisição impede duplicar um movimento confirmado quando o mesmo pedido é reenviado. A exclusão de porquinho exige saldo zero e remove seu histórico. A exclusão da identidade possui relações em cascata, verificadas em banco local nos testes.

## Regras de cálculo e consistência

Receitas têm valores positivos e despesas têm valores negativos. As agregações de transações usam centavos inteiros para evitar erros de soma como os produzidos pela representação binária de frações decimais. O banco armazena valores em colunas `numeric` com duas casas decimais.

O saldo geral considera transações confirmadas de todo o histórico carregado. Os indicadores mensais incluem lançamentos do mês, com separação de pagamentos confirmados e pendentes. O gráfico de evolução considera confirmações até a data de referência; lançamentos futuros confirmados podem integrar o saldo geral, mas não o ponto atual desse gráfico. Essa diferença deve ser explicada na demonstração.

A carga do histórico é paginada na API para não truncar os totais no limite padrão de resposta. Se exceder o teto de 10.000 registros ou ocorrer falha de atualização, os dados ficam indisponíveis para consulta até uma nova carga bem-sucedida. Os filtros não recuperam valores antigos do cache após essa falha. As metas também deixam de exibir saldos antigos quando sua atualização falha.

O CSV admite vírgula ou ponto e vírgula como separador, campos entre aspas e quebras de linha. A importação valida os registros antes de fazer uma única inserção em lote. Valores importados entram como pendentes. O arquivo deve ter até 1 MB e 500 transações. Reenviar um arquivo importado com sucesso pode criar registros repetidos; a importação não deduplica arquivos.

O simulador converte taxa efetiva anual em mensal pela relação `i_m = (1 + i_a)^(1/12) - 1`, com taxas em forma decimal. Permite aporte no início ou no fim do mês, reajuste anual dos aportes, custo percentual e correção do saldo pela inflação. O motor mantém precisão durante a projeção e formata valores na apresentação. Cenários alteram a taxa informada e não representam probabilidades ou rentabilidade garantida.

## Segurança e dados enviados à IA

A proteção implementada combina HTTPS fora do desenvolvimento local, autenticação, permissões mínimas, RLS, escape de conteúdo exibido, política de segurança de conteúdo e limites de uso. Os testes incluem tentativas de acesso entre contas, alteração de propriedade, promoção indevida para administrador, injeção de HTML e gravações que ultrapassam cotas. Esses controles e testes não constituem certificação de segurança ou conformidade jurídica.

O insight usa totais e contagens de até 200 transações recentes. As descrições, contatos, datas e identificadores dessas transações não são enviados no resumo. Na conversa, também seguem o texto digitado e até duas trocas anteriores, limitadas a 400 caracteres por mensagem enviada. O histórico do chat permanece em memória no navegador. Informações pessoais digitadas pelo usuário podem integrar o texto enviado ao provedor.

Chat e insight compartilham três tentativas por conta em 24 horas, intervalo mínimo de 30 segundos e 100 tentativas globais em 24 horas. A aprovação do operador não elimina esses limites. Falhas do provedor após a reserva também consomem tentativa. A política de privacidade em `public/privacidade.html` ainda exige contato de suporte real e definição operacional dos prazos de retenção antes do lançamento.

## Estratégia de validação

A validação combina testes de funções JavaScript, execução do esquema e das migrações em PostgreSQL embarcado via PGlite, testes dos handlers com provedores substituídos por respostas controladas e fluxos automatizados no Chrome com Playwright. A checagem Deno verifica os tipos das duas Edge Functions. A auditoria npm consulta vulnerabilidades conhecidas das dependências.

Os testes de navegador cobrem operações financeiras, autenticação pelo SDK com respostas controladas, recuperação, troca de sessão, erros, layouts em diferentes larguras, temas e navegação por teclado. São testes de integração local; o comportamento real de e-mail, provedores, configuração de produção e disponibilidade requer validação complementar com contas de teste.

O resultado da revisão está em [AUDITORIA_FINAL.md](AUDITORIA_FINAL.md). O comando `npm run check:release` gera `artifacts/security/check-release.json`; o registro desta rodada fica em `artifacts/security/revisao-final.log`. As capturas em `artifacts/redesign/` usam exclusivamente dados simulados. A pasta `artifacts/` é ignorada pelo Git e deve ser copiada separadamente quando usada como anexo acadêmico.

## Limitações e trabalhos futuros

O protótipo não realiza transferências bancárias, integração Open Finance, conciliação automática ou investimentos reais. Categorias próprias são reaproveitadas das transações e não formam um cadastro independente. A correção de transações na interface usa exclusão e novo cadastro; não há edição completa, parcelamento automático ou recorrência automática. Contatos são agrupamentos derivados dos lançamentos.

O assistente não altera registros e pode produzir interpretações incorretas. Sua amostra de até 200 transações não representa necessariamente um mês ou a conta inteira. Não houve avaliação da qualidade das respostas com participantes nesta revisão. Também não foram realizados ensaios de carga, pesquisa de usabilidade ou medições de impacto na organização financeira dos usuários.

Trabalhos futuros possíveis incluem edição de lançamentos, biblioteca independente de categorias, recorrência, avaliação de usabilidade, métricas de desempenho e integração de CAPTCHA se a operação exigir. A priorização deve considerar o objetivo do trabalho e os resultados de avaliação, sem apresentar essas possibilidades como funcionalidades concluídas.

## Roteiro de demonstração

1. Apresentar objetivo, arquitetura e limites do protótipo.
2. Entrar com conta de teste e mostrar uma receita e uma despesa, distinguindo previsto e confirmado.
3. Filtrar por categoria/status e demonstrar a relação entre tabela, totais e gráficos.
4. Importar um CSV válido e mostrar a recusa integral de um arquivo inválido.
5. Simular aportes com duas taxas equivalentes e exportar a projeção.
6. Com o banco remoto preparado, criar uma meta, guardar, retirar e consultar seu histórico.
7. Com as funções implantadas e a conta aprovada, demonstrar cotações e uma pergunta à IA. Se o serviço real estiver indisponível, apresentar as evidências locais identificadas como simuladas.
8. Mostrar os resultados dos testes e as pendências remotas registradas na auditoria.

## Conclusão técnica

A implementação reúne registros financeiros, visualizações, metas e simulações em uma interface web com persistência por conta e autorização no servidor. Os testes automatizados permitem verificar cálculos, permissões, operações transacionais e recuperação de falhas no ambiente local. A disponibilização pública permanece condicionada à implantação das migrações e funções, às configurações operacionais e à validação com contas reais.

## Complementos para a entrega acadêmica

O autor deve acrescentar os elementos de identificação, resumo e palavras-chave, introdução contextualizada, fundamentação com fontes verificadas, metodologia compatível com o trabalho realizado e referências no formato institucional. Deve também revisar o texto com o orientador, selecionar figuras com legendas e indicar quais evidências usam dados simulados. Resultados com participantes, ganhos de produtividade e avaliação de usabilidade só podem ser incluídos se esses estudos forem efetivamente realizados.
