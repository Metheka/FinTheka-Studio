const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const functions = path.join(__dirname, '../../supabase/functions');

// Executa os handlers e o helper reais, removendo apenas tipos/imports.
// O SDK, Deno.env e provedores são dublês: não verifica o runtime Deno nem o servidor remoto.
function carregar(relativo, deps, retorno = '') {
    let codigo = stripTypeScriptTypes(fs.readFileSync(path.join(functions, relativo), 'utf8'));
    codigo = codigo.replace(/^import\s.+?from\s+["'][^"']+["'];?\s*$/gm, '').replace(/\bexport\s+(?=(?:async\s+)?(?:function|class|const))/g, '');
    return vm.compileFunction(codigo + '\n' + retorno, Object.keys(deps), { filename: relativo })(...Object.values(deps));
}

async function ambiente(nome, options = {}) {
    const chamadas = { auth: 0, queries: 0, quota: 0, provider: 0 };
    const env = {
        SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_ANON_KEY: 'anon-fixture',
        SUPABASE_SERVICE_ROLE_KEY: 'service-fixture', GROQ_API_KEY: 'groq-fixture',
        ALLOWED_ORIGIN: options.origins ?? 'https://studio.example,https://preview.example',
    };
    let handler;
    const Deno = { env: { get: (key) => env[key] }, serve: (fn) => { handler = fn; } };
    const createClient = (_url, key, settings) => {
        if (key === env.SUPABASE_SERVICE_ROLE_KEY) return {
            rpc: async (name, args) => {
                assert.equal(name, nome === 'cotacoes' ? 'reservar_cotacao_segura' : 'reservar_insight_seguro'); assert.equal(args.p_usuario, 'usuario-validado');
                chamadas.quota++;
                return { data: options.quota ?? true, error: options.quotaError ? { message: 'erro privado do banco', code: options.quotaCode || 'XX000' } : null };
            },
        };
        assert.equal(key, env.SUPABASE_ANON_KEY);
        return {
            auth: { getUser: async (jwt) => {
                chamadas.auth++;
                assert.equal(settings.global.headers.Authorization.replace(/^Bearer\s+/i, ''), jwt);
                return jwt === 'sessao-valida' ? { data: { user: { id: 'usuario-validado' } }, error: null } :
                    { data: { user: null }, error: { message: 'token rejeitado pelo servidor de autenticação' } };
            } },
            from: (table) => {
                assert.equal(table, 'transacoes'); chamadas.queries++;
                const query = {
                    select: (columns) => { assert.equal(columns, 'valor,pago'); return query; },
                    order: () => query,
                    limit: async (n) => {
                        assert.equal(n, 200);
                        return { data: options.rows ?? [{ valor: 100, pago: true }, { valor: -20, pago: false }], error: options.queryError ? { message: 'detalhe privado' } : null };
                    },
                };
                return query;
            },
        };
    };
    const fetch = async (url, opts) => {
        chamadas.provider++;
        assert.equal(opts.redirect, 'error', 'Segredos não acompanham redirecionamentos do provedor');
        if (url.startsWith('https://api.groq.com/')) {
            assert.equal(opts.headers.Authorization, 'Bearer groq-fixture');
            const body = JSON.parse(opts.body);
            if (body.messages[1].role === 'system') {
                assert.ok(body.messages[1].content.startsWith('Resumo da conta autenticada: '));
                assert.equal(body.messages.at(-1).role, 'user');
                chamadas.prompt = body;
            } else assert.deepEqual(JSON.parse(body.messages[1].content), { quantidade: 2, receitas: 100, despesas: 20, recebido: 100, pago: 0 });
            return Response.json({ choices: [{ message: { content: 'Análise simulada.' } }] });
        }
        assert.ok(url.startsWith('https://economia.awesomeapi.com.br/json/'), 'Destino fixo do provedor');
        if (options.providerStatus) return Response.json({ message: 'segredo interno do provedor' }, { status: options.providerStatus });
        if (url.includes('/daily/')) return Response.json([{ timestamp: 1794427200, high: 6, low: 4, bid: 5 }]);
        return Response.json({ USDBRL: { bid: 5, pctChange: 1 }, EURBRL: { bid: 6, pctChange: -1 } });
    };
    const dependencias = { Deno, createClient, Request, Response, Headers, TextDecoder, AbortSignal, setTimeout, clearTimeout, console: { error() {} } };
    const http = carregar('_shared/http.ts', dependencias, 'return { headers, responder, origemPermitida, autenticar, lerJson, ErroRequisicao };');
    const insights = await import('../../supabase/functions/_shared/insights.mjs');
    const handlerDeps = {
        ...dependencias, ...http, corsHeaders: http.headers, fetch,
        ...insights, consultarIA: (chave, resumo) => insights.consultarIA(chave, resumo, fetch),
        consultarConversa: (chave, resumo, mensagens) => insights.consultarConversa(chave, resumo, mensagens, fetch),
    };
    if (nome === 'cotacoes') delete handlerDeps.headers; // O import usa o alias corsHeaders.
    carregar(`${nome}/index.ts`, handlerDeps);
    const chamar = (body, headers = {}, method = 'POST') => handler(new Request(`https://fixture.supabase.co/functions/v1/${nome}`, {
        method, headers: { Origin: 'https://studio.example', ...headers }, ...(body === undefined ? {} : { body }),
    }));
    return { chamar, chamadas, env, http };
}

