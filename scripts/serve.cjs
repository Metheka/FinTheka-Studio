const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../public');
const config = require('../firebase.json');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let name;
  try { name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400).end(); return; }
  const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
  for (const h of config.hosting.headers[0].headers) res.setHeader(h.key, h.value);
  if (!file.startsWith(root + path.sep) || !mime[path.extname(file)] || /\.bak/i.test(file) || path.relative(root, file).split(path.sep).some((part) => part.startsWith('.'))) { res.writeHead(404).end(); return; }
  res.setHeader('Cache-Control', 'no-store');
  fs.readFile(file, (error, data) => {
    res.writeHead(error ? 404 : 200, { 'Content-Type': mime[path.extname(file)] });
    res.end(error ? 'Não encontrado' : data);
  });
});
if (require.main === module) server.listen(Number(process.env.PORT || 5000), '127.0.0.1', () => console.log('FinTheka: http://127.0.0.1:5000'));
module.exports = server;
