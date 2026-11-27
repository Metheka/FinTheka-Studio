const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../public');
const config = require('../firebase.json');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
function createServer(localApi = null) {
return http.createServer((req, res) => {
  let name;
  try { name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400).end(); return; }
  const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
  for (const h of config.hosting.headers[0].headers) res.setHeader(h.key, h.value);
  if (localApi) {
    let host;
    try { host = new URL(`http://${req.headers.host}`).hostname; } catch { res.writeHead(400).end(); return; }
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) { res.writeHead(403).end(); return; }
    if (name.startsWith('/local/')) { localApi(req, res, new URL(req.url, 'http://localhost')); return; }
    if (name === '/config.js') {
      res.writeHead(200, { 'Content-Type': mime['.js'], 'Cache-Control': 'no-store' });
      res.end("window.APP_CONFIG = { LOCAL_BACKEND: true, SUPABASE_URL: location.origin + '/local', SUPABASE_ANON_KEY: 'sb_publishable_local_presentation' };\n");
      return;
    }
  }
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
  if (!file.startsWith(root + path.sep) || !mime[path.extname(file)] || /\.bak/i.test(file) || path.relative(root, file).split(path.sep).some((part) => part.startsWith('.'))) { res.writeHead(404).end(); return; }
  res.setHeader('Cache-Control', 'no-store');
  fs.readFile(file, (error, data) => {
    res.writeHead(error ? 404 : 200, { 'Content-Type': mime[path.extname(file)] });
    res.end(req.method === 'HEAD' ? undefined : error ? 'Não encontrado' : data);
  });
});
}
const server = createServer();
async function start() {
  // Supabase is the normal backend. The isolated test database is opt-in.
  const remote = !process.argv.includes('--local');
  const db = remote ? null : await require('./local-db.cjs').openDatabase();
  const app = remote ? server : createServer(require('./local-api.cjs').createLocalApi(db));
  app.on('error', async (error) => {
    console.error(error.code === 'EADDRINUSE' ? 'A porta está ocupada. Feche o outro servidor ou defina PORT com outra porta.' : error.message);
    if (db) await db.close();
    process.exitCode = 1;
  });
  app.listen(Number(process.env.PORT || 5000), '127.0.0.1', () => {
    console.log(`FinTheka: http://127.0.0.1:${app.address().port}`);
    console.log(remote ? 'Supabase online ativo: entre com sua conta existente. Precisa de internet. Banco local de testes desligado.' : 'Banco local de testes ativo, separado do Supabase: .local-data/postgres.');
    console.log('Mantenha este terminal aberto. Para encerrar, pressione Ctrl+C.');
  });
  let closing = false;
  const close = () => {
    if (closing) return; closing = true;
    app.close(async () => { if (db) await db.close(); });
    app.closeIdleConnections();
  };
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
}
if (require.main === module) start().catch((error) => { console.error('Não foi possível iniciar o FinTheka:', error.message); process.exitCode = 1; });
module.exports = server;
module.exports.createServer = createServer;