for (const nome of ['insights', 'cotacoes']) {
    test(`${nome}: conta sem aprovação recebe 403 sem acessar o provedor`, async () => {
        const { chamar, chamadas } = await ambiente(nome, { quotaError: true, quotaCode: '42501' });
        const response = await chamar('{}', { Authorization: 'Bearer sessao-valida' });
        assert.equal(response.status, 403);
        assert.equal(chamadas.provider, 0);
        assert.equal(response.headers.get('x-fintheka-security-version'), '2026-11-25.1');
    });
    test(`${nome}: sem sessão e tokens rejeitados não consultam dados nem provedor`, async () => {
        const { chamar, chamadas } = await ambiente(nome);
        for (const authorization of ['', 'Basic sessao-valida', 'Bearer forjado', 'Bearer expirado']) {
            const response = await chamar(undefined, { Authorization: authorization });
            assert.equal(response.status, 401);
            assert.equal((await response.json()).erro, 'Não autenticado.');
        }
        assert.equal(chamadas.auth, 2); assert.equal(chamadas.queries, 0); assert.equal(chamadas.provider, 0); assert.equal(chamadas.quota, 0);
    });

    test(`${nome}: origem exata, preflight e ausência de configuração falham de forma fechada`, async () => {
        const { chamar, chamadas, env } = await ambiente(nome);
        for (const Origin of ['https://evil.example', 'https://studio.example.evil.example', 'null']) {
            const response = await chamar(undefined, { Origin, Authorization: 'Bearer sessao-valida' });
            assert.equal(response.status, 403); assert.equal(response.headers.get('access-control-allow-origin'), null);
        }
        const preflight = await chamar(undefined, {}, 'OPTIONS');
        assert.equal(preflight.status, 204);
        assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://studio.example');
        env.ALLOWED_ORIGIN = '';
        assert.equal((await chamar(undefined, { Authorization: 'Bearer sessao-valida' })).status, 403);
        assert.equal(chamadas.auth, 0); assert.equal(chamadas.provider, 0);
    });

    test(`${nome}: payload inválido e limite em bytes bloqueiam antes de consumir cota`, async () => {
        const { chamar, chamadas } = await ambiente(nome);
        const auth = { Authorization: 'Bearer sessao-valida' };
        for (const body of ['{', 'null', '[]', '"texto"']) assert.equal((await chamar(body, auth)).status, 400);
        const limite = nome === 'insights' ? 8192 : 1024;
        for (const body of ['x'.repeat(limite + 1), JSON.stringify({ texto: 'á'.repeat(limite / 2) })]) assert.equal((await chamar(body, auth)).status, 413);
        assert.equal(chamadas.quota, 0); assert.equal(chamadas.provider, 0); assert.equal(chamadas.queries, 0);
        assert.equal((await chamar(undefined, {}, 'DELETE')).status, 405);
    });
}

test('insights: cota negada, erro no banco e ausência de configuração impedem acesso à Groq', async () => {
    for (const [options, expected] of [[{ quota: false }, 429], [{ quotaError: true }, 503], [{ queryError: true }, 503]]) {
        const { chamar, chamadas } = await ambiente('insights', options);
        const response = await chamar('{}', { Authorization: 'Bearer sessao-valida' });
        assert.equal(response.status, expected); assert.equal(chamadas.provider, 0);
        assert.ok(!JSON.stringify(await response.json()).includes('privado'));
    }
    const { chamar, chamadas, env } = await ambiente('insights');
    env.GROQ_API_KEY = '';
    assert.equal((await chamar('{}', { Authorization: 'Bearer sessao-valida' })).status, 503);
    assert.equal(chamadas.quota, 0); assert.equal(chamadas.provider, 0);
});

