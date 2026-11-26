const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = vm.createContext({ document: { addEventListener() {} }, console, Map, Date });
for (const file of ['Automac.js', 'Studio.js', 'PainelGraficos.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../public', file), 'utf8'), context);
const row = (data, valor, pago = true, categoria = 'Outros') => ({ data, valor, pago, categoria });

test('movimentos mensais somam centavos, separam pendencias e respeitam fevereiro bissexto', () => {
    const serie = context.calcularMovimentosDoMes([
        row('2024-02-29', .1), row('2024-02-29', .2, false), row('2024-02-29', -.15),
        row('2024-03-01', 999), row('2024-01-31', -999),
    ], '2024-02-15');
    assert.equal(serie.length, 29);
    assert.equal(serie[28].receitas, .3);
    assert.equal(serie[28].despesas, .15);
    assert.equal(serie[28].pagos, 2);
    assert.equal(serie[28].pendentes, 1);
    assert.equal(serie[0].receitas, 0);
});

test('variacao do saldo inclui movimentos do primeiro dia e ignora pendentes e futuros', () => {
    const resumo = context.resumoEvolucaoSaldo([
        row('2026-01-01', -100), row('2026-01-02', 50.01), row('2026-01-03', -20.02),
        row('2026-01-03', 999, false), row('2026-01-05', 999),
    ], 3, new Date(2026, 0, 4, 12));
    assert.equal(resumo.inicial, -100);
    assert.equal(resumo.final, -70.01);
    assert.equal(resumo.variacao, 29.99);
});

test('painel separa saldo de todo o histórico dos totais e pendências do mês', () => {
    const resumo = context.calcularResumoPainel([
        row('2025-12-31', 1000), row('2026-01-01', 100.01), row('2026-01-02', -20.02),
        row('2026-01-03', 50, false), row('2026-01-04', -10, false), row('2026-02-01', 999, false),
    ], '2026-01-15');
    assert.equal(resumo.saldo, 1079.99);
    assert.equal(resumo.receitas, 150.01);
    assert.equal(resumo.despesas, 30.02);
    assert.equal(resumo.recebido, 100.01);
    assert.equal(resumo.pago, 20.02);
    assert.equal(resumo.pendentes, 2);
    assert.equal(resumo.categorias[0].total, 30.02);
});

test('evolução preserva saldo anterior, dias sem movimentos e ignora pendentes/futuros', () => {
    const serie = context.calcularSerieSaldo([
        row('2025-12-01', 100), row('2025-12-31', .1), row('2026-01-01', .2),
        row('2026-01-01', 500, false), row('2026-01-02', -10), row('2026-01-04', 999),
    ], 4, new Date(2026, 0, 3, 12));
    assert.deepEqual(JSON.parse(JSON.stringify(serie)), [
        { data: '2025-12-31', saldo: 100.1 }, { data: '2026-01-01', saldo: 100.3 },
        { data: '2026-01-02', saldo: 90.3 }, { data: '2026-01-03', saldo: 90.3 },
    ]);
});

test('painel vazio e despesas com nomes especiais não corrompem os agrupamentos', () => {
    const vazio = context.calcularResumoPainel([], '2026-01-01');
    assert.equal(vazio.saldo, 0); assert.equal(vazio.pendentes, 0); assert.equal(vazio.categorias.length, 0);
    const resumo = context.calcularResumoPainel([row('2026-01-01', -10, true, '__proto__'), row('2026-01-01', -20, false, 'constructor')], '2026-01-01');
    assert.equal(resumo.categorias[0].nome, 'constructor');
    assert.equal(resumo.categorias[1].total, 10);
});
