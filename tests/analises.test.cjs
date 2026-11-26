const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const ctx = vm.createContext({ document: { addEventListener() {} } });
for (const file of ['Automac.js','Analises.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../public',file),'utf8'),ctx);

test('pizza agrega categorias menores sem perder centavos e não inclui valores inválidos', () => {
  const r = ctx.comporDespesas([{nome:'A',total:100.1},{nome:'B',total:0.2},{nome:'C',total:20},{nome:'D',total:0},{nome:'E',total:NaN}],2);
  assert.equal(r.total,120.3);
  assert.equal(r.grupos.length,3);
  assert.equal(r.grupos[2].nome,'Demais categorias');
  assert.equal(r.grupos[2].valor,0.2);
  assert.ok(Math.abs(r.grupos.reduce((s,g)=>s+g.percentual,0)-100)<1e-10);
  assert.equal(ctx.comporDespesas([]).grupos.length,0);
});
test('fluxo mensal cobre seis meses incluindo virada de ano, soma centavos e separa sinais', () => {
  const r=ctx.calcularFluxoMensal([
    {data:'2025-08-31',valor:999}, {data:'2025-09-01',valor:100.1}, {data:'2025-09-02',valor:0.2},
    {data:'2025-09-03',valor:-10.05,pago:false}, {data:'2026-02-20',valor:-30,pago:true}, {data:'2026-03-01',valor:888},
  ],'2026-02-10');
  assert.deepEqual(JSON.parse(JSON.stringify(r.map((m)=>m.mes))),['2025-09','2025-10','2025-11','2025-12','2026-01','2026-02']);
  assert.equal(r[0].receitas,100.3); assert.equal(r[0].despesas,10.05); assert.equal(r[0].resultado,90.25);
  assert.equal(r[5].despesas,30); assert.equal(r[5].resultado,-30);
});
test('oscilação usa diferença percentual entre fechamentos e preserva altas, quedas e zero', () => {
  const r=ctx.calcularOscilacao([100,110,99,99].map((close,i)=>({close,time:`2026-01-0${i+1}`})));
  assert.equal(r.length,3); assert.ok(Math.abs(r[0].variacao-10)<1e-10); assert.ok(Math.abs(r[1].variacao+10)<1e-10); assert.equal(r[2].variacao,0);
  assert.equal(ctx.calcularOscilacao([{close:0},{close:10}]).length,0);
  assert.equal(ctx.calcularOscilacao([{close:1},{close:Infinity}]).length,0);
});
