const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/Categorias.js'), 'utf8'), context);

test('categorias separam receitas/despesas e reaproveitam o histórico completo da conta', () => {
    const rows = [{ valor: -10, categoria: 'Comida da faculdade' }, { valor: 100, categoria: 'Trabalho extra' }];
    const despesas = context.listarCategorias('despesa', rows);
    assert.ok(despesas.some((c) => c.nome === 'Supermercado'));
    assert.ok(despesas.some((c) => c.nome === 'Comida da faculdade' && c.personalizada));
    assert.ok(!despesas.some((c) => c.nome === 'Trabalho extra'));
    assert.ok(context.listarCategorias('receita', rows).some((c) => c.nome === 'Trabalho extra'));
});

test('categorias deduplicam acentos/caixa, respeitam nomes especiais e limite do banco', () => {
    const result = context.listarCategorias('receita', [], [' salario ', 'SALÁRIO', '__proto__', 'constructor', '', 'a'.repeat(61)]);
    assert.equal(result.filter((c) => context.chaveCategoria(c.nome) === 'salario').length, 1);
    assert.ok(result.some((c) => c.nome === '__proto__'));
    assert.ok(result.some((c) => c.nome === 'constructor'));
    assert.ok(!result.some((c) => c.nome.length > 60));
});
