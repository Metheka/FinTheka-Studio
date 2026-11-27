// Somente leitura: não cria contas nem altera dados.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/config.js'), 'utf8'), context);
const { SUPABASE_URL: base, SUPABASE_ANON_KEY: key, INSIGHTS_FUNCTION: insightsFunction = 'insights' } = context.window.APP_CONFIG;
const endpoints = [
  ['/auth/v1/settings', 'auth'],
  ['/rest/v1/transacoes?select=id&limit=1', 'private'],
  ['/rest/v1/perfis?select=id&limit=1', 'private'],
  ['/rest/v1/uso_insights?select=usuario_id&limit=1', 'private'],
  ['/rest/v1/uso_cotacoes?select=usuario_id&limit=1', 'private'],
  ['/rest/v1/cofrinhos?select=id&limit=1', 'private'],
  ['/rest/v1/movimentos_cofrinho?select=id&limit=1', 'private'],
  ['/rest/v1/acessos_servicos?select=usuario_id&limit=1', 'private'],
  ['/rest/v1/rpc/resumo_usuarios', 'private'],
  ['/functions/v1/cotacoes', 'function', 'POST'],
  [`/functions/v1/${insightsFunction}`, 'function', 'POST'],
  ['/functions/v1/excluir-conta', 'function', 'POST'],
];
(async () => {
  for (const [endpoint, type, method = 'GET'] of endpoints) {
    try {
      const headers = { apikey: key };
      // Exercita o papel anon no PostgREST, em vez de testar apenas o gateway sem credencial.
      if (type === 'private' && key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
      if (method === 'POST') headers['Content-Type'] = 'application/json';
      const response = await fetch(base + endpoint, {
        method, headers, ...(method === 'POST' ? { body: '{}' } : {}), signal: AbortSignal.timeout(15000),
      });
      const data = await response.json();
      if (type === 'private') {
        const blocked = [401, 403].includes(response.status);
        console.log(`${blocked ? 'PASS' : 'REVIEW'} ${endpoint}: HTTP ${response.status}${Array.isArray(data) ? ` (${data.length} registros)` : ''}`);
        if (!blocked) process.exitCode = 1;
      } else if (type === 'auth') {
        console.log(`Auth: HTTP ${response.status}; email=${data.email?.enabled ?? data.external?.email}; confirmação automática=${data.mailer_autoconfirm}`);
        if (!response.ok || data.mailer_autoconfirm !== false || (data.email?.enabled ?? data.external?.email) !== true) process.exitCode = 1;
      } else {
        console.log(`${endpoint}: HTTP ${response.status}; ${data.message || data.erro || data.code || 'disponível'}`);
        // Sem sessão, ambas devem exigir autenticação após o deploy corrigido.
        if (response.status !== 401) process.exitCode = 1;
        if (response.headers.get('x-fintheka-security-version') !== '2026-11-25.1') {
          console.log('REVIEW versão de segurança remota desatualizada ou não verificável');
          process.exitCode = 1;
        }
      }
    } catch (error) {
      console.error(`${endpoint}: ${error.message} ${error.cause?.code || ''}`);
      process.exitCode = 1;
    }
  }
})();
