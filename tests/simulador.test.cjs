const { test } = require('node:test');
const assert = require('node:assert/strict');
const motor = require('../public/SimuladorCore.js');
const config = { inicial: 1000, aporte: 200, meses: 12, taxa: 1, unidadeTaxa: 'mensal', inflacao: 0, custos: 0, reajuste: 0, momento: 'fim', meta: 0, variacao: 2 };
const perto = (a, b, tolerancia = 1e-7) => assert.ok(Math.abs(a - b) <= tolerancia, `${a} deve equivaler a ${b}`);

test('simulador confere com fórmula fechada de juros compostos e aportes no fim', () => {
    const r = motor.projetar(config);
    const fator = 1.01 ** 12;
    perto(r.final.saldo, 1000 * fator + 200 * (fator - 1) / .01);
    perto(r.final.aportado, 3400);
    perto(r.final.ganho, r.final.saldo - 3400);
    perto(r.final.real, r.final.saldo);
});
test('aporte no início corresponde à anuidade antecipada e taxa zero não divide por zero', () => {
    const inicio = motor.projetar({ ...config, momento: 'inicio' });
    perto(inicio.final.saldo, 1000 * 1.01 ** 12 + 200 * ((1.01 ** 12 - 1) / .01) * 1.01);
    const zero = motor.projetar({ ...config, taxa: 0 });
    perto(zero.final.saldo, 3400); perto(zero.final.ganho, 0);
    perto(motor.projetar({ ...config, taxa: 0, momento: 'inicio' }).final.saldo, zero.final.saldo);
});
test('taxas anuais e mensais equivalentes produzem o mesmo resultado sem divisão simples por 12', () => {
    const anual = motor.anualizar(1, 'mensal');
    const r = motor.projetar({ ...config, taxa: anual, unidadeTaxa: 'anual' });
    perto(r.final.saldo, motor.projetar(config).final.saldo);
    perto(r.mensal, 1); assert.notEqual(r.mensal, anual / 12);
});
test('inflação deflaciona o saldo, sem alterar o nominal ou os aportes', () => {
    const r = motor.projetar({ ...config, inflacao: 10, meses: 24 });
    perto(r.final.real, r.final.saldo / 1.1 ** 2);
    perto(r.final.saldo, motor.projetar({ ...config, meses: 24 }).final.saldo);
});
test('custos percentuais são debitados mensalmente e reconciliam juros, capital e saldo', () => {
    const r = motor.projetar({ ...config, custos: 2 });
    perto(r.final.saldo, r.final.aportado + r.historico.reduce((s, p) => s + p.juros, 0) - r.final.custos);
    assert.ok(r.final.saldo < motor.projetar(config).final.saldo);
    const semJuros = motor.projetar({ ...config, taxa: 0, aporte: 0, custos: 2 });
    perto(semJuros.final.saldo, 980); perto(semJuros.final.custos, 20);
});
test('aporte é reajustado apenas no mês 13, 25 e demais aniversários', () => {
    const r = motor.projetar({ ...config, meses: 25, reajuste: 10, taxa: 0 });
    perto(r.historico[12].aporte, 200); perto(r.historico[13].aporte, 220);
    perto(r.historico[24].aporte, 220); perto(r.historico[25].aporte, 242);
    perto(r.final.saldo, 1000 + 12 * 200 + 12 * 220 + 242);
});
test('metas distinguem capital inicial, primeiro alcance e prazo insuficiente', () => {
    assert.equal(motor.projetar({ ...config, meta: 900 }).metaMes, 0);
    assert.equal(motor.projetar({ ...config, taxa: 0, meta: 1600 }).metaMes, 3);
    assert.equal(motor.projetar({ ...config, meta: 1e9 }).metaMes, null);
    assert.equal(motor.calcularAporteMeta(config), null);
    assert.equal(motor.calcularAporteMeta({ ...config, meta: 900 }), 0);
});
test('aporte para meta é resolvido com custos, reajustes e ambos os momentos', () => {
    for (const momento of ['inicio', 'fim']) {
        const c = { ...config, momento, meses: 120, meta: 200000, reajuste: 5, custos: 1 };
        const aporte = motor.calcularAporteMeta(c);
        const r = motor.projetar({ ...c, aporte });
        assert.ok(r.final.saldo >= c.meta - 1e-7);
        assert.ok(motor.projetar({ ...c, aporte: aporte - .01 }).final.saldo < c.meta);
    }
});
test('cenários mudam apenas a taxa anual, e perdas e valores zero permanecem finitos', () => {
    const r = motor.comparar(config);
    perto(r.maior.anual - r.base.anual, 2); perto(r.base.anual - r.menor.anual, 2);
    assert.ok(r.menor.final.saldo < r.base.final.saldo && r.base.final.saldo < r.maior.final.saldo);
    assert.equal(motor.projetar({ ...config, inicial: 0, aporte: 0 }).final.saldo, 0);
    const perda = motor.projetar({ ...config, taxa: -20, unidadeTaxa: 'anual', aporte: 0 });
    perto(perda.final.saldo, 800); perto(perda.final.ganho, -200);
});
test('dados inválidos, projeções excessivas e prazos fracionários falham explicitamente', () => {
    for (const patch of [{ meses: 601 }, { meses: 1.5 }, { meses: 0 }, { taxa: NaN }, { inicial: Infinity }, { inicial: -1 }, { custos: 100 }, { momento: 'qualquer' }, { unidadeTaxa: 'diaria' }]) assert.throws(() => motor.projetar({ ...config, ...patch }));
    assert.throws(() => motor.projetar({ ...config, meses: 600, taxa: 100, unidadeTaxa: 'anual' }), /limite/);
    assert.throws(() => motor.comparar({ ...config, taxa: -90, unidadeTaxa: 'anual', variacao: 20 }), /maiores que -100/);
    assert.equal(motor.projetar({ ...config, meses: 600, taxa: 0 }).historico.length, 601);
});