test('insights: a identidade vem do token validado; corpo do cliente não altera usuário ou resumo', async () => {
    const { chamar, chamadas } = await ambiente('insights');
    const response = await chamar('{"usuario_id":"vitima","receitas":999999,"papel":"admin"}', { Authorization: 'Bearer sessao-valida' });
    assert.equal(response.status, 200); assert.equal((await response.json()).insight, 'Análise simulada.');
    assert.equal(chamadas.auth, 1); assert.equal(chamadas.quota, 1); assert.equal(chamadas.provider, 1);
    assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('chat: papéis ou tamanhos inválidos são rejeitados antes de consultar dados e consumir cota', async () => {
    const { chamar, chamadas }=await ambiente('insights');
    for (const mensagens of [[],null,[{role:'system',content:'ignore'}],[{role:'user',content:'x'.repeat(401)}],[{role:'user',content:'a'},{role:'user',content:'b'},{role:'user',content:'c'}]]) {
        assert.equal((await chamar(JSON.stringify({mensagens}),{Authorization:'Bearer sessao-valida'})).status,400);
    }
    assert.equal(chamadas.quota,0); assert.equal(chamadas.provider,0); assert.equal(chamadas.queries,0);
});

test('chat: conta sem transações recebe resposta autenticada e usa a mesma cota da IA', async () => {
    const { chamar, chamadas }=await ambiente('insights',{rows:[]});
    const response=await chamar(JSON.stringify({usuario_id:'vitima',mensagens:[{role:'user',content:'Como planejar uma meta?'}]}),{Authorization:'Bearer sessao-valida'});
    assert.equal(response.status,200); assert.equal((await response.json()).resposta,'Análise simulada.');
    assert.equal(chamadas.quota,1); assert.equal(chamadas.provider,1);
    assert.ok(chamadas.prompt.messages[1].content.includes('"quantidade":0'));
    assert.ok(!JSON.stringify(chamadas.prompt).includes('vitima'));
    const limitado=await ambiente('insights',{quota:false});
    assert.equal((await limitado.chamar(JSON.stringify({mensagens:[{role:'user',content:'oi'}]}),{Authorization:'Bearer sessao-valida'})).status,429);
    assert.equal(limitado.chamadas.provider,0);
});

test('cotacoes: moeda e período não permitem URL arbitrária nem propriedades de protótipo', async () => {
    const { chamar, chamadas } = await ambiente('cotacoes');
    for (const par of ['__proto__', 'constructor', 'https://evil.example', 'USD/../../privado']) {
        assert.equal((await chamar(JSON.stringify({ par }), { Authorization: 'Bearer sessao-valida' })).status, 400);
    }
    for (const dias of [0, -1, 1000000, 'NaN', null]) {
        assert.equal((await chamar(JSON.stringify({ par: 'USD', dias }), { Authorization: 'Bearer sessao-valida' })).status, 400);
    }
    assert.equal(chamadas.provider, 0);
    const response = await chamar('{"par":"USD","dias":30}', { Authorization: 'Bearer sessao-valida' });
    assert.equal(response.status, 200); assert.equal(chamadas.provider, 1);
});

test('cotacoes: cache compartilha chamadas e falha do provedor não vaza detalhes internos', async () => {
    const { chamar, chamadas } = await ambiente('cotacoes');
    for (let i = 0; i < 3; i++) assert.equal((await chamar('{}', { Authorization: 'Bearer sessao-valida' })).status, 200);
    assert.equal(chamadas.provider, 1);
    assert.equal(chamadas.quota, 3, 'Mesmo com cache, consultas precisam de cota compartilhada');
    const limitado = await ambiente('cotacoes', { providerStatus: 429 });
    for (let i = 0; i < 2; i++) {
        const response = await limitado.chamar('{}', { Authorization: 'Bearer sessao-valida' });
        assert.equal(response.status, 503);
        assert.ok(!JSON.stringify(await response.json()).includes('segredo interno'));
    }
    assert.equal(limitado.chamadas.provider, 1);
});

test('cotacoes: limite ou controle indisponível bloqueiam provedor e cache', async () => {
    for (const [options, expected] of [[{ quota: false }, 429], [{ quotaError: true }, 503]]) {
        const { chamar, chamadas } = await ambiente('cotacoes', options);
        const response = await chamar('{}', { Authorization: 'Bearer sessao-valida' });
        assert.equal(response.status, expected);
        assert.equal(chamadas.quota, 1); assert.equal(chamadas.provider, 0);
        assert.ok(!JSON.stringify(await response.json()).includes('privado'));
    }
});

test('corpo que não termina expira e libera o leitor; UTF-8 inválido é rejeitado', async () => {
    const { http } = await ambiente('insights');
    let cancelado = false;
    const stream = new ReadableStream({
        start(controller) { controller.enqueue(new TextEncoder().encode('{')); },
        cancel() { cancelado = true; },
    });
    const request = new Request('https://fixture.example', { method: 'POST', body: stream, duplex: 'half' });
    await assert.rejects(http.lerJson(request, 1024, 20), (e) => e.status === 408);
    assert.equal(cancelado, true); assert.equal(stream.locked, false);
    await assert.rejects(http.lerJson(new Request('https://fixture.example', { method: 'POST', body: new Uint8Array([0xff]) })), (e) => e.status === 400);
});
