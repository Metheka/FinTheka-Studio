# Auditoria de conclusão do FinTheka Studio

## Ajustes para apresentação — 27/11/2026

O tema claro passou a usar fundo areia e superfícies creme, incluindo menu e cartão principal do simulador; o modo escuro foi preservado. Os diálogos de transações, Porquinho e conta receberam X de fechamento, desabilitado junto ao formulário durante gravações. A ajuda mantém seu fechamento existente.

Cada transação agora tem “Editar”, com os campos originais preenchidos. Valor, descrição, categoria, data, contato, forma de pagamento, tipo e confirmação de pagamento são atualizados no mesmo registro, filtrando por ID e usuário. Formas de pagamento antigas são preservadas no formulário. Cancelar não grava; falha mantém o formulário aberto; trocar de conta limpa o identificador de edição. Nenhuma migração ou alteração remota foi necessária.

Resultado final de `npm run check:local`: 155 testes aprovados (38 de lógica/banco/inicialização, 46 de segurança e 71 de navegador), com uma captura opcional pulada. Os cenários novos conferem edição sem duplicação, atualização dos totais, troca de categoria, cancelamento, persistência, campos legados e erro ao gravar. O fluxo com banco descartável também edita uma categoria. Foram inspecionados os tons claros em captura do navegador. Não foram editados registros reais do usuário.

## Nome da função publicada — 27/11/2026

O autor informou a URL da função `quick-service` no projeto correto. A configuração `INSIGHTS_FUNCTION` passou a apontar para esse nome; Assistente IA e Gerar insight usam a configuração, preservando nomes e textos da interface. O ambiente isolado de testes mantém o nome interno `insights`. O diagnóstico remoto e o arquivo completo de publicação foram alinhados. O `config.toml` permite publicar `quick-service` reutilizando a fonte original.

Passaram 33 cenários direcionados de navegador e três testes de inicialização/pacote. A consulta remota encontrou `quick-service` com HTTP 401 sem sessão e o marcador esperado, confirmando a rota e a exigência de autenticação. O preflight do navegador para `http://127.0.0.1:5000` retornou HTTP 403, sem origem permitida; ainda é necessário incluir essa origem no segredo `ALLOWED_ORIGIN`. Não foi feita chamada autenticada ao modelo nem alterado segredo remoto nesta etapa.

## Arquivos de ativação da IA — 27/11/2026

Preparados `supabase/ativacao/05-insights.ts`, completo para o editor de Edge Functions, e `06-liberar-ia.sql`, que aprova somente a conta indicada e preserva sua permissão de cotações. A função de exclusão continua disponível como `04-excluir-conta.ts`. A configuração online ainda exige publicação, origens permitidas e, para IA, a chave da Groq.

