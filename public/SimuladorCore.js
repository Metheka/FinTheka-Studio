/* Motor determinístico. Taxas efetivas, sem arredondamento intermediário. */
var MotorSimulacao = (() => {
    const LIMITE_SALDO = 1e15;
    function validar(c) {
        for (const key of ['inicial', 'aporte', 'meses', 'taxa', 'inflacao', 'custos', 'reajuste', 'meta', 'variacao']) {
            if (!Number.isFinite(c[key])) throw new Error('Preencha os campos com números válidos.');
        }
        if (!Number.isInteger(c.meses) || c.meses < 1 || c.meses > 600) throw new Error('Escolha um prazo de 1 a 600 meses (até 50 anos).');
        if (c.inicial < 0 || c.aporte < 0 || c.inicial > 1e9 || c.aporte > 1e9) throw new Error('Capital e aporte devem estar entre zero e R$ 1 bilhão.');
        if (!['mensal', 'anual'].includes(c.unidadeTaxa) || !['inicio', 'fim'].includes(c.momento)) throw new Error('Confira a periodicidade da taxa e o momento do aporte.');
        const taxaAnual = anualizar(c.taxa, c.unidadeTaxa);
        if (c.taxa <= -100 || taxaAnual < -90 - 1e-8 || taxaAnual > 100 + 1e-8) throw new Error('Use uma rentabilidade anual efetiva entre -90% e 100%, ou sua equivalente mensal.');
        if (c.inflacao < 0 || c.inflacao > 50 || c.custos < 0 || c.custos > 20 || c.reajuste < 0 || c.reajuste > 50) throw new Error('Confira as hipóteses: inflação e reajuste de 0% a 50%; custos de 0% a 20% ao ano.');
        if (c.meta < 0 || c.meta > 1e12 || c.variacao < 0 || c.variacao > 20) throw new Error('Meta deve ficar entre zero e R$ 1 trilhão; variação de cenários entre 0 e 20 pontos percentuais.');
    }
    function anualizar(taxa, unidade) {
        return unidade === 'anual' ? taxa : (Math.pow(1 + taxa / 100, 12) - 1) * 100;
    }
    function projetar(config, taxaAnual) {
        validar(config);
        const c = { ...config };
        const anual = taxaAnual === undefined ? anualizar(c.taxa, c.unidadeTaxa) : taxaAnual;
        if (!Number.isFinite(anual) || anual <= -100) throw new Error('As taxas de todos os cenários precisam ser maiores que -100% ao ano. Reduza a variação.');
        const taxaMes = Math.expm1(Math.log1p(anual / 100) / 12);
        // Fração anual de custo convertida em retenção mensal equivalente.
        const retencao = Math.pow(1 - c.custos / 100, 1 / 12);
        let saldo = c.inicial, aportado = c.inicial, custos = 0;
        let metaMes = c.meta > 0 && saldo >= c.meta ? 0 : null;
        const historico = [{ mes: 0, aporte: 0, aportado, juros: 0, custo: 0, custos: 0, saldo, real: saldo, ganho: 0 }];
        for (let mes = 1; mes <= c.meses; mes++) {
            const aporte = c.aporte * Math.pow(1 + c.reajuste / 100, Math.floor((mes - 1) / 12));
            const base = saldo + (c.momento === 'inicio' ? aporte : 0);
            const juros = base * taxaMes;
            const custo = (base + juros) * (1 - retencao);
            saldo = base + juros - custo + (c.momento === 'fim' ? aporte : 0);
            aportado += aporte; custos += custo;
            const real = saldo / Math.pow(1 + c.inflacao / 100, mes / 12);
            if (![saldo, aportado, custos, real].every(Number.isFinite) || Math.max(saldo, aportado) > LIMITE_SALDO) {
                throw new Error('A projeção excedeu o limite de R$ 1 quadrilhão. Reduza taxa, prazo ou valores.');
            }
            historico.push({ mes, aporte, aportado, juros, custo, custos, saldo, real, ganho: saldo - aportado });
            if (c.meta > 0 && metaMes === null && saldo >= c.meta) metaMes = mes;
        }
        return { config: c, anual, mensal: taxaMes * 100, liquidaAnual: ((1 + anual / 100) * (1 - c.custos / 100) - 1) * 100, historico, final: historico[historico.length - 1], metaMes };
    }
    function comparar(config) {
        const base = projetar(config);
        return {
            base,
            menor: projetar(config, base.anual - config.variacao),
            maior: projetar(config, base.anual + config.variacao),
        };
    }
    function calcularAporteMeta(config) {
        if (!config.meta) return null;
        const zero = projetar({ ...config, aporte: 0 });
        if (zero.final.saldo >= config.meta) return 0;
        // A recorrência é linear no aporte, inclusive com reajuste e custo percentual.
        const unitario = projetar({ ...config, inicial: 0, aporte: 1, meta: 0 });
        const efeito = unitario.final.saldo;
        return efeito > 0 ? Math.ceil((config.meta - zero.final.saldo) / efeito * 100) / 100 : null;
    }
    return Object.freeze({ projetar, comparar, anualizar, calcularAporteMeta });
})();
if (typeof module !== 'undefined' && module.exports) module.exports = MotorSimulacao;
