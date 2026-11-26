const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = vm.createContext({ document: { addEventListener() {} }, console, Map, Date });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/Automac.js'), 'utf8'), context);
const run = (code) => vm.runInContext(code, context);

test('valores: BRL, negativos, números inválidos e infinitos', () => {
  for (const [text, value] of [['1.500,50', 1500.5], ['1500.50', 1500.5], ['-10,25', -10.25], ['0', 0]]) {
    assert.equal(context.converterValor(text), value);
  }
  for (const text of ['', 'Infinity', '1e6', '0xFF', '10,123', '10abc', '1,2,3']) assert.ok(Number.isNaN(context.converterValor(text)), text);
});
test('datas reais, anos bissextos e datas impossíveis', () => {
  assert.equal(context.normalizarData('29/02/2024'), '2024-02-29');
  assert.equal(context.normalizarData('2026-11-12'), '2026-11-12');
  for (const date of ['2026-02-29', '31/04/2026', '2026-13-01', '0000-01-01', 'x']) assert.equal(context.normalizarData(date), null);
});
test('CSV: delimitadores, aspas escapadas e quebra de linha', () => {
  const rows = context.lerCsv('data;descricao;contato;categoria;valor;tipo\r\n2026-11-12;"Serviço; com ""aspas""\nextra";Ana;Outros;1.500,50;Única');
  assert.equal(rows.length, 2);
  assert.equal(rows[1][1], 'Serviço; com "aspas"\nextra');
  assert.equal(rows[1][4], '1.500,50');
  assert.equal(context.lerCsv('2026-11-12,"um, dois",Ana,Outros,20.00,Única')[0][1], 'um, dois');
  assert.throws(() => context.lerCsv('a,"aspas abertas'));
  assert.throws(() => context.lerCsv('a,"fechadas"inválido'));
});
test('validação respeita limite do PostgreSQL após arredondar', () => {
  const valid = { data: '2026-11-12', descricao: 'Teste', valor: -100 };
  assert.equal(context.validarTransacao(valid).valor, -100);
  for (const value of [1e11, -1e11, 99999999999.999, Infinity]) assert.throws(() => context.validarTransacao({ ...valid, valor: value }));
  assert.throws(() => context.validarTransacao({ ...valid, data: '2026-02-31' }));
  assert.throws(() => context.validarTransacao({ ...valid, descricao: '  ' }));
});
test('nomes especiais não alteram protótipos nem corrompem agrupamentos', () => {
  const data = [{ categoria: '__proto__', valor: 20 }, { categoria: 'constructor', valor: 30 }];
  assert.equal(context.agruparPor(data, 'categoria').find((g) => g.nome === '__proto__').total, 20);
});
test('XSS de textos importados é escapado', () => {
  assert.equal(context.escaparHtml('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});

test('zero monetário não exibe sinal negativo e agrupamentos somam centavos exatos', () => {
  assert.equal(context.formatarMoeda(-0), context.formatarMoeda(0));
  assert.equal(context.formatarMoeda(-.001), context.formatarMoeda(0));
  assert.match(context.formatarMoeda(-.01), /-/);
  assert.equal(context.agruparPor([{ categoria: 'A', valor: .1 }, { categoria: 'A', valor: .2 }], 'categoria')[0].total, .3);
});
test('HTML: IDs únicos e todos os arquivos locais presentes', () => {
  const publicPath = path.join(__dirname, '../public');
  const html = fs.readFileSync(path.join(publicPath, 'index.html'), 'utf8');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(ids.length, new Set(ids).size);
  for (const [, file] of html.matchAll(/(?:src|href)="([^"#]+\.(?:js|css))"/g)) {
    if (!file.startsWith('https:')) assert.ok(fs.existsSync(path.join(publicPath, file)), file);
  }
});
