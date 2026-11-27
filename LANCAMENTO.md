# Preparação para lançamento — atualização de 25/11/2026

> **Conta e termos — 27/11/2026:** a sexta migração `202611270001_terms_acceptance.sql` registra os aceites dos novos cadastros. A nova função `excluir-conta` permite exclusão com senha e confirmação. Ative ambas conforme [CONTA_E_TERMOS.md](CONTA_E_TERMOS.md); elas não são publicadas pelo push no GitHub. Contas existentes são preservadas.

> **Escopo atual — 27/11/2026:** o frontend será apresentado localmente, conectado ao Supabase online, sem publicar no Firebase. O procedimento está em [APRESENTACAO_LOCAL.md](APRESENTACAO_LOCAL.md). As etapas de banco e funções abaixo continuam relevantes para o backend usado na apresentação; publicar o Firebase fica para depois. O banco local de testes permanece opcional e desligado por padrão.

**Última verificação consolidada:** [AUDITORIA_FINAL.md](AUDITORIA_FINAL.md). A versão corrigida passou em 34 testes de lógica/banco, 42 de segurança e 64 cenários de navegador com capturas. Tipos e auditoria npm passaram. O diagnóstico remoto continua reprovado: `insights` 404, `cotacoes` 503 sem sessão e quatro tabelas indisponíveis pela API. Os números nas seções de histórico abaixo correspondem às respectivas rodadas anteriores.

## Correções de segurança de 25/11 — implantação ainda pendente

Também execute `npm run check:credentials`: o Firebase CLI agora tem uma checagem `predeploy` para configuração pública e formatos reconhecidos de segredos na pasta `public/`. O login exige uma página HTTPS fora do desenvolvimento local. Isso não configura o domínio, o certificado ou o Auth remoto; confirme HTTPS real e os cabeçalhos no domínio final antes de liberar. Consulte a seção de credenciais em [REVISAO.md](REVISAO.md) para os limites de armazenamento de sessão e criptografia.

Esta seção prevalece sobre os números e instruções históricos abaixo. Há **cinco migrações**, incluindo `supabase/migrations/202611250001_abuse_protection.sql`, que deve ser aplicada por último. Não foi realizada implantação nesta etapa: falta uma conexão administrativa ao Supabase e a identificação/acesso ao Firebase Hosting.

