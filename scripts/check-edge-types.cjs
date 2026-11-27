// Usa o Deno oficial fixado no cache do npm. Não instala globalmente nem executa os handlers.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
if (!process.env.npm_execpath) throw new Error('Execute npm run check:edge-types.');
const result = spawnSync(process.execPath, [process.env.npm_execpath,
    'exec', '--yes', '--prefer-offline', '--fetch-timeout=15000', '--fetch-retries=0', '--package=deno@2.9.6', '--', 'deno', 'check',
    '--no-config', '--frozen', '--node-modules-dir=none',
    'supabase/functions/insights/index.ts', 'supabase/functions/cotacoes/index.ts',
    'supabase/functions/excluir-conta/index.ts',
    'supabase/ativacao/03-cotacoes.ts', 'supabase/ativacao/04-excluir-conta.ts',
    'supabase/ativacao/05-insights.ts',
], {
    cwd: path.join(__dirname, '..'), stdio: 'inherit',
    env: { ...process.env, DENO_TLS_CA_STORE: process.env.DENO_TLS_CA_STORE || 'system,mozilla' },
});
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