O modelo anterior `llama-3.1-8b-instant` foi substituído por `openai/gpt-oss-20b` após conferir a [retirada para Free/Developer na documentação da Groq](https://console.groq.com/docs/deprecations). O limite de conclusão passou a 1.024 tokens para comportar o processamento do modelo, com esforço baixo e exclusão desse conteúdo na resposta. Mantidos limite visível de 1.500 caracteres, cotas, verificação de identidade e ausência de repetição automática.

Passaram 23 testes direcionados de ativação, resumo/conversa e segurança das funções. A checagem Deno aprovou as fontes e as três cópias completas para o painel, incluindo a IA. Não foram utilizadas chaves reais da Groq, executadas exclusões reais nem realizadas publicações no projeto do usuário nesta atualização.

## Termos e exclusão de conta — 27/11/2026

Implementados `public/termos.html`, aceite explícito e desmarcado no cadastro, links de privacidade e a tela “Minha conta”. A função `excluir-conta` valida a sessão no servidor, confirma a senha e exclui somente a identidade autenticada usando credencial administrativa restrita ao servidor. A sexta migração registra versão e horário do aceite, sem reescrever contas anteriores. O ambiente opcional de testes também implementa o fluxo completo.

`npm run check:local` passou com 150 testes (36 de lógica/banco/inicialização, 46 de segurança e 68 de navegador), com uma captura opcional pulada. Em seguida, o teste adicional de inicialização do formulário passou isoladamente; ele confere que os campos ficam desabilitados até os scripts estarem prontos. O fluxo local completo, incluindo exclusão em banco descartável, também passou em três repetições. A checagem Deno aprovou as três funções. O cadastro foi inspecionado visualmente no celular.

A implementação não publicou funções, não aplicou migrações no Supabase online e não excluiu contas reais. A ativação do recurso online depende das etapas em [CONTA_E_TERMOS.md](CONTA_E_TERMOS.md). Supabase continua como padrão de `npm start`; o banco local permanece opcional.

## Atualização de 27/11/2026 — apresentação local

**Configuração vigente após confirmação do autor:** `npm start` usa o Supabase online original. O banco PGlite descrito nesta seção foi mantido apenas como ambiente opcional de testes, desligado por padrão e ativado por `npm run start:local`. Nenhum dado é copiado entre os bancos. Firebase e estrutura do Supabase permanecem preservados. A consulta remota de 27/11 confirmou Auth HTTP 200 com confirmação de e-mail, mas encontrou Porquinho/tabelas auxiliares HTTP 404, `insights` HTTP 404 e `cotacoes` HTTP 503. Os testes automatizados locais abaixo não comprovam o funcionamento dessas funções no serviço real.

Após essa alteração, `npm run check:local` passou com **143 testes aprovados** (36 de lógica/banco/inicialização, 42 de segurança e 65 de navegador), além de uma captura opcional pulada. O teste de inicialização executa o servidor real e verifica que a configuração original Supabase é servida e nenhum banco local é aberto por padrão. O login agora orienta corretamente uma conta com confirmação de e-mail pendente. O servidor foi reiniciado em `http://127.0.0.1:5000` com Supabase online ativo. A integração administrativa Supabase foi localizada, mas ainda não está instalada/conectada; não foram feitas alterações no serviço remoto.

O ambiente opcional de `npm run start:local` executa uma API Node.js e PostgreSQL embarcado com PGlite. Nesse banco separado, o schema e as cinco migrações originais são aplicados automaticamente, preservando RLS, permissões, limites e operações atômicas dos porquinhos. Contas e registros de testes são persistidos em `.local-data/postgres`, fora do Git. A primeira conta local recebe o papel de administrador; as seguintes são clientes. As senhas usam scrypt com sal individual; as sessões são verificadas no servidor por hashes de tokens emitidos localmente. Nada disso modifica o banco Supabase usado por `npm start`.

Foram acrescentados comandos de backup, restauração com preservação do banco anterior e recuperação de senha pelo terminal. A trava do banco impede duas instâncias simultâneas sobre os mesmos arquivos. O servidor só escuta no loopback e recusa hosts e origens externos na API local.

O modo local não chama provedores: cotações e históricos de mercado são exemplos simulados, e o assistente usa regras e cálculos locais. A faixa da aplicação e os textos de privacidade explicam essas diferenças. A configuração remota em `public/config.js`, Firebase Hosting, schema, migrações e Edge Functions foram preservados. `npm run start:remote` mantém a execução com Supabase. Nenhum serviço remoto foi implantado nesta atualização.

Uma falha intermitente encontrada no teste completo foi corrigida: ao sair, o formulário de login podia aparecer antes do recarregamento e aceitar uma senha que seria apagada na navegação seguinte. Os campos agora permanecem desabilitados até o novo documento carregar. O fluxo local completo passou em três repetições após a correção.

Resultado final de `npm run check:local`: **141 testes aprovados**, sendo 35 de lógica/banco/API local, 42 de segurança e 64 de navegador. Uma captura visual opcional foi pulada. O cenário novo de navegador bloqueia requisições externas e usa o SDK real contra a API e o banco locais; cobre cadastro, login, transação, pagamento, importação CSV, insight, metas, mercado, assistente e novo login. O teste da API também cobre isolamento entre contas, reinício do banco e os comandos reais de backup/restauração. Foram inspecionadas capturas nos tamanhos de computador e celular.

Evidência consolidada: `artifacts/security/check-local.json` (ignorada pelo Git). O guia de instalação, transporte e demonstração está em [APRESENTACAO_LOCAL.md](APRESENTACAO_LOCAL.md). A infraestrutura remota não foi revalidada nesta rodada; os resultados de 25/11 abaixo permanecem como histórico do modo remoto.

## Revisão anterior — 25/11/2026

Revisão de 25/11/2026, no horário de São Paulo. **A versão local passou nas verificações automatizadas; o lançamento público permanece bloqueado pela configuração remota.** A base para escrever os capítulos técnicos do TCC está em [TCC.md](TCC.md).

## Escopo da revisão

Foram revisados estrutura do repositório, documentação de instalação e operação, interface e seus módulos, configuração de publicação, esquema e migrações do banco, funções de IA/cotações e verificações automatizadas. A análise combinou leitura do código, busca de pendências, validação de sintaxe, testes e consultas remotas de leitura. Não foi realizada implantação ou alteração de dados remotos.

O frontend é estático e não exige build. `npm start` serve os arquivos de `public/`. O projeto usa a marca **FinTheka Studio**, confirmada pelo autor para o TCC.

## Correções concluídas

| Pendência | Correção e verificação |
| --- | --- |
| Falha ao atualizar transações deixava registros antigos no cache | A falha agora invalida o cache, a lista filtrada e os totais. Filtros e navegação preservam o aviso de indisponibilidade até a recuperação. O teste reproduziu o problema antes da correção e passou depois. |
| Falha ao atualizar metas preservava cartões e saldos antigos | A falha agora limpa a lista e o total dos porquinhos. O cenário de navegador verifica a indisponibilidade e a recuperação após nova consulta. |
| Instruções de instalação ainda mencionavam quatro migrações | A sequência operacional em `LANCAMENTO.md` e as instruções de `LEIA-ME.md` agora incluem as cinco migrações e a aprovação explícita das contas. |
| Faltava uma base técnica para a parte escrita | `TCC.md` reúne problema, objetivos, requisitos rastreáveis, arquitetura, dados, cálculos, método de validação, limitações e demonstração. |

## Resultados da versão corrigida

| Verificação | Resultado |
| --- | --- |
| Lógica, cálculos, simulador e banco local | 34 testes aprovados |
| Segurança, permissões, cotas e Hosting | 42 testes aprovados, incluindo subtestes |
| Chrome com Playwright e capturas habilitadas | 64 cenários aprovados, sem cenários pulados |
| Total de testes automatizados | **140 aprovados** |
| Tipos das duas Edge Functions no Deno | Aprovado |
| Credenciais na pasta pública | Configuração válida; nenhum segredo nos formatos reconhecidos pelo scanner |
| Auditoria npm | Nenhuma vulnerabilidade conhecida reportada nesta execução |
| Sintaxe dos arquivos JavaScript próprios, scripts e testes | 34 arquivos aprovados |
| Diagnóstico remoto | Reprovado; detalhes abaixo |

O total soma os contadores reportados pelo Node e os cenários do Playwright. Sem `CAPTURE_REDESIGN=1`, o cenário de capturas é pulado e ficam 63 cenários de navegador executados. As quantidades históricas de outras revisões não representam esta versão.

Os testes de PostgreSQL usam PGlite localmente. Os testes do navegador usam o SDK real com respostas de API controladas. As capturas também usam dados simulados. Essa validação não substitui testes com duas contas reais, e-mail real e provedores configurados.

## Diagnóstico remoto

Projeto consultado: `htueuvvndtlusfyaqlqa`. As requisições não criaram contas, não escreveram registros e não usaram credenciais administrativas.

| Componente | Resposta observada | Consequência |
| --- | --- | --- |
| Configuração pública do Auth | HTTP 200, e-mail habilitado e confirmação automática desabilitada | Configuração básica observada; envio e recuperação reais ainda precisam de ensaio |
| `transacoes`, `perfis`, `uso_insights` e RPC administrativa, sem sessão | HTTP 401 | Leitura anônima bloqueada nesses endpoints |
| `uso_cotacoes`, `cofrinhos`, `movimentos_cofrinho`, `acessos_servicos` | HTTP 404 | Recursos indisponíveis pela API consultada; conferir migrações e esquema remoto |
| Função `insights` | HTTP 404 | Função não encontrada no endereço consultado |
| Função `cotacoes`, sem sessão | HTTP 503 | Não apresentou o comportamento esperado da versão local, que exige sessão e responde 401 |
| Marcador de versão das funções | Ausente ou diferente do esperado | Publicação da versão de segurança local não foi comprovada |

HTTP 401 anônimo não comprova isolamento entre duas contas autenticadas. HTTP 404 de uma tabela não permite concluir sozinho quais migrações foram executadas; é necessário conferir o projeto com acesso administrativo.

## Pendências para liberar ao público

1. **Banco e funções:** com acesso administrativo ao projeto correto, conferir backup e migrações aplicadas, executar as pendentes na ordem, configurar os segredos, publicar `insights` e `cotacoes` e aprovar as contas de teste. O roteiro completo está em [LANCAMENTO.md](LANCAMENTO.md).
2. **Hospedagem e autenticação:** identificar o projeto Firebase e domínio final, conferir HTTPS, cabeçalhos, origens permitidas, redirecionamentos e configurações hospedadas de senha/e-mail. Publicar o Hosting após validar o backend.
3. **Contato e privacidade:** criar/testar uma caixa exclusiva de suporte e definir os prazos reais de atendimento e retenção. Atualizar `public/privacidade.html` com esses dados. Eles ainda não foram fornecidos e não foram inventados.
4. **Operação:** executar backup/restauração e exclusão completa de uma conta descartável; registrar o resultado conforme [OPERACAO.md](OPERACAO.md).
5. **Validação real:** testar cadastro, confirmação, recuperação, isolamento entre duas contas, metas, IA e cotações com serviços reais. Repetir `npm run check:release` e resolver os resultados remotos antes de abrir o cadastro ao público.

Essas etapas dependem de acesso e decisões do responsável pelos serviços. A revisão local não confirma a existência de sessão administrativa, segredos configurados ou projeto Firebase selecionado.

## Pendências para a entrega acadêmica

O TCC pode usar a descrição técnica e as evidências locais, com as limitações remotas registradas. O texto final ainda exige identificação do autor, instituição, curso, orientador, fundamentação teórica com referências verificadas, seleção de figuras e adequação ao modelo da instituição. Não há pesquisa com participantes ou resultados de usabilidade para declarar nesta rodada.

O guia [TCC.md](TCC.md) contém um roteiro de demonstração. Antes da apresentação, ensaiar as partes dependentes do backend real e identificar claramente qualquer uso de dados simulados.

## Evidências e reprodução

Na raiz do projeto, com Node.js 24, dependências instaladas, Chrome disponível e rede para as checagens externas:

```powershell
$env:CAPTURE_REDESIGN = '1'
npm run check:release
```

O comando verifica credenciais, lógica/banco, segurança, tipos, navegador, dependências e endpoints remotos. Nesta rodada, terminou com código 1 porque a configuração remota foi reprovada; as demais verificações passaram.

| Evidência local | Conteúdo |
| --- | --- |
| `artifacts/security/check-release.json` | Resultado consolidado e horário da execução em UTC |
| `artifacts/security/revisao-final.log` | Saída completa desta execução, incluindo diagnóstico remoto |
| `artifacts/redesign/` | Capturas do site com dados exclusivamente simulados |

`artifacts/` é ignorada pelo Git. Para anexar as evidências ao TCC ou entregar o projeto em outro computador, copiar esses arquivos separadamente e conservar a indicação de dados simulados. As evidências foram geradas antes das alterações finais de documentação, sem alterações posteriores no código da aplicação.