1. Verifique backup recuperável e as migrações já aplicadas no projeto `htueuvvndtlusfyaqlqa`. Aplique as quatro migrações anteriores que estiverem pendentes e depois a quinta, sem reexecutar `schema.sql` em banco existente. A quinta preserva registros existentes e cria limites e aprovação dos serviços.
2. Libere explicitamente as contas verificadas que poderão usar IA/cotações, conforme [OPERACAO.md](OPERACAO.md). A migração não libera automaticamente nenhum cadastro, nem contas administradoras. Cadastro sozinho não deve conferir acesso às cotas dos provedores.
3. Confira os segredos `ALLOWED_ORIGIN`, `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY` e a chave de cotações quando exigida. Publique **as duas funções** atualizadas. Elas agora chamam `reservar_insight_seguro` / `reservar_cotacao_segura`; se a quinta migração faltar, o acesso ao provedor será bloqueado com 503. Conta sem aprovação recebe 403; ausência de sessão válida recebe 401.
4. Confira no Auth hospedado: confirmação de e-mail, mínimo de 12 caracteres, confirmação dupla de troca de e-mail e alteração de senha com autenticação recente. O `config.toml` registra essas opções para desenvolvimento local; publicar funções não atualiza automaticamente o Auth hospedado. Referência: [configuração oficial](https://supabase.com/docs/guides/local-development/cli/config). Teste recuperação completa com uma conta descartável antes de alterar políticas de produção.
5. Publique o frontend atualizado no Hosting correto após validar o backend. Os backups foram preservados em `artifacts/source-backups/`, fora da pasta pública; os dois patches históricos foram desativados para impedir sobrescrita de correções.
6. Execute `npm run check:release` e valide duas contas reais, uma sem aprovação e outra aprovada. O diagnóstico remoto exige também o marcador `X-FinTheka-Security-Version: 2026-11-25.1` das funções; ele é um indicador de versão, não uma credencial nem prova da configuração privada do banco.

Limites por conta: 10.000 transações, 100 metas e 50.000 movimentos. Inserções e atualizações estão sujeitas também a limites de frequência; consulte [OPERACAO.md](OPERACAO.md). Contas legadas acima dos tetos não perdem registros, mas precisam de organização assistida para usar a interface limitada. A quinta migração não apaga nem trunca históricos. Quotas não substituem controles de cadastro/IP da infraestrutura, MFA dos operadores ou backups testados.

## Histórico anterior

As alterações estão locais. A integração Groq ainda não foi publicada nem testada com chave real. Não houve chamada paga de IA nesta revisão.

**Revisão visual mais recente:** temas unificados em todas as abas, cartões brancos no modo claro, atalho superior de IA e gráficos de receitas/despesas, saldo e dólar na inicial. O Simulador acompanha as cores do site; seu gráfico e cálculos foram preservados. Validação local: 34 testes de lógica/banco/análises, 26 de segurança e 59 cenários de navegador. Esta etapa não alterou funções, dependências ou migrações; o diagnóstico remoto abaixo e o artefato consolidado continuam sendo da rodada de Porquinho/IA. Consulte [REVISAO.md](REVISAO.md).

**Situação atual:** a rodada de Porquinho e conversa com IA aprovou **108 testes** (29 de lógica/banco/simulador/categorias, 26 de segurança e 53 cenários no Chrome, com capturas). As duas funções passaram no Deno e a auditoria npm não reportou vulnerabilidades conhecidas. O diagnóstico consolidado **não aprovou o lançamento**: `insights` retorna 404, `cotacoes` retorna 503 sem sessão e `uso_cotacoes`, `cofrinhos` e `movimentos_cofrinho` retornam 404. As tabelas existentes e o resumo administrativo bloquearam leitura anônima com 401. As mudanças estão locais; publicar somente o Hosting não ativa o banco nem a IA. Veja [REVISAO.md](REVISAO.md) e [OPERACAO.md](OPERACAO.md).

Use Node 24 e execute `npm run check:release` para repetir os testes, checagem de tipos, auditoria de dependências e diagnóstico remoto. `npm run check:edge-types` usa temporariamente o Deno oficial 2.9.6 via npm, sem instalação global ou publicação, e exige acesso à rede na primeira execução. O resultado consolidado é salvo em `artifacts/security/check-release.json`; falhas produzem código de saída diferente de zero. Para incluir as capturas, defina antes `$env:CAPTURE_REDESIGN='1'` no PowerShell. Aprovação de testes locais não comprova segurança do ambiente publicado. As instruções abaixo continuam necessárias.


## 1. IA sem plano pago

1. Crie uma conta no [Groq Console](https://console.groq.com/) e confira o plano e as cotas reais antes de utilizar. Para manter o ensaio sem cobrança, não ative faturamento pago. O código atual usa `openai/gpt-oss-20b`, hospedado na Groq; confira a permissão desse modelo em sua conta. Ele substitui o antigo `llama-3.1-8b-instant`, retirado dos planos Free/Developer em 16/08/2026, conforme [a Groq](https://console.groq.com/docs/deprecations). Para publicar pelo painel, use `supabase/ativacao/05-insights.ts` e siga o guia daquela pasta.
2. Crie uma chave em API Keys. No painel Supabase do projeto `htueuvvndtlusfyaqlqa`, em Edge Functions → Secrets, salve **GROQ_API_KEY**. Não cole a chave no chat, no HTML ou em `public/config.js`.
3. Se já existir `ANTHROPIC_API_KEY`, remova esse segredo quando confirmar que nenhuma outra função depende dele. A versão atual não usa Anthropic nem troca automaticamente de provedor.
4. Confira os controles de dados da conta Groq e publique uma política de privacidade que explique o envio de totais financeiros. Prefira Zero Data Retention quando disponível e mantenha compartilhamento para treinamento desativado.

Limites implementados: 3 tentativas/conta/24h, intervalo de 30 segundos, 100 tentativas/site/24h e até 1.024 tokens de conclusão por resposta, incluindo o processamento interno do modelo, com esforço baixo. O processamento interno é excluído da resposta e o texto entregue ao aplicativo é limitado a 1.500 caracteres. **Chat e Gerar insight compartilham a mesma cota**; cada resposta usa uma tentativa. A janela de 24 horas é móvel, sem reiniciar à meia-noite. Falhas do provedor também consomem uma tentativa. A cota do provedor pode ser menor; consulte o painel. Não há repetição automática da chamada.

O código não garante gratuidade se o proprietário ativar um plano pago. No Free, o provedor pode limitar ou interromper respostas. Contas novas também estão sujeitas à cota global; acompanhe o uso e proteja o cadastro contra abuso.

A análise envia quantidade de registros e totais de receitas, despesas e pagamentos de até 200 transações recentes. O resumo automático não contém nomes, e-mails, IDs, datas ou descrições, nem dados dos porquinhos. **No chat também seguem a mensagem digitada e até duas trocas anteriores**, com limite de 400 caracteres por trecho. O texto do usuário pode incluir dados pessoais se ele os digitar. A conversa fica somente em memória no navegador, sem tabela de histórico. A requisição do chat admite até 8.192 bytes e cinco mensagens alternadas, terminando em pergunta; não aceita papéis system/tool do cliente. A IA pode errar e a amostra não representa necessariamente um mês ou todo o histórico.

## 2. Banco existente

No SQL Editor, aplique nesta ordem as migrações pendentes:

1. `supabase/migrations/202611120001_hardening.sql`
2. `supabase/migrations/202611120002_free_ai.sql`
3. `supabase/migrations/202611240001_quotes_quota.sql`
4. `supabase/migrations/202611240002_piggy_bank.sql`
5. `supabase/migrations/202611250001_abuse_protection.sql`

Não execute `schema.sql` novamente em banco existente. Em banco novo, execute o schema primeiro e depois as cinco migrações. Em banco existente, confira o histórico e aplique somente as pendentes nessa ordem, após backup recuperável. A segunda ativa cotas da IA; a terceira cria o controle de cotações (30 consultas/conta e 300/site por minuto); a quarta cria os porquinhos, o histórico e a função transacional de movimentos; a quinta acrescenta limites de gravação e aprovação de contas. **As duas funções atuais exigem a quinta migração e a liberação explícita das contas em `acessos_servicos`.** Sem a quarta, a tela do Porquinho explica que o serviço ainda precisa de ativação. Não reaplique os scripts históricos `aplicar-patch.js` ou `aplicar-patch-2.js`.

O Porquinho registra manualmente metas e valores guardados fora do site. Não há transferência bancária, rendimento ou alteração no saldo das transações. Saldo/histórico só mudam pela RPC `movimentar_cofrinho`, que identifica o dono pela sessão, bloqueia retiradas acima do saldo e aceita chave de repetição para não duplicar o mesmo pedido. Para ativar: aplicar a quarta migração no SQL Editor e atualizar a página. Testar com duas contas reais antes de abrir ao público.

## 3. Funções Supabase

Com Supabase CLI instalado e autenticado, na pasta `fintheka`:

```powershell
supabase functions deploy quick-service --project-ref htueuvvndtlusfyaqlqa
supabase functions deploy cotacoes --project-ref htueuvvndtlusfyaqlqa
```

Configure `ALLOWED_ORIGIN` nos segredos com as origens exatas do site, separadas por vírgula, por exemplo `https://SEU-PROJETO.web.app,https://SEU-PROJETO.firebaseapp.com`. Inclua domínio próprio caso utilizado. Para cotações, configure `AWESOMEAPI_KEY` se o plano exigir. Ambas as funções validam a sessão no servidor; `supabase/config.toml` define o comportamento do gateway.

Na versão atual, uma chamada do navegador com origem ausente da lista recebe 403. Sem `ALLOWED_ORIGIN` configurado, chamadas com Origin são bloqueadas. Não use `*`. Para desenvolvimento, inclua explicitamente `http://127.0.0.1:5000` ou `http://localhost:5000`, conforme o endereço usado, e retire origens temporárias quando não forem mais necessárias. Antes do deploy, confira os tipos das duas funções com Deno; os testes locais em Node não substituem essa checagem.

## 4. Autenticação e publicação de teste

No Supabase Authentication, mantenha confirmação de e-mail habilitada, configure Site URL e Redirect URLs para o domínio final e confira envio de confirmação e recuperação de senha. Configure mínimo de 12 caracteres para senhas novas no servidor, alinhado ao cliente. Verifique SMTP e limites de cadastro/login/recuperação no painel. Ative autenticação em duas etapas nas contas proprietárias dos serviços. CAPTCHA exige integração adicional no formulário; não habilite a exigência isoladamente. Veja [OPERACAO.md](OPERACAO.md).

Com Firebase CLI instalado e autenticado:

```powershell
firebase use --add
firebase hosting:channel:deploy pre-lancamento
```

Selecione o projeto correto. Cadastre também a URL temporária nos redirecionamentos do Supabase e em `ALLOWED_ORIGIN` enquanto testa. O Hosting publica somente `public/`; não executa SQL nem publica funções Supabase. Confira planos e cotas de cada serviço, incluindo e-mails e cotações. A gratuidade da IA não garante gratuidade de toda a infraestrutura.

## 5. Antes de liberar

- Rode `npm test`, `npm run test:browser` e `npm run check:remote`. O diagnóstico remoto deve mostrar 401 para as duas funções sem sessão e bloquear leitura anônima das tabelas.
- Com duas contas reais, teste cadastro, confirmação, recuperação, login e logout. Uma conta não pode ler nem alterar registros da outra, inclusive por chamadas diretas à API. Cliente não pode se promover para administrador.
- Teste criar, pagar e excluir despesas e receitas, CSV e filtros no computador e celular. Confira os totais.
- Gere uma análise real e confira o painel Groq, os limites e o tratamento de indisponibilidade. Confira cotações após o deploy.
- Abra Assistente IA no menu, no atalho da página inicial ou na navegação inferior. Teste conversa real, cota compartilhada, Nova conversa e limpeza na troca de conta. Reimplante `insights` para aceitar conversas; a versão antiga só produz análise única.
- Teste criar/editar meta, guardar/retirar, reenvio com a mesma chave, retirada excessiva, histórico e exclusão do Porquinho. Uma conta não pode acessar dados de outra, alterar saldo diretamente nem inserir histórico pela API.
- Complete `public/privacidade.html`: o responsável informado é Metheka; faltam a caixa exclusiva de suporte e os prazos reais de retenção. A página está ligada ao login e ao rodapé, mas permanece identificada como pré-lançamento. Não use e-mail pessoal nem publique um endereço fictício.
- Execute e registre o ensaio de backup/restauração e de exclusão com conta descartável conforme [OPERACAO.md](OPERACAO.md). O procedimento escrito não comprova que exista backup configurado.

Depois das verificações:

```powershell
firebase deploy --only hosting
```

## Evidências históricas de 12/11/2026

Naquela revisão, 10 testes de lógica/banco e 9 cenários de navegador foram aprovados. A IA foi testada com respostas simuladas. Os números atuais estão no início deste guia e em [REVISAO.md](REVISAO.md); este histórico não substitui os resultados atuais nem a validação remota.

Diagnóstico remoto repetido em 12/11/2026: autenticação respondeu 200 com confirmação exigida; tabelas e resumo administrativo bloquearam anônimos com 401; `insights` retornou 404 (não publicada); `cotacoes` retornou 503 por excesso de consultas, sem exigir sessão na versão remota. Implante a versão local corrigida antes de liberar.

Referências: [faturamento Groq](https://console.groq.com/docs/billing-faqs), [limites](https://console.groq.com/docs/rate-limits), [tratamento de dados](https://console.groq.com/docs/your-data).
