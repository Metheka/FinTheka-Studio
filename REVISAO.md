# Revisão do FinTheka Studio

> A revisão consolidada de conclusão está em [AUDITORIA_FINAL.md](AUDITORIA_FINAL.md): 140 testes aprovados com capturas habilitadas, correções de dados antigos após falha de atualização e diagnóstico remoto ainda reprovado. A base técnica para a parte escrita está em [TCC.md](TCC.md). Os resultados das rodadas anteriores permanecem registrados abaixo.

## Credenciais e criptografia — 25/11/2026

O aplicativo delega senhas ao Supabase Auth. Segundo a [documentação oficial de senhas](https://supabase.com/docs/guides/auth/password-security), o serviço armazena hashes bcrypt com salt; não há tabela própria de senhas no schema da aplicação. Hash de senha não é criptografia reversível. O cliente envia a senha ao endpoint HTTPS de autenticação, e a limpa do formulário após a tentativa. Não foi acessada a tabela privada de autenticação do projeto remoto para inspecionar hashes.

O Supabase [declara criptografia AES-256 em repouso e TLS em trânsito](https://supabase.com/security). Essa é uma propriedade declarada do serviço hospedado, não uma medição ou certificação independente da infraestrutura deste projeto. Não foi implementada criptografia ponta a ponta dos registros financeiros: consultas autorizadas e operadores com acesso técnico continuam podendo ler os dados.

A chave de `public/config.js` é publishable, própria para exposição, conforme a [documentação de chaves](https://supabase.com/docs/guides/getting-started/api-keys). Chaves privilegiadas e de provedores permanecem referenciadas por variáveis de ambiente das Edge Functions; seus valores remotos não foram inspecionados. Criptografar uma chave pública ou distribuir uma chave de descriptografia junto com o JavaScript não acrescenta proteção de credenciais.

Tokens de sessão continuam no armazenamento local usado pelo SDK, conforme [a referência de autenticação](https://supabase.com/docs/reference/javascript/auth). O aplicativo não acrescenta criptografia a esse armazenamento. Tokens dão acesso à conta e precisam ser protegidos contra XSS e acesso ao dispositivo. Cookies HttpOnly exigiriam um backend de sessão e uma alteração de arquitetura; não foram implementados nesta etapa. CSP e escape de textos continuam ativos, mas não eliminam todo risco de XSS.

Reforços locais: inicialização de autenticação bloqueada em páginas HTTP fora de localhost/loopback; endpoint Supabase obrigatoriamente HTTPS; checagem do tipo de chave antes de criar o SDK. A checagem de tipo não verifica a assinatura de chaves legadas nem substitui a autenticação do servidor. O bloqueio em JavaScript complementa a configuração HTTPS/HSTS do Hosting; o próprio HTML/JS também precisa ser entregue de forma segura.

Adicionado `npm run check:credentials`, incluído em `check:release` e no `predeploy` do Firebase. Ele verifica a configuração e busca formatos reconhecidos de segredos e tokens privilegiados na pasta pública, sem imprimir seus valores. É uma prevenção contra vazamentos acidentais, não um detector universal de todos os segredos. Validado por testes de chave privada fictícia em arquivo público e erro sem exposição do valor. O hook foi conferido na configuração; não houve execução de deploy Firebase.

Validação desta etapa: checagem da pasta pública aprovada; 42 testes de segurança aprovados; 12 cenários de navegador de login, cadastro, recuperação, privacidade e CSP aprovados. A senha de teste também foi verificada como ausente de localStorage e sessionStorage após login. Nenhuma mudança foi publicada. Continuam pendentes a conexão administrativa, a configuração privada remota e os testes reais descritos no roteiro de lançamento.

## Proteção de abuso — 25/11/2026

Correções locais da auditoria em `artifacts/security/auditoria-2026-11-25.txt`: a quinta migração aplica cotas de volume e frequência no banco a transações, metas e movimentos; mantém contadores privados sem acesso dos clientes; e exige aprovação individual para consumir IA/cotações. Contadores usam atualização atômica por usuário/recurso. A migração bloqueia escritas durante a reconciliação inicial; se não conseguir obter os bloqueios em dez segundos, falha sem aplicar alterações parciais. Não houve teste de concorrência contra um PostgreSQL remoto com várias conexões.

Os handlers usam RPCs novas e falham com 503 quando a migração não existe, em vez de consumir provedores sob as regras antigas. Falta de aprovação retorna 403, sem chamada externa; ausência de sessão continua retornando 401. Novos cadastros, inclusive quem tiver papel de administrador no aplicativo, não recebem aprovação automática. Aprovação e revogação exigem operação administrativa, conforme [OPERACAO.md](OPERACAO.md).

A interface limita a carga a 10.000 transações e 100 metas e informa quando um histórico legado ultrapassa o teto. Não apresenta a carga parcial como total completo. Limites do banco recebem uma mensagem específica nos formulários/importação. Backups `.bak/.bak2` foram movidos para `artifacts/source-backups/`; patches históricos foram desativados. O `config.toml` registra mínimo de 12 caracteres, confirmação de e-mail, confirmação dupla de troca de e-mail e alteração segura de senha para o ambiente local. O Auth hospedado ainda precisa de verificação e configuração independente.

Validação: 34 testes gerais e 36 de segurança aprovados. A suite de navegador executou 63 cenários: 61 passaram, um cenário de capturas foi ignorado e o teste novo de limite de importação revelou um erro no padrão de interceptação de sua API simulada. Após corrigir esse padrão, os quatro cenários novos passaram em reexecução dirigida; os 62 cenários funcionais foram aprovados entre essas execuções. Deno aprovou os tipos das duas funções. A auditoria npm anterior desta mesma sessão reportou zero vulnerabilidades conhecidas e as dependências não foram alteradas.

**Servidor ainda pendente:** não foi aplicada nenhuma migração, configuração remota ou publicação. A integração Supabase foi localizada, mas não está conectada; a CLI não está disponível no ambiente. A falha de cotações sem sessão observada na auditoria não pode ser declarada corrigida em produção. Implantar somente o frontend não resolve essa falha. O roteiro vigente está no início de [LANCAMENTO.md](LANCAMENTO.md). Backups/restauração, política de suporte/retenção, MFA de operadores e testes autenticados reais permanecem validações operacionais; não há promessa de segurança absoluta.

## Temas unificados e gráficos na inicial — 24/11/2026

Após a orientação de preservar somente o gráfico do Simulador, a paleta café passou a valer também nessa aba. Modo claro com cartões brancos, fundo cinza e texto contrastante; modo escuro com as mesmas superfícies café nas demais abas. `Simulador.js`, `SimuladorCore.js` e `Simulador.css` não foram editados. A referência `artifacts/redesign/simulador-grafico-preservado.json` compara projeção, caminhos e textos do SVG nos dois temas, usando as mesmas larguras de gráfico da captura anterior para evitar diferenças causadas pelo ResizeObserver assíncrono. As dimensões responsivas são verificadas separadamente.

Adicionado atalho de conversa com IA abaixo do cabeçalho, à direita. A inicial ganhou barras diárias de receitas e despesas (incluindo pendentes), proporção de lançamentos confirmados/pendentes, comparação dos últimos seis meses, leitura do saldo inicial/final e valor da alta/queda no período escolhido. O saldo considera apenas pagamentos confirmados até hoje; datas futuras e pendências não entram na evolução. Sem movimentos, não são geradas barras fictícias.

A prévia USD/BRL usa o histórico autenticado de 90 dias, reaproveitando a consulta e o cache de 60 segundos do Mercado. Mostra o período efetivamente recebido e variação entre primeiro e último fechamento, com consulta por teclado e ponteiro. Falha e histórico insuficiente removem preços, datas e gráfico anterior. Troca de conta invalida respostas em andamento. Não há novas chamadas de IA, dependências, migrações ou publicações remotas.

Validação desta rodada: 34 testes de lógica/banco, 26 de segurança e 59 cenários de navegador, incluindo capturas com dados simulados. A rodada completa de navegador foi seguida pela repetição do cenário de falha/troca de conta após corrigir sua sincronização. Revisão visual em desktop e celular; teste de largura em 320/390/768/1440 pixels nos dois temas. O diagnóstico remoto, Deno e auditoria npm não foram repetidos nesta etapa. Pendências de Supabase continuam descritas em [LANCAMENTO.md](LANCAMENTO.md).

As seções abaixo registram rodadas anteriores; a orientação atual sobre as cores do Simulador substitui a preservação integral de estilos descrita na rodada anterior.

## Identidade café e gráficos descritivos — 24/11/2026

Paleta reformulada em café/cobre: superfícies claras no tema claro, café/grafite no noturno, bordas discretas, sombras reduzidas e títulos diretos. Os cartões de ferramentas perderam ilustrações decorativas e gradientes coloridos. Ícones de pagamento continuam coloridos. A implementação visual está em `public/Profissional.css`, aplicada somente fora da aba Simulador.

**Simulador preservado:** `Simulador.js`, `Simulador.css` e `SimuladorCore.js` mantêm os mesmos hashes SHA-256 anteriores à alteração. A regra de tema é desativada quando `body[data-view="investimentos"]` está ativo, preservando os tokens e estilos originais. O teste de navegador compara propriedades de todos os elementos da aba (incluindo dimensões, fontes, cores, bordas, sombras, stroke/fill) em 1440 e 390 pixels, nos dois temas, com referência das folhas originais e transições desabilitadas. A referência fica em `artifacts/redesign/simulador-estilos-preservados.json`. O gráfico do Simulador e seu motor não foram alterados.

Novo módulo `public/Analises.js`:

- Composição de despesas em pizza/rosca na visão geral (mês atual) e em Relatórios (todo o histórico). As cinco maiores categorias aparecem separadas; as restantes são agregadas sem perder centavos. Legenda com valores/percentuais, consulta por foco/ponteiro e estado vazio sem dados inventados.
- Receitas e despesas em barras mensais nos últimos seis meses, incluindo lançamentos pagos e pendentes e o mês atual parcial. Consulta por botões de mês, teclado e ponteiro. O resultado cadastrado é identificado separadamente do saldo confirmado.
- Oscilação diária do câmbio por diferença percentual entre fechamentos consecutivos, com maior/menor variação observada. Reaproveita o mesmo histórico já solicitado pelo gráfico de velas, sem nova chamada ao provedor. O gráfico de velas e o gráfico existente de saldo foram mantidos. Oscilação observada não é uma estimativa de volatilidade estatística, risco futuro ou retorno.

Nomes de categorias são escapados; percentuais/posições vêm de cálculos numéricos; gráficos e manipuladores são limpos ao trocar de conta e em falhas de carregamento. Não foram adicionadas dependências, chamadas de IA, migrações ou escritas remotas.

**114 testes aprovados:** 32 de lógica/banco/simulador/categorias/análises, 26 de segurança e 56 cenários no Chrome. Os cenários afetados, capturas, responsividade e preservação do Simulador foram repetidos após o acabamento. Cobertura nova: composição/agrupamento em centavos, virada de ano e janela mensal, altas/quedas/zero no câmbio, legendas por teclado, nomes maliciosos, limpeza entre contas, falha do histórico e ausência de chamada extra de cotações. Dez telas em 320/390/768/1440 pixels nos dois temas; sem teste em aparelho físico/Safari. Capturas com dados exclusivamente simulados: `04-tema-claro.png`, `15-desktop-escuro.png`, `20-relatorios-cafe.png` e `03-mercado.png`.

O diagnóstico consolidado remoto e o arquivo `artifacts/security/check-release.json` continuam sendo da rodada anterior de Porquinho/IA. Não foram repetidos npm audit, Deno ou chamadas remotas nesta etapa: dependências e funções não mudaram. As pendências de configuração/publicação descritas em [LANCAMENTO.md](LANCAMENTO.md) continuam válidas.

## Porquinho e conversa com IA — 24/11/2026

Criadas as abas Porquinho e Assistente IA no menu e na navegação inferior. O cartão de IA na página inicial abre a conversa e foca o campo de mensagem; a análise única continua em Transações. Módulos: `public/Porquinho.js`, `public/Assistente.js` e `public/NovosRecursos.css`.

O Porquinho oferece metas com nome, valor, cor e data opcional, edição, progresso, registros manuais de valores guardados/retirados, últimos dez movimentos e exclusão de meta sem saldo. Não transfere dinheiro, não rende nem altera transações. A migração `202611240002_piggy_bank.sql` cria `cofrinhos`, `movimentos_cofrinho` e a RPC `movimentar_cofrinho`. RLS separa as contas; permissões de coluna bloqueiam criação/alteração direta de saldo e o cliente não pode escrever no histórico. A RPC captura a identidade, trava a linha, valida tipo/valor/centavos e impede saldo negativo. Reenviar a mesma chave e parâmetros não reaplica o movimento; parâmetros diferentes com a mesma chave falham.

Testes com o SQL real no PostgreSQL local cobrem acesso cruzado/anônimo, alteração de saldo/dono, inserção direta de movimento, idempotência, valores não finitos/fracionários/excessivos, retirada acima do saldo, exclusão com saldo, reaplicação da migração e cascatas. A trava está implementada; não foi realizado teste de carga distribuído em produção.

O chat usa a função `insights` e a mesma reserva de cota: 3 tentativas/conta e 100/site em 24 horas, intervalo de 30 segundos e até 200 tokens por resposta. O servidor aceita até cinco mensagens alternadas user/assistant de até 400 caracteres cada, terminando em pergunta, dentro de 8.192 bytes e prazo de leitura de cinco segundos. Papéis system/tool são rejeitados antes de consultar dados ou consumir cota. O resumo automático contém apenas totais de até 200 transações da conta autenticada; não inclui dados dos porquinhos. No chat também seguem texto digitado e até duas trocas anteriores. A página de privacidade foi atualizada. O assistente não possui ferramentas para alterar dados ou movimentar dinheiro.

Conversa e rascunhos ficam somente na memória da página. Na troca de conta são limpos metas, valores, formulários, histórico e conversa. Respostas antigas são descartadas pela instância de estado e versão de sessão capturadas. Nomes e respostas de IA são exibidos como texto, sem interpretar HTML/Markdown. Abrir a aba não chama o provedor, e indisponibilidade/cota/publicação ausente não geram respostas falsas. Não há dados financeiros em localStorage.

**108 testes aprovados:** 29 de lógica/banco/simulador/categorias/novos recursos, 26 de segurança e 53 cenários no Chrome. As funções passaram no Deno 2.9.6; auditoria npm sem vulnerabilidades conhecidas reportadas. `CAPTURE_REDESIGN=1` + `npm run check:release` terminou com código 1 somente pelo Supabase remoto. O atalho inicial e as capturas foram repetidos após o acabamento. Viewports: dez telas nos dois temas em 320, 390, 768 e 1440 pixels, sem teste em aparelho físico ou Safari. Capturas com dados e resposta explicitamente simulados: `16-porquinho-desktop.png`, `17-porquinho-celular.png`, `18-assistente-desktop.png` e `19-assistente-celular.png`.

Remoto: autenticação 200 com confirmação exigida; tabelas anteriores e resumo administrativo bloquearam anônimos com 401; `uso_cotacoes`, `cofrinhos` e `movimentos_cofrinho` retornaram 404; `insights` retornou 404 e `cotacoes` 503 sem sessão. **Faltam as migrações e o deploy atualizado no Supabase.** Não houve escrita remota, publicação, envio de e-mail ou chamada real à Groq. O guia vigente contém quatro migrações e as validações reais pendentes. Aprovação local não comprova a configuração publicada.

## Ícones coloridos, temas neutros e layout de celular — 24/11/2026

O azul predominante foi substituído por preto/grafite no escuro e branco/cinza no claro, inclusive no menu lateral e no login. A marca acompanha o verde dos detalhes. Estados financeiros e ícones usam verde, coral, violeta e âmbar; o fundo principal permanece neutro. Preferência de tema e troca de aparência continuam disponíveis.

Adicionado `public/Pagamentos.js` com ilustrações SVG locais de Pix, crédito, débito, dinheiro, transferência, boleto, débito automático e um desenho genérico para classificações antigas ou desconhecidas. Os cartões são ilustrações, sem alegação de bandeira vinculada à conta. O formulário tem atalhos visuais sincronizados com o seletor original; a tabela também mostra o ícone correspondente. Nomes vindos do banco continuam escapados e o SVG vem apenas de um catálogo fixo, nunca do texto recebido. Categorias e navegação receberam ícones com fundos coloridos.

No computador, são preservados menu lateral e tabela completa. Até 650 pixels, as transações passam a cartões com descrição, contato, categoria, valor, ícone de pagamento, status e ações. A navegação inferior permite acessar início, movimentos, relatórios e simulador; o menu superior mantém acesso às demais telas. O formulário ocupa a largura do telefone como painel inferior, com rolagem e ações fixas. Há espaço reservado para a barra inferior e área segura do aparelho. Redimensionar a janela alterna os layouts sem duplicar registros ou controles de pagamento.

Validação: **96 testes únicos aprovados nesta revisão** — 26 de lógica/banco/simulador/categorias, 23 de segurança e 47 cenários de navegador, contando a suíte completa e as repetições dos cenários afetados após os ajustes. Verificações novas cobrem sincronização dos atalhos de pagamento e payload salvo, troca de tabela/cartões ao redimensionar, navegação inferior e item ativo, painel inferior, fundos neutros nos dois temas e ausência de overflow com textos longos e valores elevados em 320 pixels. Os oito painéis foram percorridos nos dois temas entre 320 e 1440 pixels. As capturas usam dados simulados e foram inspecionadas; os testes usam Chrome no Windows com viewports emulados, sem teste em aparelho físico ou Safari nesta etapa.

Capturas: `04-tema-claro.png`, `15-desktop-escuro.png`, `11-categorias-despesa.png` e `14-movimentos-celular.png` em `artifacts/redesign/`. Não houve alteração no banco, nas funções, nas dependências ou publicação. A auditoria de dependências, checagem Deno e diagnóstico remoto registrados abaixo são da rodada anterior; os bloqueios de lançamento continuam em [LANCAMENTO.md](LANCAMENTO.md).

## Categorias e formulário ampliado — 24/11/2026

O cadastro passou a oferecer seleção visual com ícones, busca e criação de categorias: 11 opções para receitas e 29 para despesas. As sugestões próprias vêm das transações da conta atual e de rascunhos da sessão. Nomes são deduplicados por acentos/caixa no seletor, sem alterar registros antigos. A categoria nova só é persistida ao salvar o lançamento; removida a última transação desse nome, ela deixa de aparecer nas sugestões. Não foi adicionada tabela ou migração: a implementação usa `transacoes.categoria` com o mesmo RLS existente.

Incluídas oito formas de pagamento, rótulos de contato/status conforme receita ou despesa e confirmação de pagamento no cadastro. A inserção continua usando proprietário capturado da sessão e o servidor continua responsável pelas permissões. O filtro por categoria combina com busca, período, tipo e status; filtra os totais da tabela e preserva o saldo geral.

Nomes próprios são renderizados como texto, com limite de 60 caracteres, e não são guardados no armazenamento local. Ao trocar de conta são limpos rascunhos, seleção, opções privadas e filtro. A navegação por teclado preserva o foco ao selecionar uma categoria. Não há biblioteca independente, edição de categorias em lote ou geração de parcelas/recorrências nesta etapa.

Visual ajustado com tema claro inicial, menu em azul-marinho em ambos os temas, saldo em azul profundo, cartões mais discretos e formulário com campos compactos e ações acessíveis durante a rolagem. Preferências já salvas continuam sendo respeitadas. Capturas atualizadas em `artifacts/redesign/`, incluindo `11-categorias-despesa.png`, `12-criar-categoria.png` e `13-categorias-celular.png`, com dados exclusivamente simulados.

Validação desta etapa: **93 testes aprovados** — 26 de lógica/banco/simulador/categorias, 23 de segurança e 44 cenários no Chrome. Os cenários afetados e a responsividade/capturas foram repetidos após os ajustes finais. Cobertura nova: categoria de alimentação e despesa já paga, forma de pagamento, persistência e reutilização após recarregar, filtro de totais, nomes maliciosos, deduplicação e isolamento entre contas. O SDK é real com respostas HTTP simuladas nos testes de navegador; não houve escrita remota, migração ou deploy. As dependências e funções Supabase não foram alteradas nesta etapa; os resultados de auditoria/Deno e o diagnóstico remoto da seção abaixo são da revisão anterior. O arquivo `artifacts/security/check-release.json` continua registrando aquela execução consolidada, com o bloqueio remoto. As pendências do Supabase e da operação permanecem no guia de lançamento.

## Proteções adicionais e acabamento — 24/11/2026

**Resultado: 86 testes aprovados localmente; lançamento ainda bloqueado pela configuração remota.** Foram executados `CAPTURE_REDESIGN=1` e `npm run check:release`: 24 testes de lógica/banco/simulador, 23 de segurança e 39 cenários no Chrome. As duas funções passaram no Deno e a auditoria npm retornou zero vulnerabilidades conhecidas. Resultado consolidado em `artifacts/security/check-release.json`. O comando terminou com código 1 pela checagem remota; isso não significa falha dos testes locais.

Correções e proteções adicionadas:

- Senhas são removidas do formulário ao mudar de modo, após a solicitação de autenticação, ao trocar de identidade e ao entrar no painel. E-mail e nome do formulário oculto também são limpos após a inicialização. Senhas novas exigem pelo menos 12 caracteres no cliente; o mesmo mínimo precisa ser configurado no Supabase. Login com senha existente continua disponível.
- A conclusão de uma recuperação de senha só libera o painel se a versão de sessão ainda for a mesma. Há regressão de navegador com resposta HTTP atrasada e notificação de mudança de sessão simulada no SDK; ela não comprova o comportamento de todos os provedores ou todas as condições entre abas reais.
- Ao sair da página, a área privada é ocultada. Uma restauração pelo cache de histórico do navegador força recarregamento antes de apresentar novamente o painel, evitando depender de eventos de logout que a página congelada possa ter perdido. O teste simula eventos `pagehide/pageshow` e remoção da sessão; não é uma certificação do cache de todos os navegadores.
- Cotações têm reserva compartilhada no PostgreSQL: 30 consultas por conta e 300 no site em janela móvel de um minuto, inclusive para respostas em cache. A função usa a identidade validada no servidor; o navegador não pode consultar/modificar o contador nem executar a reserva. Falha ou ausência da migração bloqueia a consulta com 503. A nova migração `202611240001_quotes_quota.sql` deve ser aplicada **antes** do deploy da função atual.
- Os testes executam a migração real no PostgreSQL local, conferindo limites individual/global, expiração, permissões e reaplicação sem perder os registros. As chamadas dos handlers são testadas com dependências simuladas, incluindo bloqueio de provedor em falha do controle de uso. A trava SQL serializa reservas entre instâncias; não foi realizado teste de carga distribuído.
- O leitor de JSON tem prazo total de cinco segundos além do limite de 1.024 bytes. Corpo incompleto expira com 408 e libera o leitor. UTF-8 inválido é rejeitado. As chamadas com chaves de provedores rejeitam redirecionamentos HTTP, e falhas de cotações deixam de registrar o erro completo do provedor.
- Fontes usam a pilha nativa do sistema; não há solicitação ao Google Fonts. CSP restringe também fontes à própria origem. Scripts inline/eval permanecem bloqueados; estilos inline continuam necessários aos gráficos e estilos dinâmicos.

Acabamento visual: marca vetorial nova com monograma F e barras de crescimento, ícone de aba correspondente, azuis mais consistentes, cartões com superfícies mais discretas, bordas e sombras refinadas, melhor hierarquia dos valores, filtros mais legíveis e alvos maiores para exclusão. Login, temas claro/escuro, desktop e celular foram inspecionados em capturas com dados exclusivamente simulados. Os testes percorrem as oito telas em larguras de 320 a 1440 pixels nos dois temas; isso não equivale a auditoria integral de acessibilidade.

Criada `public/privacidade.html`, acessível pelo login e rodapé, com Metheka como responsável informado. O contato exclusivo de suporte ainda não existe e não foi substituído por e-mail pessoal ou endereço fictício. A página identifica o pré-lançamento e os prazos de retenção ainda pendentes. [OPERACAO.md](OPERACAO.md) prepara os procedimentos de suporte, proteção das contas administrativas, backup/restauração, exportação e exclusão de dados. Esses procedimentos precisam ser executados e validados no ambiente real; não foi criado backup nem excluída conta remota.

Diagnóstico remoto repetido nesta revisão: autenticação HTTP 200 com confirmação exigida; `transacoes`, `perfis`, `uso_insights` e resumo administrativo HTTP 401 para anônimos; `uso_cotacoes` HTTP 404; `cotacoes` HTTP 503 sem sessão; `insights` HTTP 404. A nova tabela não está disponível e as funções corrigidas continuam pendentes no servidor. Nenhuma migração, publicação, criação de conta, envio de mensagem ou chamada real à Groq foi feita.

A primeira tentativa do diagnóstico encontrou bloqueio de rede do ambiente. A checagem de tipos foi confirmada diretamente com o Deno 2.9.6 já em cache. O comando consolidado foi então repetido com acesso à rede e concluiu todas as categorias; somente o Supabase remoto reprovou. O instalador do verificador agora prefere o cache e limita tentativas/tempo de consulta ao npm para evitar espera prolongada.

Antes de abrir ao público: aplicar as três migrações, configurar secrets/origens e autenticação, publicar as funções, repetir o diagnóstico, testar e-mails e duas contas reais, validar IA/cotações autenticadas, criar o e-mail exclusivo, completar a página de privacidade, ensaiar recuperação/exclusão e conferir o endereço de teste do Firebase. A revisão reduz riscos conhecidos e não garante ausência de vulnerabilidades ou proteção completa contra abuso/DDoS.

## Varredura final de código e segurança — 23/11/2026

**Resultado: correções locais aplicadas; 77 testes aprovados; publicação continua pendente por falhas no Supabase remoto.** A revisão cobriu autenticação, transições de sessão, CRUD, importação CSV, IA, cotações, simulador, totais, renderização de textos, permissões SQL, arquivos públicos, cabeçalhos e dependências. Não é uma garantia de ausência de falhas.

Foram reproduzidos dois problemas que não estavam cobertos pelos testes anteriores: o formulário com texto privado permanecia aberto ao trocar de conta; uma leitura de arquivo CSV iniciada na conta A podia continuar e gerar inserção depois da entrada na conta B. Os testes falharam antes das correções e passaram depois.

Correções aplicadas:

- Mudança de identidade oculta a área privada imediatamente, fecha diálogos, limpa campos de formulário, arquivo CSV, buscas, filtros, perfil, resposta de IA, caches e gráficos. O simulador também volta às hipóteses iniciais.
- Inserções de transação e de CSV recebem o proprietário capturado no início da operação. Assim, se o SDK trocar de token durante a requisição, o RLS pode rejeitar uma identidade incompatível em vez de atribuir os dados à conta seguinte.
- Após leitura de arquivo, salvamento, exclusão ou consulta, a resposta só altera a interface se continuar pertencendo à mesma versão de sessão. O CSV não é enviado quando a conta muda durante a leitura.
- O bloqueio de salvamento pertence à sessão correspondente. Uma resposta antiga não fecha o formulário novo nem libera um botão de IA ocupado por uma chamada da conta seguinte. Inicializações antigas de perfil também não removem o bloqueio de uma inicialização posterior.
- Valores próximos de zero não aparecem como `-R$ 0,00`; relatórios e contatos agregam os valores em centavos.
- Adicionado `npm run check:edge-types`, com Deno oficial 2.9.6 via cache do npm e lockfile congelado. A checagem não publica nem executa os handlers. Ela faz parte de `npm run check:release`.

| Verificação final | Resultado |
| --- | --- |
| Lógica/banco/simulador | 24 testes aprovados |
| Segurança de funções, banco e Hosting | 20 testes aprovados |
| Chrome, incluindo capturas e novos cenários de autenticação/sessão | 33 cenários aprovados |
| Deno: `insights` e `cotacoes` | Tipos aprovados |
| Auditoria npm | Zero vulnerabilidades conhecidas reportadas |
| Supabase: autenticação e leitura anônima de tabelas/RPC | Confirmação exigida; leitura anônima bloqueada com 401 |
| Supabase: POST `insights`, sem sessão | 404, função ausente |
| Supabase: POST `cotacoes`, sem sessão | 503, ausência do bloqueio 401 esperado |
| Diagnóstico de lançamento | Reprovado pela configuração remota |

Os testes adicionais de autenticação usam o SDK real com respostas simuladas: cadastro sem sessão até confirmação, solicitação de recuperação sem enumeração de contas e callback de recuperação com painel oculto até salvar a nova senha. Isso não comprova entrega real de e-mails ou isolamento entre contas no servidor remoto. Esses testes, as migrações/secrets e as funções corrigidas ainda precisam ser validados no ambiente real, conforme [LANCAMENTO.md](LANCAMENTO.md).

Não houve escrita no banco remoto, chamada à Groq ou publicação no Firebase/Supabase. As ferramentas de publicação não estão autenticadas/disponíveis nesta sessão; Deno foi usado temporariamente para validação. Resultado automatizado em `artifacts/security/check-release.json`. Para repetir com capturas: `$env:CAPTURE_REDESIGN='1'; npm run check:release`.

## Temas com mais cor — 23/11/2026

Os dois temas receberam uma paleta mais viva: saldo e projeção principal em azul/índigo, mercado em ciano, planejamento em violeta e receitas/despesas com tons próprios. O tema claro combina branco com fundos azuis/lilases suaves; o escuro usa azul-marinho com acentos mais saturados. Login, menu ativo, botões, relatórios e cards do simulador acompanham a paleta.

Validação: os três cenários de navegador selecionados passaram, cobrindo persistência da preferência de tema, oito telas nos dois temas entre 320 e 1440 pixels e capturas de revisão. A inspeção visual foi complementada pela leitura dos estilos renderizados no Chrome; oito pares principais de texto/fundo tiveram contraste calculado acima de 4,5:1. Isso é uma verificação de amostras, não uma certificação integral de acessibilidade. Capturas atualizadas em `artifacts/redesign/`. Não houve mudança nos cálculos, serviços ou publicação.

## Simulador de planejamento — 23/11/2026

A antiga calculadora foi substituída por uma ferramenta de planejamento integrada ao visual azul do Studio, com campos monetários brasileiros, atualização automática, controles de taxa mensal/anual equivalente, prazo em anos/meses e atalhos de 5, 10 e 20 anos.

- Capital inicial, aportes no início ou fim do mês e reajuste anual do aporte a partir do mês 13. Inflação e custo percentual anual sobre o saldo são hipóteses editáveis.
- Saldo nominal, capital investido, resultado após custos e poder de compra de hoje aparecem separadamente. Não há impostos ou regras de produtos financeiros específicos embutidos.
- Gráfico com taxa base, aportes e faixa de dois cenários, alternância nominal/real, consulta por mouse ou teclado e tamanho adaptado ao celular. A faixa usa variação em pontos percentuais da taxa anual e não representa intervalo de confiança.
- Meta nominal com primeiro mês de alcance e solução do aporte mensal inicial necessário, respeitando juros, custos e reajuste configurados. O botão para usar esse aporte apenas altera a hipótese do simulador.
- Tabela anual/mensal com páginas de 12 períodos e exportação CSV de todos os meses, incluindo capital inicial, três cenários e as hipóteses de taxa, inflação, custos, reajuste, momento do aporte e meta.
- Validação explícita de campos, prazos de 1 a 600 meses e projeções excessivas. Resultados inválidos não são exportáveis. Hipóteses do simulador são restauradas ao trocar de usuário; nenhum cálculo consulta IA/provedores ou altera dados financeiros da conta.
- Refinamento comum ao site: navegação volta ao topo, foco vai para o título da tela e o menu móvel contém o foco do teclado e o devolve ao fechar.

Fontes: capitalização e aporte no início do período conferidos com a [metodologia de depósitos regulares do Banco Central](https://www3.bcb.gov.br/CALCIDADAO/publico/exibirMetodologiaAplicacaoDepositosRegulares.do?method=exibirMetodologiaAplicacaoDepositosRegulares). A comparação por variação de taxa é também usada na [calculadora educacional Investor.gov](https://www.investor.gov/financial-tools-calculators/calculators/compound-interest-calculator). Custos, reajustes, inflação e metas seguem as convenções explícitas na seção “Como calculamos sua projeção” da interface, sem alegar equivalência a produtos específicos ou a todas as regras de outro simulador.

Validação desta etapa: 23 testes de lógica/banco, incluindo 10 testes do novo motor com fórmulas fechadas independentes; 20 testes de segurança; 26 cenários únicos de navegador aprovados ao longo da revisão. Os cenários afetados foram repetidos após os ajustes finais. Cobertura inclui taxa zero, perdas, equivalência de taxas, inflação, custos, reajustes, meta, exportação completa, entrada em formato brasileiro, gráfico por teclado, isolamento de sessão e responsividade das oito telas nos dois temas. Capturas em `artifacts/redesign/09-simulador.png` e `10-simulador-celular.png`.

Arquivos: `public/SimuladorCore.js` contém o motor puro, `public/Simulador.js` a interface, `public/Simulador.css` os estilos. `Automac.js` mantém a inicialização e a navegação. As funções, o banco e a configuração de publicação remota não foram alterados nesta etapa. O diagnóstico remoto e os bloqueios de lançamento da revisão de segurança abaixo continuam pendentes; não houve nova aprovação para publicação.

## Azul e revisão de segurança — 23/11/2026

**Resultado: 55 testes locais aprovados; lançamento ainda não aprovado pela verificação remota.** A conclusão é limitada ao código e às verificações descritas aqui. Não é garantia de ausência de vulnerabilidades nem substitui validação do ambiente publicado.

O verde de destaque foi substituído por azul cobalto, azul claro e fundos em ardósia. Logo, login, botões, navegação, cards e gráficos foram harmonizados. As cores financeiras positivas usam um tom discreto de turquesa. O cabeçalho permanece disponível ao rolar a página. As capturas atualizadas em `artifacts/redesign/` usam apenas dados simulados.

| Verificação executada | Resultado |
| --- | --- |
| `npm test` | 13 testes aprovados |
| `npm run test:security` | 20 testes aprovados, incluindo subtestes de permissões |
| `CAPTURE_REDESIGN=1` + `npm run test:browser` | 22 cenários aprovados, incluindo revisão por capturas |
| `npm audit --audit-level=low` | Nenhuma vulnerabilidade conhecida reportada nas dependências instaladas |
| Autenticação remota | HTTP 200, e-mail habilitado e confirmação exigida |
| Tabelas e RPC com credencial pública de papel `anon` | HTTP 401, acesso bloqueado |
| POST remoto em `insights`, sem sessão | HTTP 404: função ausente |
| POST remoto em `cotacoes`, sem sessão | HTTP 503: limite do provedor, sem o bloqueio 401 esperado |
| `npm run check:release` | Código de saída 1, por falha da configuração remota |

Correções e verificações adicionadas:

- As duas funções exigem token validado por `auth.getUser(token)` antes de consultar dados ou provedores. A origem do navegador deve constar exatamente em `ALLOWED_ORIGIN`; origem não permitida ou configuração ausente são bloqueadas com 403. Requisições sem Origin continuam exigindo autenticação; CORS não substitui autorização.
- JSON limitado a 1.024 bytes durante a leitura do fluxo, inclusive sem Content-Length ou com caracteres de múltiplos bytes. Corpo malformado, arrays e valores fora da lista de moedas/períodos são rejeitados antes de consumir cota ou acessar provedores.
- Testes executam os handlers reais das Edge Functions após remover os tipos TypeScript, usando SDK de autenticação, banco e provedores simulados. Cobrem tokens rejeitados/expirados, ausência de sessão, origens semelhantes maliciosas, quotas, falhas do banco, parâmetros de outra pessoa e destinos arbitrários. Isso não é execução nem checagem de tipos pelo Deno.
- PostgreSQL local executa o schema e migrações reais: bloqueia acesso cruzado entre duas identidades, escrita anônima, alteração de proprietário, autopromoção, alteração de e-mail/perfil privilegiado, acesso direto às funções internas e alteração da cota de IA. Operações legítimas continuam funcionando. Não comprova o estado das políticas do banco remoto.
- Chrome verifica textos maliciosos no painel, tabela, contatos e relatórios, bloqueio de scripts/manipuladores de evento pela CSP, área privada oculta sem login e limpeza na troca de conta. Também verifica fluxos e oito telas nos dois temas entre 320 e 1440 pixels.
- Cabeçalhos do Hosting reforçados: CSP sem scripts inline/eval, sem base ou frames, HSTS, isolamento de opener e recursos da mesma origem. Os testes HTTP verificam os valores realmente servidos localmente e bloqueio de backups, arquivos ocultos, SQL e travessia de diretórios. CSS inline continua permitido para estilos dinâmicos e a biblioteca de gráficos.
- Arquivos destinados ao Hosting foram verificados por padrões de chaves privadas/secretas e JWT de serviço. A chave configurada no navegador é de papel `anon`. Os bundles de Supabase e gráficos foram comparados byte a byte com os pacotes instalados usados na auditoria.
- O diagnóstico remoto passou a usar POST nas funções e a credencial pública anônima nas tabelas, evitando confundir o bloqueio do gateway sem credencial com a aplicação das permissões do banco.

Para repetir a revisão, use Node 24 e `npm run check:release`. O comando executa as cinco categorias acima, não publica nem altera dados remotos e registra o resultado em `artifacts/security/check-release.json`. O cenário de capturas é opcional; use `$env:CAPTURE_REDESIGN='1'` antes do comando para incluí-lo. Os testes de navegador usam uma porta temporária e não interrompem o servidor de desenvolvimento em 5000.

Antes do lançamento: publicar as versões corrigidas das funções no Supabase, conferir as migrações e os segredos, configurar origens exatas e repetir o diagnóstico; ambas as funções devem retornar 401 sem sessão. Depois validar login, recuperação e entrega de e-mails, isolamento de duas contas reais e IA/cotações autenticadas. Ainda faltam a URL final e a validação dos cabeçalhos no Firebase publicado. As ferramentas Supabase, Firebase e Deno não estão instaladas/disponíveis nesta sessão; nenhuma migração nem publicação remota foi feita. O cache de cotações é por instância; proteção de cadastro, cotas dos provedores e monitoramento de abuso precisam ser conferidos no ambiente real.

Referências usadas para revisar a configuração: [permissões e RLS do Supabase](https://supabase.com/docs/guides/api/securing-your-api), [testes e limites das políticas por linha](https://supabase.com/docs/guides/database/postgres/row-level-security), [cabeçalhos do Firebase Hosting](https://firebase.google.com/docs/hosting/full-config).

## Redesign local — 23/11/2026

Interface reformulada em grafite e verde, com nova marca vetorial, ícones locais, tipografia e temas claro/escuro. A tela de acesso, navegação, formulários, mercado e ferramentas seguem a mesma identidade. O redesign está local; não houve publicação no Firebase, alteração de banco remoto ou chamada real à Groq.

- Visão geral própria com saldo de todo o histórico, totais e pendências do mês, categorias de despesas e cinco movimentos recentes. Gráfico de saldo confirmado em 7, 30 ou 90 dias, com consulta por mouse e teclado. Estados vazios não exibem dados inventados.
- Transações em páginas de 20 registros. Filtros e totais continuam considerando todos os registros encontrados, inclusive mais de mil linhas. O saldo geral continua considerando todos os pagamentos confirmados.
- Novo formulário, ajuda em diálogo, mensagens de confirmação e download de modelo CSV. A preferência de tema é aplicada antes da primeira renderização; o gráfico de mercado acompanha tema e tamanho da tela, com preços em português.
- Correções: resultados negativos recebem a cor adequada; gráficos não são cortados no celular; dados e insight da sessão anterior são limpos ao trocar de usuário; respostas antigas de pagamento e administração são descartadas.
- Estilos ativos: `public/Studio.css`. A lógica da visão geral está em `public/Studio.js`; autenticação e operações existentes permanecem em `Auth.js`, `Automac.js` e `Extras.js`. As folhas de estilo anteriores foram preservadas e não são carregadas pela página atual.

Validação: `npm test` aprovou 13 testes. `npm run test:browser`, com `CAPTURE_REDESIGN=1`, aprovou 19 cenários no Chrome, incluindo capturas. Cobertura adicional: resumo mensal, saldo anterior ao período, centavos, pendências e datas futuras, painel vazio, nova tentativa após falha, troca de usuário, paginação, teclado e oito telas nos dois temas em larguras de 320, 390, 768 e 1440 pixels.

Capturas em `artifacts/redesign/` usam somente dados simulados de testes. Não são dados de uma conta real. Para refazê-las no PowerShell: `$env:CAPTURE_REDESIGN='1'; npm run test:browser`. Sem essa variável, o cenário de captura é ignorado e os 18 cenários funcionais de navegador continuam disponíveis.

O diagnóstico remoto somente de leitura foi repetido em 23/11/2026: autenticação HTTP 200 com confirmação de e-mail exigida; tabelas e resumo administrativo HTTP 401 sem sessão; `insights` HTTP 404; `cotacoes` HTTP 503 sem sessão. A publicação das funções corrigidas no Supabase continua pendente e é independente do Firebase Hosting. Consulte [LANCAMENTO.md](LANCAMENTO.md).

## Revisão anterior — 12/11/2026

As correções desta revisão estão nos arquivos locais. O site não foi publicado no Firebase e a migração SQL e as funções corrigidas ainda precisam ser aplicadas ao Supabase remoto.

**Atualização da IA:** a integração Anthropic foi substituída por Groq Free. O guia vigente é [LANCAMENTO.md](LANCAMENTO.md). Aplique também `202611120002_free_ai.sql`, depois da primeira migração.

## Problemas corrigidos

- Receitas e despesas calculadas separadamente; valores negativos representam despesas. Resultado e tabela respeitam período, busca, tipo e pagamento. Saldo atual considera todos os pagamentos confirmados.
- Paginação no banco: totais deixam de ser truncados no limite de resposta do PostgREST.
- Formulário acessível para novas transações, com data local, validação de valores e indicação de falhas. Proteção contra cliques simultâneos ao salvar, pagar, excluir e importar.
- CSV com aspas, delimitadores e quebras de linha; datas reais, até 500 registros e 1 MB. Validação completa antes de enviar e uma única inserção atômica, sem importação parcial por erro de validação. Arquivo limpo após sucesso. Em erro de rede, conferir o histórico antes de reenviar: o servidor pode ter concluído a operação mesmo que a resposta se perca.
- Buscas e filtros funcionais; controles decorativos sem implementação removidos. Menu utilizável no celular, navegação por teclado e tema persistente.
- Calculadora com limite de 600 meses, validação e tratamento de saldo zero.
- Tratamento de falhas de login, perfil e recuperação de senha; proteção contra respostas de uma sessão anterior e carregamentos concorrentes.
- Agrupamentos resistentes a nomes como `__proto__`, renderização de textos escapada e mensagens de serviços indisponíveis.
- Bibliotecas JavaScript servidas localmente, com versões fixadas e licenças. CSP restringe scripts ao próprio site e conexões ao projeto Supabase configurado. Hosting ignora `.bak` e `.bak2`, SQL e mapas de código; arquivos são revalidados para evitar versões antigas após deploy.
- Ambas as Edge Functions passam a exigir sessão validada no servidor. Cotações têm timeout, cache, união de consultas simultâneas e pausa após limite do provedor. O cache é por instância; limites do provedor ainda dependem da chave/plano e do volume real.
- IA Groq reserva uso antes da chamada, com bloqueio transacional global no PostgreSQL: 3 tentativas por usuário e 100 no site em 24 horas, intervalo de 30 segundos por usuário e até 200 tokens de saída. Falha na reserva bloqueia a chamada. Tentativas que falham no provedor também consomem uma reserva. Somente totais e contagens são enviados, sem descrições ou identificação. A conta deve permanecer no plano Free para evitar cobrança do provedor.
- Migração preserva dados existentes, cria perfis ausentes, sincroniza alterações de e-mail e restringe execução das funções internas.

## Evidências

- `npm test`: 10 testes aprovados, incluindo PostgreSQL em memória (PGlite) executando o schema e as duas migrações reais, além de respostas simuladas da Groq.
- Testes SQL verificam leitura, inserção, atualização e exclusão entre dois usuários; tentativa de promoção para administrador; bloqueio de anônimos; resumo administrativo; criação de perfis; sincronização de e-mail; limite de IA e reaplicação da migração sem perda de dados. O PostgreSQL local não comprova que o servidor remoto esteja com essas mesmas políticas.
- `npm run test:browser`: 9 cenários aprovados no Chrome, com o SDK Supabase e a biblioteca de gráficos reais e respostas HTTP simuladas. Cobrem login, CRUD, clique repetido, busca, filtros, despesas, 1.002 registros, CSV, falha de serviço, calculadora, tema, celular, erro de perfil e sucesso/limite da IA.
- Deno verificou os tipos das duas Edge Functions na revisão anterior. Essa checagem ainda deve ser repetida após a troca para Groq. Não houve chamada real ao provedor de IA nesta alteração.
- `npm audit`: nenhuma vulnerabilidade conhecida nas dependências instaladas no momento da revisão. Isso não é garantia de ausência de falhas.

## Supabase remoto: diagnóstico somente de leitura

Projeto configurado: `htueuvvndtlusfyaqlqa`.

| Verificação | Resultado observado |
| --- | --- |
| Configuração de autenticação | HTTP 200; login por e-mail habilitado; confirmação de e-mail exigida |
| Transações, perfis e uso de IA sem sessão | HTTP 401; acesso anônimo bloqueado |
| Resumo de usuários sem sessão | HTTP 401; acesso anônimo bloqueado |
| Função `cotacoes` implantada antes desta revisão | HTTP 503; limite do provedor atingido. Respondeu sem sessão, corrigido no código local |
| Função `insights` | HTTP 404; função não publicada |
| Acesso administrativo por CLI | Consulta à API de gerenciamento falhou com erro de transporte; não foi possível aplicar alterações remotamente |

Ainda não foram validados no servidor real: login com conta existente, entrega de e-mails, recuperação de senha completa, CRUD autenticado, isolamento entre duas contas, migração, chamada de IA e cotações após o deploy. São verificações necessárias antes de liberar o site.

## Para aplicar no servidor

1. No SQL Editor do projeto existente, executar `supabase/migrations/202611120001_hardening.sql` e depois `supabase/migrations/202611120002_free_ai.sql`. **Não executar novamente `schema.sql` em um banco já criado.** Em banco novo, executar `schema.sql` primeiro e as migrações depois.
2. Configurar os segredos das Edge Functions: `GROQ_API_KEY` de uma conta Free, `AWESOMEAPI_KEY` se exigida pelo plano do provedor, e `ALLOWED_ORIGIN` com o endereço final do site. Segredos nunca vão para `public/config.js`. Consulte `LANCAMENTO.md` para detalhes.
3. Com Supabase CLI autenticado, na pasta `fintheka`: `supabase functions deploy cotacoes --project-ref htueuvvndtlusfyaqlqa` e `supabase functions deploy insights --project-ref htueuvvndtlusfyaqlqa`. O `config.toml` desativa a verificação legada do gateway; a validação obrigatória da sessão ocorre em `auth.getUser()` dentro de ambas as funções.
4. Em Authentication → URL Configuration, cadastrar o domínio final do Firebase em Site URL/Redirect URLs e o endereço local utilizado nos testes. Preservar confirmação de e-mail e verificar a entrega de mensagens.
5. Validar com duas contas de teste reais que uma não acessa nem altera transações da outra, inclusive por chamadas diretas à API; cliente não pode alterar `papel` nem executar `reservar_insight`. Testar cadastro, recuperação de senha e administrador.
6. Só então publicar pelo Firebase Hosting selecionando o projeto correto. O Hosting deve publicar exclusivamente `public/`. O Firebase não implanta as funções nem executa a migração do Supabase.

## Desenvolvimento

Na pasta `fintheka`, usar Node 20+:

```powershell
npm ci
npm run vendor
npm test
npm run test:browser
npm start
```

O navegador de testes configurado é o Chrome instalado no Windows. Para usar outro navegador, ajustar `playwright.config.cjs`. `npm start` abre um servidor em `http://127.0.0.1:5000` com os mesmos cabeçalhos principais de segurança do Hosting. Usar `npm run check:remote` para repetir o diagnóstico remoto somente de leitura. Em redes com inspeção HTTPS, a opção `--use-system-ca` do Node permite usar certificados confiáveis do Windows sem desabilitar TLS.

Não reaplicar `aplicar-patch.js` ou `aplicar-patch-2.js`: são utilitários históricos anteriores a esta revisão.

Referências: [autenticação de Edge Functions](https://supabase.com/docs/guides/functions/auth), [chaves públicas do Supabase](https://supabase.com/docs/guides/getting-started/api-keys), [cabeçalhos do Firebase Hosting](https://firebase.google.com/docs/hosting/full-config).
