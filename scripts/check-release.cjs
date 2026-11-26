// Diagnóstico de lançamento. Não publica, não cria contas e não altera o banco remoto.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Execute pelo comando npm run check:release.');
const checks = [
    ['Credenciais na pasta pública', ['run', 'check:credentials']],
    ['Lógica e banco', ['test']],
    ['Segurança das funções, permissões e Hosting', ['run', 'test:security']],
    ['Tipos das funções Supabase no Deno', ['run', 'check:edge-types']],
    ['Fluxos e proteção no navegador', ['run', 'test:browser']],
    ['Vulnerabilidades conhecidas nas dependências', ['audit', '--audit-level=low', '--fetch-timeout=15000', '--fetch-retries=0']],
    ['Configuração remota do Supabase', ['run', 'check:remote']],
];
const resultados = [];
for (const [nome, args] of checks) {
    console.log(`\nVerificando: ${nome}`);
    const run = spawnSync(process.execPath, [npm, ...args], { cwd: path.join(__dirname, '..'), stdio: 'inherit', env: process.env });
    resultados.push({ verificacao: nome, aprovado: run.status === 0, codigo: run.status });
    if (run.error) console.error(run.error.message);
}
const aprovado = resultados.every((r) => r.aprovado);
const directory = path.join(__dirname, '../artifacts/security');
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(path.join(directory, 'check-release.json'), JSON.stringify({ executadoEm: new Date().toISOString(), aprovado, resultados }, null, 2) + '\n');
for (const r of resultados) console.log(`${r.aprovado ? 'PASS' : 'FAIL'} ${r.verificacao}`);
console.log(aprovado ? 'Verificações automáticas aprovadas. Restam os testes com contas reais e a URL final descritos em LANCAMENTO.md.' : 'Lançamento ainda não aprovado: resolva as verificações FAIL e execute novamente.');
process.exitCode = aprovado ? 0 : 1;
