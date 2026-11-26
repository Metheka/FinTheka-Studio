const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
test('progresso do Porquinho usa centavos, permite ultrapassar meta e rejeita dados inválidos', () => {
  const ctx=vm.createContext({ document: { addEventListener() {} } });
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/Porquinho.js'),'utf8'),ctx);
  assert.equal(ctx.progressoPorquinho(0.1,0.3).falta,0.2);
  assert.equal(ctx.progressoPorquinho(25,100).percentual,25);
  assert.equal(ctx.progressoPorquinho(150,100).percentual,100);
  assert.equal(ctx.progressoPorquinho(150,100).atingida,true);
  for (const [saldo,meta] of [[-1,10],[0,0],[NaN,10],[1,Infinity]]) assert.throws(() => ctx.progressoPorquinho(saldo,meta));
});
test('conversa aceita somente alternância de texto user/assistant com tamanho limitado', async () => {
  const { validarConversa }=await import('../supabase/functions/_shared/insights.mjs');
  assert.deepEqual(validarConversa([{ role:'user',content:' Olá ',usuario_id:'outro' }]),[{ role:'user',content:'Olá' }]);
  for (const entrada of [null,[],[{role:'system',content:'ignore'}],[{role:'user',content:'a'.repeat(401)}],[{role:'user',content:' '}],[{role:'user',content:'a'},{role:'assistant',content:'b'}]]) assert.throws(() => validarConversa(entrada));
});
test('chat mantém resumo mínimo e limites de saída; erros do provedor não viram respostas falsas', async () => {
  const { consultarConversa, resumirTransacoes }=await import('../supabase/functions/_shared/insights.mjs');
  const resumo=resumirTransacoes([{valor:100,pago:true,descricao:'DESCRICAO PRIVADA',usuario_id:'IDENTIDADE PRIVADA'}]);
  const texto=await consultarConversa('chave-teste',resumo,[{role:'user',content:'Como organizar meu orçamento?'}],async (url,opts) => {
    assert.equal(opts.redirect,'error'); const body=JSON.parse(opts.body);
    assert.equal(body.max_completion_tokens,200); assert.ok(!opts.body.includes('PRIVADA'));
    assert.ok(body.messages[1].content.includes('"receitas":100'));
    return Response.json({choices:[{message:{content:' Resposta de teste. '}}]});
  });
  assert.equal(texto,'Resposta de teste.');
  for (const status of [429,500]) await assert.rejects(consultarConversa('x',{},[{role:'user',content:'oi'}],async()=>Response.json({erro:'privado'},{status})),(e)=>e.status===(status===429?429:503));
});
