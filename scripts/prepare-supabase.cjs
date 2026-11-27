const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, 'supabase', file), 'utf8').replace(/\r\n/g, '\n');

function build() {
  const migrations = ['202611240001_quotes_quota.sql', '202611240002_piggy_bank.sql', '202611250001_abuse_protection.sql'];
  const parts = migrations.map((file) => {
    const sql = read(`migrations/${file}`);
    if ((sql.match(/^begin;$/gm) || []).length !== 1 || (sql.match(/^commit;$/gm) || []).length !== 1) throw new Error(`Transações inesperadas: ${file}`);
    return `-- Fonte: migrations/${file}\n${sql.replace(/^begin;\n/m, '').replace(/^commit;\n?/m, '').trim()}\n`;
  });
  const sql = `-- GERADO por npm run prepare:supabase. Copie o arquivo inteiro no SQL Editor.
-- Prepara Porquinho e controle de cotações no banco existente, preservando registros.
-- Não executa schema.sql, não insere dados de exemplo e não altera aceites dos termos.
begin;
do $$ begin
  if to_regclass('public.perfis') is null or to_regclass('public.transacoes') is null then
    raise exception 'Abra o projeto que já contém perfis e transacoes do FinTheka.';
  end if;
end $$;
-- A proteção dos serviços utiliza esta tabela mesmo com a IA ainda desativada.
create table if not exists public.uso_insights (
  usuario_id uuid not null references auth.users(id) on delete cascade,
  usado_em timestamptz not null default now()
);
alter table public.uso_insights enable row level security;
revoke all on public.uso_insights from public,anon,authenticated;
grant select,insert,delete on public.uso_insights to service_role;
${parts.join('\n')}
notify pgrst, 'reload schema';
commit;
`;
  // O editor do painel recebe um arquivo só, sem imports relativos ausentes.
  const shared = read('functions/_shared/http.ts').replace(/\bheaders(?=\()/g, 'corsHeaders');
  // A fonte .mjs continua compartilhada com os testes Node. O arquivo único do
  // painel recebe anotações TypeScript para manter a checagem Deno habilitada.
  const ai = read('functions/_shared/insights.mjs')
    .replace('resumirTransacoes(transacoes)', 'resumirTransacoes(transacoes: Array<{ valor: number | string; pago?: boolean }>)')
    .replace("['receitas', 'despesas', 'recebido', 'pago'])", "['receitas', 'despesas', 'recebido', 'pago'] as const)")
    .replace('export class FalhaIA extends Error {', 'export class FalhaIA extends Error {\n  status: number;')
    .replace('constructor(status, mensagem)', 'constructor(status: number, mensagem: string)')
    .replace('consultarIA(chave, resumo, solicitar = fetch)', 'consultarIA(chave: string, resumo: ReturnType<typeof resumirTransacoes>, solicitar: typeof fetch = fetch)')
    .replace('validarConversa(mensagens)', 'validarConversa(mensagens: unknown)')
    .replace('consultarConversa(chave, resumo, mensagens, solicitar = fetch)', 'consultarConversa(chave: string, resumo: ReturnType<typeof resumirTransacoes>, mensagens: unknown, solicitar: typeof fetch = fetch)');
  const bundle = (name) => `// GERADO por npm run prepare:supabase. Nome da Edge Function: ${name === 'insights' ? 'quick-service' : name}\n// Cole tudo no index.ts do editor de Edge Functions, não no SQL Editor.\n${shared}\n${name === 'insights' ? ai : ''}\n${read(`functions/${name}/index.ts`).replace(/^import .+from ["'][^"']+["'];?\n/gm, '').replace(/\bheaders(?=\()/g, 'corsHeaders')}`;
  const files = {
    '01-banco-recursos.sql': sql,
    '02-liberar-cotacoes.sql': `-- Troque SEU_EMAIL_AQUI pelo e-mail da conta que usará na apresentação.
-- Libera só cotações; não libera IA, não muda papel e não cria uma conta.
do $$
declare
  email_conta text := 'SEU_EMAIL_AQUI';
  dono uuid;
begin
  if email_conta = 'SEU_EMAIL_AQUI' then
    raise exception 'Substitua o valor de email_conta pelo seu e-mail antes de executar.';
  end if;
  select id into dono from auth.users where lower(email)=lower(btrim(email_conta));
  if dono is null then raise exception 'Conta não encontrada. Confira o e-mail usado para entrar no site.'; end if;
  if exists(select 1 from public.acessos_servicos where usuario_id=dono and expira_em<=now()) then
    raise exception 'Esta autorização possui expiração vencida. Confira expira_em antes de reativá-la.';
  end if;
  insert into public.acessos_servicos(usuario_id,cotacoes) values(dono,true)
  on conflict(usuario_id) do update set cotacoes=true;
end $$;
`,
    '03-cotacoes.ts': bundle('cotacoes'),
    '04-excluir-conta.ts': bundle('excluir-conta'),
  };
  files['05-insights.ts'] = bundle('insights');
  files['06-liberar-ia.sql'] = files['02-liberar-cotacoes.sql']
    .replace('-- Libera só cotações; não libera IA, não muda papel e não cria uma conta.', '-- Libera só IA; preserva a permissão de cotações, não muda papel nem cria conta.')
    .replace(/\bcotacoes\b/g, 'insights');
  return files;
}
function prepare() {
  const directory = path.join(root, 'supabase/ativacao');
  fs.mkdirSync(directory, { recursive: true });
  for (const [file, content] of Object.entries(build())) fs.writeFileSync(path.join(directory, file), content);
  console.log('Arquivos prontos em supabase/ativacao. Nenhuma conexão com o banco foi realizada.');
}
if (require.main === module) prepare();
module.exports = { build, prepare };
