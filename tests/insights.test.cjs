const { test } = require('node:test');
const assert = require('node:assert/strict');
const modulo = import('../supabase/functions/_shared/insights.mjs');

test('IA recebe apenas totais e contagens, sem textos, datas ou identificação', async () => {
  const { resumirTransacoes, consultarIA } = await modulo;
  const resumo = resumirTransacoes([
    { valor: '100.10', pago: true, descricao: 'SEGREDO', usuario_id: 'ID-PRIVADO', data: '2026-11-12' },
    { valor: '-30.05', pago: true, recebido_de: 'NOME-PRIVADO' },
    { valor: '-20.01', pago: false }, { valor: '10.20', pago: false },
  ]);
  assert.deepEqual(resumo, { quantidade: 4, receitas: 110.3, despesas: 50.06, recebido: 100.1, pago: 30.05 });
  let chamadas = 0;
  const texto = await consultarIA('CHAVE-TESTE', resumo, async (url, opcoes) => {
    chamadas++;
    assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
    const body = JSON.parse(opcoes.body);
    assert.equal(body.model, 'openai/gpt-oss-20b');
    assert.equal(body.max_completion_tokens, 1024);
    assert.equal(body.reasoning_effort, 'low');
    assert.equal(body.include_reasoning, false);
    assert.ok(!Object.hasOwn(body, 'reasoning_format'));
    assert.deepEqual(JSON.parse(body.messages[1].content), resumo);
    assert.ok(!/SEGREDO|PRIVADO|CHAVE-TESTE/.test(opcoes.body));
    assert.ok(opcoes.signal instanceof AbortSignal);
    return Response.json({ choices: [{ message: { content: '  Análise de teste.  ' } }] });
  });
  assert.equal(texto, 'Análise de teste.');
  assert.equal(chamadas, 1);
  assert.throws(() => resumirTransacoes([{ valor: Infinity }]));
});

test('IA bloqueia erros e cota esgotada sem repetir chamada ou trocar de provedor', async () => {
  const { consultarIA, FalhaIA } = await modulo;
  for (const [status, esperado] of [[429, 429], [401, 503], [500, 503], [200, 502]]) {
    let chamadas = 0;
    await assert.rejects(consultarIA('teste', {}, async () => {
      chamadas++;
      return Response.json({ error: 'DETALHE INTERNO' }, { status });
    }), (erro) => erro instanceof FalhaIA && erro.status === esperado && !erro.message.includes('DETALHE INTERNO'));
    assert.equal(chamadas, 1);
  }
  await assert.rejects(consultarIA('teste', {}, async () => { throw new DOMException('Timeout', 'TimeoutError'); }), /Timeout/);
});
