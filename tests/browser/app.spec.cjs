const { test, expect } = require('@playwright/test');
const server = require('../../scripts/serve.cjs');
let appUrl;
test.beforeAll(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  appUrl = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); });
const user = { id: '11111111-1111-4111-8111-111111111111', email: 'teste@example.com', aud: 'authenticated', role: 'authenticated', user_metadata: { nome: 'Teste' } };
const encode = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, role: 'authenticated', aud: 'authenticated', exp: now + 3600, iat: now })}.fake-signature`;
const session = { access_token: token, refresh_token: 'fake-refresh', expires_in: 3600, expires_at: now + 3600, token_type: 'bearer', user };
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const transaction = (id, valor, pago = false) => ({ id, usuario_id: user.id, data: today, descricao: `Item ${id}`, recebido_de: 'Ana', categoria: 'Outros', valor, tipo_pagamento: 'Única', pago });

async function setup(page, { logged = true, rows = [transaction(1, 100, true), transaction(2, -30, true)], profileError = false, view = 'transacoes', cofres = [], cofreError = false } = {}) {
  const errors = [];
  const calls = { inserts: 0, updates: 0, deletes: 0, quotes: 0 };
  const movimentos = [], pedidosCofre = new Map();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ body: '', contentType: 'text/css' }));
  await page.route('https://htueuvvndtlusfyaqlqa.supabase.co/**', async (route) => {
    const req = route.request(), url = new URL(req.url()), method = req.method();
    const reply = (body, status = 200) => route.fulfill({ status, json: body, headers: { 'access-control-allow-origin': '*' } });
    if (method === 'OPTIONS') return reply({});
    if (url.pathname.endsWith('/auth/v1/token')) return reply(session);
    if (url.pathname.endsWith('/auth/v1/user')) return reply(user);
    if (url.pathname.endsWith('/auth/v1/logout')) return reply({});
    if (url.pathname.endsWith('/rest/v1/perfis')) return profileError ? reply({ message: 'perfil indisponível' }, 400) : reply({ nome: 'Teste', email: user.email, papel: 'cliente' });
    if (url.pathname.endsWith('/rest/v1/cofrinhos')) {
      if (cofreError) return reply({ code: 'PGRST205', message: 'tabela ausente' },404);
      const id = Number((url.searchParams.get('id') || '').replace('eq.',''));
      if (method === 'GET') return reply(cofres.slice(Number(url.searchParams.get('offset') || 0), Number(url.searchParams.get('offset') || 0) + Number(url.searchParams.get('limit') || 500)));
      if (method === 'POST') { const c = { saldo: 0, ...req.postDataJSON(), id: Math.max(0,...cofres.map((c) => c.id)) + 1 }; cofres.push(c); return reply({ id: c.id },201); }
      if (method === 'PATCH') { Object.assign(cofres.find((c) => c.id===id),req.postDataJSON()); return reply({ id }); }
      if (method === 'DELETE') { const i=cofres.findIndex((c) => c.id===id); cofres.splice(i,1); return reply({ id }); }
    }
    if (url.pathname.endsWith('/rest/v1/movimentos_cofrinho')) {
      const id = Number((url.searchParams.get('cofrinho_id') || '').replace('eq.',''));
      return reply(movimentos.filter((m) => m.cofrinho_id === id).slice(-10).reverse());
    }
    if (url.pathname.endsWith('/rest/v1/rpc/movimentar_cofrinho')) {
      const body = req.postDataJSON(), c = cofres.find((c) => c.id === Number(body.p_cofrinho));
      if (!c) return reply({ message: 'Porquinho não encontrado.' },400);
      if (!pedidosCofre.has(body.p_requisicao)) {
        const saldo = Number(c.saldo) + (body.p_tipo === 'guardar' ? body.p_valor : -body.p_valor);
        if (saldo < 0) return reply({ message: 'Saldo insuficiente.' },400);
        c.saldo = saldo; pedidosCofre.set(body.p_requisicao,true);
        movimentos.push({ cofrinho_id: c.id, tipo: body.p_tipo, valor: body.p_valor, criado_em: new Date().toISOString() });
      }
      return reply(c);
    }
    if (url.pathname.endsWith('/rest/v1/transacoes')) {
      const id = Number((url.searchParams.get('id') || '').replace('eq.', ''));
      if (method === 'GET') {
        const offset = Number(url.searchParams.get('offset') || 0), limit = Number(url.searchParams.get('limit') || 500);
        return reply(rows.slice(offset, offset + limit));
      }
      if (method === 'POST') {
        calls.inserts++;
        const body = req.postDataJSON();
        const added = (Array.isArray(body) ? body : [body]).map((t, i) => ({ ...t, id: rows.length + i + 1, pago: t.pago ?? false, usuario_id: user.id }));
        rows.push(...added);
        return reply(req.headers().accept?.includes('object') ? added[0] : added, 201);
      }
      if (method === 'PATCH') {
        calls.updates++;
        const row = rows.find((t) => t.id === id);
        Object.assign(row, req.postDataJSON());
        await new Promise((resolve) => setTimeout(resolve, 100));
        return reply(row);
      }
      if (method === 'DELETE') {
        calls.deletes++;
        rows = rows.filter((t) => t.id !== id);
        return reply({ id });
      }
    }
    if (url.pathname.endsWith('/functions/v1/cotacoes')) {
      calls.quotes++;
      if (req.postDataJSON()?.par) return reply({ historico: Array.from({ length: 30 }, (_, i) => ({ time: `2026-10-${String(i + 1).padStart(2, '0')}`, open: 5, high: 6, low: 4, close: 5 + i / 100 })) });
      return reply({ usd: 5, eur: 6, moedas: [{ codigo: 'USD', nome: 'Dólar', valor: 5, variacao: 1 }] });
    }
    if (url.pathname.endsWith('/functions/v1/insights')) return reply({ code: 'NOT_FOUND' }, 404);
    return reply({ message: `Unhandled: ${method} ${url.pathname}` }, 404);
  });
  if (logged) await page.addInitScript((s) => localStorage.setItem('sb-htueuvvndtlusfyaqlqa-auth-token', JSON.stringify(s)), session);
  await page.goto(`${appUrl}/#${view}`);
  if (logged && !profileError) await expect(page.locator('#perfil-nome')).toHaveText('Teste');
  return { errors, calls };
}

test('segurança: histórico acima do teto interrompe carga e não mostra totais parciais', async ({ page }) => {
  await setup(page, { rows: Array.from({ length: 10001 }, (_, i) => transaction(i + 1, 1, true)) });
  await expect(page.locator('#tabela-corpo')).toContainText('limite de 10.000');
  await expect(page.locator('#overview-saldo')).toHaveText('--');
  expect(await page.evaluate(() => transacoesCache.length)).toBe(0);
});

test('segurança: metas acima do teto não são renderizadas nem somadas parcialmente', async ({ page }) => {
  await setup(page, { view: 'porquinho', cofres: Array.from({ length: 101 }, (_, i) => ({ id: i + 1, nome: 'Meta', meta: 100, saldo: 10, cor: 'rosa' })) });
  await expect(page.locator('#cofrinhos-status')).toContainText('limite de 100');
  await expect(page.locator('#cofrinhos-total')).toHaveText('--');
  await expect(page.locator('#cofrinho-novo')).toBeDisabled();
  await expect(page.locator('.piggy-card')).toHaveCount(0);
});

test('segurança: limite do banco na importação explica a recusa e permite nova tentativa', async ({ page }) => {
  await setup(page, { view: 'importacoes' });
  await page.route('**/rest/v1/transacoes**', (route) => route.request().method() === 'POST'
    ? route.fulfill({ status: 400, json: { code: '54000', message: 'Detalhe privado' } }) : route.fallback());
  await page.locator('#input-csv').setInputFiles({ name: 'teste.csv', mimeType: 'text/csv', buffer: Buffer.from(`${today};Teste;Contato;Outros;1,00;Pix`) });
  await page.locator('#btn-importar-csv').click();
  await expect(page.locator('#importacao-resultado')).toContainText('Limite de armazenamento ou de gravações');
  await expect(page.locator('#importacao-resultado')).not.toContainText('Detalhe privado');
  await expect(page.locator('#btn-importar-csv')).toBeEnabled();
});

test('segurança: conta sem aprovação recebe orientação na IA sem inventar resposta', async ({ page }) => {
  await setup(page, { view: 'ia' });
  await page.route('**/functions/v1/insights', (route) => route.fulfill({ status: 403, json: { erro: 'Sua conta ainda precisa de autorização para usar a IA.' } }));
  await page.locator('#ia-pergunta').fill('Como organizar meu orçamento?');
  await page.locator('#ia-enviar').click();
  await expect(page.locator('#ia-status')).toContainText('precisa de autorização');
  await expect(page.locator('#ia-enviar')).toBeEnabled();
  await expect(page.locator('.chat-message--user')).toHaveCount(0);
});

async function trocarConta(page, suffix = '22222222-2222-4222-8222-222222222222', nome = 'Outra pessoa') {
  const nextUser = { ...user, id: suffix, email: 'outra@example.com' };
  const nextToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: nextUser.id, role: 'authenticated', aud: 'authenticated', exp: now + 3600, iat: now })}.fake-signature`;
  await page.route('**/auth/v1/user', (route) => route.fulfill({ json: nextUser }));
  await page.route('**/rest/v1/perfis**', (route) => route.fulfill({ json: { nome, email: nextUser.email, papel: 'cliente' } }));
  await page.route('**/rest/v1/transacoes**', (route) => route.request().method() === 'GET' ? route.fulfill({ json: [] }) : route.fallback());
  await page.route('**/rest/v1/cofrinhos**', (route) => route.request().method() === 'GET' ? route.fulfill({ json: [] }) : route.fallback());
  await page.route('**/rest/v1/movimentos_cofrinho**', (route) => route.fulfill({ json: [] }));
  await page.evaluate((access_token) => sb.auth.setSession({ access_token, refresh_token: 'proxima-sessao' }), nextToken);
  await expect(page.locator('#perfil-nome')).toHaveText(nome);
}

test('inicio mostra graficos reais, saldo, mercado por teclado e atalho superior de IA', async ({ page }) => {
  const { errors, calls } = await setup(page, { view: 'inicio' });
  await expect(page.locator('#overview-receitas-chart svg rect')).toHaveCount(new Date(Number(today.slice(0,4)),Number(today.slice(5,7)),0).getDate());
  await expect(page.locator('#overview-despesas-chart svg')).toBeVisible();
  await expect(page.locator('#overview-saldo-evolucao')).toContainText('Saldo subiu');
  await expect(page.locator('#overview-saldo-evolucao')).toContainText('70,00');
  await expect(page.locator('#home-fluxo-mensal .flow-readout')).toContainText('100,00');
  await expect(page.locator('#home-market-chart svg')).toBeVisible();
  await page.locator('#home-market-chart svg').focus();
  await page.keyboard.press('Home');
  await expect(page.locator('#home-market-chart svg')).toHaveAttribute('aria-valuenow','0');
  await expect(page.locator('#home-market-chart .chart-tooltip')).toContainText('5,0000');
  expect(calls.quotes).toBe(2);
  await page.evaluate(() => navegarStudio('mercado'));
  await expect(page.locator('#mercado-grafico canvas').first()).toBeVisible();
  expect(calls.quotes).toBe(2);
  await page.locator('#atalho-ia-topo').click();
  await expect(page.locator('#ia-pergunta')).toBeFocused();
  expect(errors).toEqual([]);
});

test('previa do mercado limpa valores na falha e ignora resposta de outra conta', async ({ page }) => {
  const { errors } = await setup(page, { view:'inicio' });
  await expect(page.locator('#home-market-chart svg')).toBeVisible();
  await page.route('**/functions/v1/cotacoes', route => route.fulfill({ status:503,json:{error:'indisponivel'} }));
  await page.evaluate(() => cacheCotacoes.clear());
  await page.locator('#home-market-atualizar').click();
  await expect(page.locator('#home-market-chart')).toContainText('Use Atualizar');
  await expect(page.locator('#home-market-chart svg')).toHaveCount(0);
  await expect(page.locator('#home-market-valor')).toHaveText('--');
  await expect(page.locator('#home-market-periodo')).toBeEmpty();
  let liberar;
  await page.route('**/functions/v1/cotacoes', async route => {
    if (!route.request().postDataJSON()?.par) return route.fulfill({json:{usd:5,eur:6,moedas:[]}});
    if (liberar) return route.fulfill({json:{historico:[]}});
    await new Promise(resolve => { liberar=resolve; });
    await route.fulfill({json:{historico:[{time:'2026-10-01',close:999},{time:'2026-10-02',close:1000}]}});
  });
  await page.evaluate(() => cacheCotacoes.clear());
  await page.locator('#home-market-atualizar').click();
  await expect.poll(() => Boolean(liberar)).toBe(true);
  await page.evaluate(() => navegarStudio('transacoes'));
  await trocarConta(page);
  liberar();
  await expect(page.locator('#home-market-chart')).toContainText('Histórico insuficiente');
  await expect(page.locator('#home-market-valor')).toHaveText('--');
  await expect(page.locator('#home-market-chart svg')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('temas do simulador seguem o restante do site com cartoes brancos no claro', async ({ page }) => {
  const { errors } = await setup(page, { view: 'inicio' });
  for (const tema of ['claro','escuro']) {
    await page.evaluate((t) => aplicarTema(t),tema);
    const cor = await page.locator('body').evaluate((el) => getComputedStyle(el).getPropertyValue('--color-bg').trim());
    await page.evaluate(() => navegarStudio('investimentos'));
    expect(await page.locator('body').evaluate((el) => getComputedStyle(el).getPropertyValue('--color-bg').trim())).toBe(cor);
    if (tema === 'claro') await expect(page.locator('.sim-kpi--hero')).toHaveCSS('background-color','rgb(255, 255, 255)');
    await page.evaluate(() => navegarStudio('inicio'));
    if (tema === 'claro') await expect(page.locator('.portfolio-card')).toHaveCSS('background-color','rgb(255, 255, 255)');
  }
  expect(errors).toEqual([]);
});

test('login real do SDK, totais de receitas/despesas e filtro de busca', async ({ page }) => {
  const { errors } = await setup(page, { logged: false });
  await page.locator('#auth-email').fill(user.email);
  await page.locator('#auth-senha').fill('senha-teste-123');
  await page.locator('#auth-enviar').click();
  await expect(page.locator('#saldo-atual')).toContainText('70,00');
  await expect(page.locator('#total-recebido')).toContainText('100,00');
  await expect(page.locator('#despesas-pagas')).toContainText('30,00');
  await page.locator('#filtro-tipo').selectOption('despesas');
  await expect(page.locator('#tabela-corpo tr')).toHaveCount(1);
  await page.locator('#busca-topo').fill('inexistente');
  await expect(page.locator('#tabela-corpo')).toContainText('Nenhuma transação');
  expect(errors).toEqual([]);
});
test('formulário salva despesa, bloqueia clique repetido e atualiza pagamento/exclusão', async ({ page }) => {
  const { calls, errors } = await setup(page, { rows: [] });
  await page.locator('#btn-nova-transacao').click();
  await page.locator('[name=descricao]').fill('Compra <img src=x onerror=alert(1)>');
  await page.locator('[name=tipo]').selectOption('despesa');
  await page.locator('[name=valor]').fill('50,25');
  await page.locator('#transacao-form button[type=submit]').click();
  await expect(page.locator('#transacao-dialog')).not.toBeVisible();
  await expect(page.locator('#tabela-corpo')).toContainText('-R$');
  expect(await page.locator('#tabela-corpo img').count()).toBe(0);
  await page.locator('.toggle').evaluate((el) => { el.click(); el.click(); });
  await expect(page.locator('.toggle')).toHaveAttribute('aria-checked', 'true');
  expect(calls.updates).toBe(1);
  await expect(page.locator('#saldo-atual')).toContainText('50,25');
  page.once('dialog', (d) => d.accept());
  await page.locator('.table__btn-excluir').click();
  await expect(page.locator('#tabela-corpo')).toContainText('Nenhuma transação');
  expect(calls.inserts).toBe(1); expect(calls.deletes).toBe(1); expect(errors).toEqual([]);
});
test('lançamento escolhe categoria de alimentação, forma de pagamento e já paga a despesa', async ({ page }) => {
  const { errors } = await setup(page, { rows: [] });
  let enviado;
  page.on('request', (req) => { if (req.url().includes('/rest/v1/transacoes') && req.method() === 'POST') enviado = req.postDataJSON(); });
  await page.locator('#btn-nova-transacao').click();
  await page.locator('[name=tipo]').selectOption('despesa');
  await expect(page.locator('#transacao-status-label')).toHaveText('Já foi pago');
  await page.locator('[name=descricao]').fill('Almoço');
  await page.locator('[name=valor]').fill('28,90');
  await page.locator('#categoria-busca').fill('restaur');
  await page.getByRole('button', { name: 'Restaurantes', exact: true }).click();
  await page.locator('[name=tipoPagamento]').selectOption('Cartão de débito');
  await page.locator('[name=pago]').check();
  await page.locator('#transacao-form button[type=submit]').click();
  await expect(page.locator('#transacao-dialog')).not.toBeVisible();
  await expect(page.locator('#saldo-atual')).toContainText('28,90');
  expect(enviado).toMatchObject({ valor: -28.9, categoria: 'Restaurantes', tipo_pagamento: 'Cartão de débito', pago: true, usuario_id: user.id });
  await expect(page.locator('#tabela-corpo .toggle')).toHaveAttribute('aria-checked', 'true');
  expect(errors).toEqual([]);
});

test('categoria própria salva com lançamento reaparece após recarregar e pode filtrar o histórico', async ({ page }) => {
  const { calls, errors } = await setup(page, { rows: [] });
  await page.locator('#btn-nova-transacao').click();
  await page.locator('[name=tipo]').selectOption('despesa');
  await page.locator('[name=descricao]').fill('Almoço de segunda');
  await page.locator('[name=valor]').fill('20');
  await page.locator('#categoria-criar').click();
  await page.locator('#categoria-nova-nome').fill('Marmitas da semana');
  await page.keyboard.press('Enter');
  await expect(page.locator('#categoria-selecionada')).toHaveText('Marmitas da semana');
  expect(calls.inserts).toBe(0);
  await page.locator('#transacao-form button[type=submit]').click();
  await expect(page.locator('#transacao-dialog')).not.toBeVisible();
  await page.reload();
  await expect(page.locator('#tabela-corpo')).toContainText('Marmitas da semana');
  await page.locator('#filtro-categoria').selectOption('Marmitas da semana');
  await expect(page.locator('#tabela-total')).toContainText('20,00');
  await page.locator('#btn-nova-transacao').click();
  await page.locator('[name=tipo]').selectOption('despesa');
  await expect(page.getByRole('button', { name: 'Marmitas da semana', exact: true })).toBeVisible();
  const armazenamento = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(armazenamento).not.toContain('Marmitas da semana');
  expect(errors).toEqual([]);
});

test('categoria maliciosa vira texto; nomes equivalentes não criam sugestões duplicadas', async ({ page }) => {
  const { errors } = await setup(page, { rows: [] });
  await page.locator('#btn-nova-transacao').click();
  await page.locator('#categoria-criar').click();
  await page.locator('#categoria-nova-nome').fill(' salario ');
  await page.locator('#categoria-confirmar').click();
  await expect(page.locator('#categoria-selecionada')).toHaveText('Salário');
  await expect(page.getByRole('button', { name: 'Salário', exact: true })).toHaveCount(1);
  await page.locator('#categoria-criar').click();
  await page.locator('#categoria-nova-nome').fill('<img src=x onerror=alert(1)>');
  await page.locator('#categoria-confirmar').click();
  await expect(page.locator('#categoria-selecionada')).toHaveText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#categorias-opcoes img')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('troca de conta limpa categorias próprias, rascunho, busca e filtro', async ({ page }) => {
  await setup(page, { rows: [{ ...transaction(1, -20), categoria: 'Categoria privada A' }] });
  await page.locator('#filtro-categoria').selectOption('Categoria privada A');
  await page.locator('#btn-nova-transacao').click();
  await page.locator('[name=tipo]').selectOption('despesa');
  await page.locator('#categoria-criar').click();
  await page.locator('#categoria-nova-nome').fill('Rascunho privado');
  await page.locator('#categoria-confirmar').click();
  await trocarConta(page);
  await expect(page.locator('#filtro-categoria')).toHaveValue('');
  await expect(page.locator('#filtro-categoria option')).toHaveCount(1);
  await page.locator('#btn-nova-transacao').click();
  await page.locator('[name=tipo]').selectOption('despesa');
  await expect(page.locator('#categorias-opcoes')).not.toContainText('privad');
  await expect(page.locator('#categoria-selecionada')).toHaveText('Outros');
  await expect(page.locator('#categoria-nova-nome')).toHaveValue('');
});

test('filtro por categoria altera somente resultados do histórico e preserva saldo geral', async ({ page }) => {
  await setup(page, { rows: [{ ...transaction(1, 100, true), categoria: 'Salário' }, { ...transaction(2, -20, true), categoria: 'Supermercado' }] });
  await page.locator('#filtro-categoria').selectOption('Supermercado');
  await expect(page.locator('#tabela-corpo tr')).toHaveCount(1);
  await expect(page.locator('#tabela-total')).toContainText('20,00');
  await expect(page.locator('#saldo-atual')).toContainText('80,00');
  await page.locator('#filtro-categoria').selectOption('');
  await expect(page.locator('#tabela-corpo tr')).toHaveCount(2);
});

test('atalhos coloridos de pagamento sincronizam seleção, ícone e valor enviado', async ({ page }) => {
  await setup(page, { rows: [] });
  let enviado;
  page.on('request', (req) => { if (req.url().includes('/rest/v1/transacoes') && req.method() === 'POST') enviado = req.postDataJSON(); });
  await page.locator('#btn-nova-transacao').click();
  await expect(page.locator('[data-payment="Pix"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#pagamento-icone path')).toHaveAttribute('fill', '#21b89a');
  await page.locator('[data-payment="Cartão de crédito"]').click();
  await expect(page.locator('[name=tipoPagamento]')).toHaveValue('Cartão de crédito');
  await expect(page.locator('#pagamento-icone circle')).toHaveCount(2);
  await page.locator('[name=tipoPagamento]').selectOption('Boleto');
  await expect(page.locator('[data-payment="Cartão de crédito"]')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('[data-payment="Pix"]').click();
  await page.locator('[name=descricao]').fill('Recebimento por Pix');
  await page.locator('[name=valor]').fill('35');
  await page.locator('#transacao-form button[type=submit]').click();
  await expect(page.locator('#transacao-dialog')).not.toBeVisible();
  expect(enviado.tipo_pagamento).toBe('Pix');
  await expect(page.locator('#tabela-corpo .payment-icon')).toBeVisible();
});

test('layout alterna tabela no computador e cartões com navegação inferior no celular', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setup(page);
  await expect(page.locator('.mobile-nav')).not.toBeVisible();
  expect(await page.locator('#tabela-corpo tr').first().evaluate((e) => getComputedStyle(e).display)).toBe('table-row');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.mobile-nav')).toBeVisible();
  expect(await page.locator('#tabela-corpo tr').first().evaluate((e) => getComputedStyle(e).display)).toBe('grid');
  await page.locator('.mobile-nav [data-open-view=porquinho]').click();
  await expect(page.locator('#view-porquinho')).toBeVisible();
  await expect(page.locator('.mobile-nav [data-open-view=porquinho]')).toHaveAttribute('aria-current', 'page');
  await page.locator('.mobile-nav [data-open-view=transacoes]').click();
  await expect(page.locator('#view-transacoes')).toBeVisible();
  await page.locator('#btn-nova-transacao').click();
  const box = await page.locator('#transacao-dialog').boundingBox();
  expect(box.width).toBeGreaterThan(385);
  await expect.poll(async () => { const b = await page.locator('#transacao-dialog').boundingBox(); return Math.abs(b.y + b.height - 844); }).toBeLessThanOrEqual(1);
});

test('paleta marrom mantém registros longos dentro da tela do telefone nos dois temas', async ({ page }) => {
  const { errors } = await setup(page, { rows: [{ ...transaction(1, -9999999.99), categoria: 'Categoria particular com nome muito extenso para testar quebra', descricao: 'Descrição longa '.repeat(10), tipo_pagamento: '<img src=x onerror=alert(1)>' }] });
  await page.setViewportSize({ width: 320, height: 844 });
  for (const tema of ['escuro', 'claro']) {
    await page.evaluate((t) => aplicarTema(t), tema);
    const cor = await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--color-bg').trim());
    expect(cor).toBe(tema === 'escuro' ? '#1c1714' : '#f0f2f4');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('#tabela-corpo img')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('Porquinho cria meta, registra economia/retirada, edita e exclui sem alterar transações', async ({ page }) => {
  const { errors }=await setup(page,{view:'porquinho'});
  await expect(page.locator('#cofrinho-novo')).toBeEnabled();
  await page.locator('#cofrinho-novo').click();
  await page.locator('#cofrinho-form [name=nome]').fill('Viagem de férias');
  await page.locator('#cofrinho-form [name=meta]').fill('1.000,00');
  await page.locator('#cofrinho-form button[type=submit]').click();
  await expect(page.locator('.piggy-card h3')).toHaveText('Viagem de férias');
  await page.locator('[data-piggy-action=guardar]').click();
  await page.locator('#cofrinho-movimento-form [name=mov_valor]').fill('300');
  await page.locator('#cofrinho-movimento-form button[type=submit]').click();
  await expect(page.locator('#cofrinhos-total')).toContainText('300,00');
  await page.reload();
  await expect(page.locator('.piggy-card progress')).toHaveAttribute('value','30');
  await page.locator('[data-piggy-action=retirar]').click();
  await expect(page.locator('#cofrinho-historico')).toContainText('Guardado');
  await page.locator('#cofrinho-movimento-form [name=mov_valor]').fill('301');
  await page.locator('#cofrinho-movimento-form button[type=submit]').click();
  await expect(page.locator('#cofrinho-movimento-erro')).toContainText('supera o saldo');
  await page.locator('#cofrinho-movimento-form [name=mov_valor]').fill('100');
  await page.locator('#cofrinho-movimento-form button[type=submit]').click();
  await expect(page.locator('#cofrinhos-total')).toContainText('200,00');
  await page.locator('[data-piggy-action=editar]').click();
  await page.locator('#cofrinho-form [name=meta]').fill('150');
  await page.locator('#cofrinho-form button[type=submit]').click();
  await expect(page.locator('.piggy-card')).toContainText('Meta alcançada');
  await page.locator('[data-piggy-action=excluir]').click();
  await expect(page.locator('#app-toast')).toContainText('retirada do saldo');
  await page.locator('[data-piggy-action=retirar]').click();
  await page.locator('#cofrinho-movimento-form [name=mov_valor]').fill('200');
  await page.locator('#cofrinho-movimento-form button[type=submit]').click();
  await expect(page.locator('#cofrinhos-total')).toContainText('0,00');
  page.once('dialog',(d)=>d.accept());
  await page.locator('[data-piggy-action=excluir]').click();
  await expect(page.locator('.piggy-card')).toHaveCount(0);
  await page.evaluate(()=>navegarStudio('transacoes'));
  await expect(page.locator('#saldo-atual')).toContainText('70,00');
  expect(errors).toEqual([]);
});

test('Porquinho indisponível explica ativação sem inventar dados salvos', async ({ page }) => {
  await setup(page,{view:'porquinho',cofreError:true});
  await expect(page.locator('#cofrinhos-status')).toContainText('ativado');
  await expect(page.locator('#cofrinho-novo')).toBeDisabled();
  await expect(page.locator('#cofrinhos-total')).toHaveText('--');
});

test('reenvio de valor do Porquinho após perda de resposta mantém chave idempotente', async ({ page }) => {
  const cofres=[{id:1,nome:'Reserva',meta:1000,saldo:0,prazo:null,cor:'verde'}];
  await setup(page,{view:'porquinho',cofres});
  const pedidos=[];
  await page.route('**/rest/v1/rpc/movimentar_cofrinho',async(route)=>{
    const p=route.request().postDataJSON(); pedidos.push(p);
    if(pedidos.length===1) { cofres[0].saldo=100; return route.abort('failed'); }
    return route.fulfill({json:cofres[0]});
  });
  await expect(page.locator('.piggy-card')).toBeVisible();
  await page.locator('[data-piggy-action=guardar]').click();
  await page.locator('#cofrinho-movimento-form [name=mov_valor]').fill('100');
  await page.locator('#cofrinho-movimento-form button[type=submit]').click();
  await expect(page.locator('#cofrinho-movimento-erro')).toContainText('Não foi possível confirmar');
  await page.locator('#cofrinho-movimento-form button[type=submit]').click();
  await expect(page.locator('#cofrinhos-total')).toContainText('100,00');
  expect(new Set(pedidos.map((p)=>p.p_requisicao)).size).toBe(1);
});

test('aba IA conversa com contexto limitado, não renderiza HTML e permite nova conversa', async ({ page }) => {
  const { errors }=await setup(page,{view:'ia'});
  const pedidos=[];
  await page.route('**/functions/v1/insights',async(route)=>{pedidos.push(route.request().postDataJSON()); await route.fulfill({json:{resposta:'Resposta de teste <img src=x onerror=alert(1)>'}});});
  await page.locator('[data-ia-pergunta]').first().click();
  await page.locator('#ia-enviar').click();
  await expect(page.locator('.chat-message--user')).toHaveCount(1);
  await expect(page.locator('.chat-message--assistant')).toContainText('Resposta de teste');
  await expect(page.locator('#ia-mensagens img')).toHaveCount(0);
  await page.locator('#ia-pergunta').fill('Como dividir minha meta?');
  await page.locator('#ia-pergunta').press('Enter');
  await expect(page.locator('.chat-message--user')).toHaveCount(2);
  expect(pedidos[1].mensagens.map((m)=>m.role)).toEqual(['user','assistant','user']);
  expect(await page.evaluate(()=>JSON.stringify({...localStorage}))).not.toContain('Como dividir minha meta');
  await page.locator('#ia-limpar').click();
  await expect(page.locator('.chat-message--user')).toHaveCount(0);
  await expect(page.locator('#ia-pergunta')).toHaveValue('');
  expect(errors).toEqual([]);
});

test('aba IA mostra ausência de publicação e limite sem fingir resposta da IA', async ({ page }) => {
  await setup(page,{view:'ia'});
  await page.locator('#ia-pergunta').fill('Como organizar minhas despesas?');
  await page.locator('#ia-enviar').click();
  await expect(page.locator('#ia-status')).toContainText('ainda não foi publicado');
  await expect(page.locator('#ia-pergunta')).toHaveValue('Como organizar minhas despesas?');
  await expect(page.locator('.chat-message--user')).toHaveCount(0);
  await page.route('**/functions/v1/insights',(route)=>route.fulfill({status:429,json:{erro:'Limite diário compartilhado atingido.'}}));
  await page.locator('#ia-enviar').click();
  await expect(page.locator('#ia-status')).toContainText('Limite diário');
  await expect(page.locator('#ia-enviar')).toBeEnabled();
});

test('troca de conta limpa metas e conversa e ignora resposta antiga da IA', async ({ page }) => {
  await setup(page,{view:'porquinho',cofres:[{id:1,nome:'META PRIVADA DA CONTA A',meta:100,saldo:50,cor:'rosa'}]});
  await expect(page.locator('.piggy-card')).toContainText('META PRIVADA');
  await page.evaluate(()=>navegarStudio('ia'));
  let liberar,iniciada;
  const espera=new Promise((r)=>{liberar=r;}); const pedido=new Promise((r)=>{iniciada=r;});
  await page.route('**/functions/v1/insights',async(route)=>{iniciada();await espera;await route.fulfill({json:{resposta:'RESPOSTA PRIVADA ANTIGA'}});});
  await page.locator('#ia-pergunta').fill('PERGUNTA PRIVADA DA CONTA A');
  await page.locator('#ia-enviar').click(); await pedido;
  await trocarConta(page);
  liberar();
  await page.evaluate(()=>navegarStudio('ia'));
  await expect(page.locator('#ia-mensagens')).not.toContainText('PRIVADA');
  await expect(page.locator('#ia-pergunta')).toHaveValue('');
  await expect(page.locator('#ia-enviar')).toBeEnabled();
  await page.evaluate(()=>navegarStudio('porquinho'));
  await expect(page.locator('.piggy-card')).toHaveCount(0);
});

test('pizza e fluxo usam registros reais, agrupam categorias e permitem consulta pelo teclado', async ({ page }) => {
  const rows = [transaction(1,1000,true), ...[100,80,60,40,20,10].map((valor,i)=>({...transaction(i+2,-valor,i%2===0),categoria:i===0?'<img src=x onerror=alert(1)>':`Categoria ${i}`}))];
  const { errors } = await setup(page,{rows,view:'inicio'});
  await expect(page.locator('#overview-categorias .donut-segment')).toHaveCount(6);
  await expect(page.locator('#overview-categorias')).toContainText('Demais categorias');
  await expect(page.locator('#overview-categorias img')).toHaveCount(0);
  await page.locator('#overview-categorias [data-category="0"]').focus();
  await expect(page.locator('#overview-categorias .donut-center strong')).toContainText('100,00');
  await expect(page.locator('#overview-categorias [data-category="0"]')).toHaveAttribute('aria-pressed','true');
  await page.evaluate(()=>navegarStudio('relatorios'));
  await expect(page.locator('#relatorio-composicao .donut-center strong')).toContainText('310,00');
  await expect(page.locator('#relatorio-fluxo [data-flow-month]')).toHaveCount(6);
  await expect(page.locator('#relatorio-fluxo .flow-readout')).toContainText('1.000,00');
  await expect(page.locator('#relatorio-fluxo .flow-readout')).toContainText('310,00');
  await page.locator('#relatorio-fluxo [data-flow-month="0"]').focus();
  await expect(page.locator('#relatorio-fluxo [data-flow-month="0"]')).toHaveAttribute('aria-pressed','true');
  await trocarConta(page);
  await page.evaluate(()=>navegarStudio('relatorios'));
  await expect(page.locator('#relatorio-composicao')).toContainText('Nenhuma despesa');
  await expect(page.locator('#relatorio-fluxo')).toContainText('Sem lançamentos');
  expect(errors).toEqual([]);
});

test('oscilação usa histórico de câmbio existente sem nova chamada e limpa gráfico na falha', async ({ page }) => {
  const { calls, errors } = await setup(page);
  await page.evaluate(()=>navegarStudio('mercado'));
  await expect(page.locator('#mercado-oscilacao svg')).toBeVisible();
  await expect(page.locator('#mercado-oscilacao')).toContainText('29 variações calculadas');
  expect(calls.quotes).toBe(2);
  await page.route('**/functions/v1/cotacoes',(route)=>route.fulfill({status:503,json:{erro:'Serviço indisponível.'}}));
  await page.locator('#mercado-par').selectOption('EUR');
  await expect(page.locator('#mercado-oscilacao')).toContainText('indisponíveis');
  await expect(page.locator('#mercado-oscilacao svg')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('paginação soma mais de mil registros e filtra o mês corretamente', async ({ page }) => {
  const rows = Array.from({ length: 1001 }, (_, i) => transaction(i + 1, 1, true));
  rows.push({ ...transaction(1002, 99, true), data: '2020-01-01' });
  await setup(page, { rows });
  await expect(page.locator('#saldo-atual')).toContainText('1.100,00');
  await expect(page.locator('#tabela-total')).toContainText('1.001,00');
  await page.locator('#filtro-periodo').selectOption('todos');
  await expect(page.locator('#tabela-total')).toContainText('1.100,00');
});
test('CSV inválido não importa parte do arquivo; CSV com aspas faz uma chamada', async ({ page }) => {
  const { calls, errors } = await setup(page, { rows: [] });
  await page.locator('[data-view=importacoes]').click();
  const upload = (text) => page.locator('#input-csv').setInputFiles({ name: 'dados.csv', mimeType: 'text/csv', buffer: Buffer.from(text) });
  await upload(`${today};Válido;Ana;Outros;10,00;Única\n2026-02-31;Inválido;Ana;Outros;10,00;Única`);
  await page.locator('#btn-importar-csv').click();
  await expect(page.locator('#importacao-resultado')).toContainText('inválido');
  expect(calls.inserts).toBe(0);
  await upload(`${today};"Serviço; especial";Ana;Outros;1.500,50;Única`);
  await page.locator('#btn-importar-csv').click();
  await expect(page.locator('#importacao-resultado')).toContainText('1 transação');
  expect(calls.inserts).toBe(1); expect(errors).toEqual([]);
});
test('mercado usa biblioteca local; indisponibilidade da IA é explicada; calculadora limitada', async ({ page }) => {
  const { errors, calls } = await setup(page);
  await page.locator('[data-view=estatisticas]').click();
  await expect(page.locator('#moedas-grid')).toContainText('Dólar');
  expect(calls.quotes).toBe(1);
  await page.locator('[data-view=mercado]').click();
  await expect(page.locator('#mercado-ultimo')).toContainText('5,2900');
  await expect(page.locator('#mercado-grafico canvas').first()).toBeVisible();
  await page.locator('[data-view=transacoes]').last().click();
  await page.locator('#btn-gerar-insight').click();
  await expect(page.locator('#insight-texto')).toContainText('ainda não foi publicado');
  await page.locator('[data-view=investimentos]').click();
  await page.locator('#invest-meses').fill('999999');
  await page.locator('#btn-calcular-investimento').click();
  await expect(page.locator('#invest-resultado')).toContainText('600 meses');
  expect(errors).toEqual([]);
});
test('menu acessível no celular e tema persistente', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { errors } = await setup(page);
  await expect(page.locator('.sidebar')).not.toBeVisible();
  await page.locator('#btn-menu').click();
  await expect(page.locator('.sidebar')).toBeVisible();
  await page.locator('[data-view=contatos]').click();
  await expect(page.locator('#view-contatos')).toBeVisible();
  await expect(page.locator('.sidebar')).not.toBeVisible();
  await page.locator('#btn-tema').click();
  await expect(page.locator('html')).toHaveAttribute('data-tema', 'escuro');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-tema', 'escuro');
  expect(errors).toEqual([]);
});

test('IA mostra carregamento, impede chamadas repetidas e apresenta análise como texto', async ({ page }) => {
  await setup(page);
  let chamadas = 0;
  await page.route('**/functions/v1/insights', async (route) => {
    chamadas++;
    await new Promise((resolve) => setTimeout(resolve, 250));
    return route.fulfill({ json: { insight: 'Resumo: <img src=x onerror=alert(1)> Receitas maiores que despesas.' } });
  });
  await page.locator('#btn-gerar-insight').evaluate((b) => { b.click(); b.click(); });
  await expect(page.locator('#btn-gerar-insight')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#insight-texto')).toContainText('Receitas maiores');
  await expect(page.locator('#insight-texto img')).toHaveCount(0);
  await expect(page.locator('#btn-gerar-insight')).toBeEnabled();
  expect(chamadas).toBe(1);
});

test('IA explica limite gratuito e permite nova tentativa sem travar a tela', async ({ page }) => {
  await setup(page);
  await page.route('**/functions/v1/insights', (route) => route.fulfill({ status: 429, json: { erro: 'A cota gratuita da IA foi atingida. Tente novamente mais tarde.' } }));
  await page.locator('#btn-gerar-insight').click();
  await expect(page.locator('#insight-texto')).toContainText('cota gratuita');
  await expect(page.locator('#btn-gerar-insight')).toBeEnabled();
});
test('falha de perfil mantém área privada oculta e permite nova tentativa', async ({ page }) => {
  const { errors } = await setup(page, { profileError: true });
  await expect(page.locator('#auth-msg')).toContainText('carregar seu perfil');
  await expect(page.locator('.content')).not.toBeVisible();
  await expect(page.locator('#auth-enviar')).toBeEnabled();
  expect(errors).toEqual([]);
});

test('visão geral mostra números reais, muda período e abre atalhos sem chamar IA', async ({ page }) => {
  const { errors } = await setup(page, { view: 'inicio' });
  await expect(page.locator('#overview-saldo')).toContainText('70,00');
  await expect(page.locator('#overview-receitas')).toContainText('100,00');
  await expect(page.locator('#overview-despesas')).toContainText('30,00');
  await expect(page.locator('#overview-pendentes')).toHaveText('00');
  await expect(page.locator('#overview-recentes .recent-row')).toHaveCount(2);
  await expect(page.locator('#balance-chart svg')).toBeVisible();
  await page.locator('[data-chart-days="7"]').click();
  await expect(page.locator('#balance-chart')).toHaveAttribute('aria-label', /últimos 7 dias/);
  await expect(page.locator('[data-chart-days="7"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.feature-card--ai').click();
  await expect(page.locator('#view-ia')).toBeVisible();
  await expect(page.locator('#ia-pergunta')).toBeFocused();
  await expect(page.locator('#insight-texto')).toContainText('Clique em');
  await expect(page.locator('.sidebar__link[aria-current="page"]')).toHaveText('Assistente IA');
  expect(errors).toEqual([]);
});

test('painel vazio explica os próximos passos sem inventar gráficos ou resultados', async ({ page }) => {
  const { errors } = await setup(page, { view: 'inicio', rows: [] });
  await expect(page.locator('#overview-saldo')).toContainText('0,00');
  await expect(page.locator('#balance-chart')).toContainText('Confirme um recebimento');
  await expect(page.locator('#balance-chart svg.chart-line')).toHaveCount(0);
  await expect(page.locator('#overview-categorias')).toContainText('Nenhuma despesa');
  await page.locator('#overview-recentes [data-open-view="importacoes"]').click();
  const download = page.waitForEvent('download');
  await page.locator('#btn-modelo-csv').click();
  expect((await download).suggestedFilename()).toBe('modelo-fintheka.csv');
  expect(errors).toEqual([]);
});

test('falha ao buscar transações permite recuperar o painel com nova tentativa', async ({ page }) => {
  let falhar = true;
  await setup(page, { view: 'inicio' });
  await page.route('**/rest/v1/transacoes**', (route) => falhar ? route.fulfill({ status: 503, json: { message: 'Indisponível' } }) : route.fallback());
  await page.evaluate(() => carregarTransacoes());
  await expect(page.locator('#balance-chart')).toContainText('Não foi possível carregar');
  falhar = false;
  await page.locator('[data-retry-painel]').click();
  await expect(page.locator('#overview-saldo')).toContainText('70,00');
  await expect(page.locator('#balance-chart svg')).toBeVisible();
});

test('ajuda acessível abre pelo teclado, fecha e restaura o foco', async ({ page }) => {
  await setup(page);
  await page.locator('#btn-ajuda').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Seu guia FinTheka' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#help-dialog')).not.toBeVisible();
  await expect(page.locator('#btn-ajuda')).toBeFocused();
});

test('redesign cabe em celular, tablet e desktop nos dois temas e em todas as telas', async ({ page }) => {
  test.setTimeout(60000);
  const { errors } = await setup(page, { view: 'inicio' });
  const views = ['inicio', 'transacoes', 'relatorios', 'contatos', 'estatisticas', 'investimentos', 'mercado', 'importacoes', 'porquinho', 'ia'];
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    for (const tema of ['escuro', 'claro']) {
      await page.evaluate((tema) => aplicarTema(tema), tema);
      for (const view of views) {
        await page.evaluate((view) => navegarStudio(view), view);
        await expect(page.locator(`#view-${view}`)).toBeVisible();
        const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
        expect(dimensions.content, `${view}, ${tema}, ${width}px`).toBeLessThanOrEqual(dimensions.viewport + 1);
      }
      await page.locator('#btn-nova-transacao').click();
      await expect(page.locator('#transacao-dialog')).toBeVisible();
      await page.locator('#transacao-cancelar').click();
    }
  }
  expect(errors).toEqual([]);
});

test('login, cadastro e recuperação cabem no celular sem perder a validação', async ({ page }) => {
  const { errors } = await setup(page, { logged: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#auth-trocar').click();
  await expect(page.locator('#auth-nome-label')).toBeVisible();
  await page.locator('#auth-enviar').click();
  await expect(page.locator('#auth-msg')).toContainText('e-mail válido');
  await page.locator('#auth-trocar').click();
  await page.locator('#auth-esqueci').click();
  await expect(page.locator('#auth-titulo')).toHaveText('Recuperar senha');
  await expect(page.locator('#auth-senha-label')).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('segurança: senha é apagada ao trocar de modo e após falha de login', async ({ page }) => {
  await setup(page, { logged: false });
  await page.locator('#auth-senha').fill('segredo-que-nao-deve-ficar');
  await page.locator('#auth-trocar').click();
  await expect(page.locator('#auth-senha')).toHaveValue('');
  await page.locator('#auth-trocar').click();
  await page.route('**/auth/v1/token**', (route) => route.fulfill({ status: 400, json: { error: 'invalid_grant' } }));
  await page.locator('#auth-email').fill(user.email);
  await page.locator('#auth-senha').fill('senha-rejeitada');
  await page.locator('#auth-enviar').click();
  await expect(page.locator('#auth-msg')).toContainText('incorretos');
  await expect(page.locator('#auth-senha')).toHaveValue('');
});

test('segurança: login limpa credenciais do formulário oculto', async ({ page }) => {
  await setup(page, { logged: false });
  await page.locator('#auth-email').fill(user.email);
  await page.locator('#auth-senha').fill('senha-teste-123');
  await page.locator('#auth-enviar').click();
  await expect(page.locator('.content')).toBeVisible();
  await expect(page.locator('#auth-senha')).toHaveValue('');
  await expect(page.locator('#auth-email')).toHaveValue('');
  const armazenado = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, sessao: { ...sessionStorage } }));
  expect(armazenado).not.toContain('senha-teste-123');
});

test('segurança: restauração pelo histórico revalida sessão encerrada em outra aba', async ({ page }) => {
  const { errors } = await setup(page, { logged: false });
  await page.locator('#auth-email').fill(user.email);
  await page.locator('#auth-senha').fill('senha-teste-123');
  await page.locator('#auth-enviar').click();
  await expect(page.locator('.content')).toBeVisible();
  await page.evaluate(() => {
    localStorage.removeItem('sb-htueuvvndtlusfyaqlqa-auth-token');
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
  });
  await expect(page.locator('.content')).not.toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect(page.locator('#auth-screen')).toBeVisible();
  await expect(page.locator('.content')).not.toBeVisible();
  expect(errors).toEqual([]);
});

test('cadastro usa confirmação de e-mail e envia somente os metadados permitidos', async ({ page }) => {
  const { errors } = await setup(page, { logged: false });
  let pedido;
  await page.route('**/auth/v1/signup**', (route) => {
    pedido = route.request().postDataJSON();
    return route.fulfill({ json: { user, session: null } });
  });
  await page.locator('#auth-trocar').click();
  await page.locator('#auth-nome').fill('Pessoa de teste');
  await page.locator('#auth-email').fill('teste@example.com');
  await page.locator('#auth-senha').fill('senha-ficticia-123');
  await page.locator('#auth-enviar').click();
  await expect(page.locator('#auth-msg')).toContainText('confirmação');
  await expect(page.locator('.content')).not.toBeVisible();
  expect(pedido.data).toEqual({ nome: 'Pessoa de teste' });
  expect(errors).toEqual([]);
});

test('cadastro exige 12 caracteres antes de enviar nova senha', async ({ page }) => {
  await setup(page, { logged: false });
  let pedidos = 0;
  await page.route('**/auth/v1/signup**', (route) => { pedidos++; return route.fulfill({ json: { user, session: null } }); });
  await page.locator('#auth-trocar').click();
  await page.locator('#auth-nome').fill('Teste');
  await page.locator('#auth-email').fill(user.email);
  await page.locator('#auth-senha').fill('senha-curta');
  await page.locator('#auth-enviar').click();
  await expect(page.locator('#auth-msg')).toContainText('12 caracteres');
  expect(pedidos).toBe(0);
});

test('página de privacidade funciona sem autenticação, serviços externos ou largura excedente', async ({ page }) => {
  const externos = [];
  page.on('request', (req) => { if (!req.url().startsWith(appUrl)) externos.push(req.url()); });
  await page.goto(`${appUrl}/privacidade.html`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacidade e seus dados.');
  await expect(page.locator('main')).toContainText('Metheka');
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(externos).toEqual([]);
});

test('recuperação solicita link sem revelar se a conta existe', async ({ page }) => {
  const { errors } = await setup(page, { logged: false });
  let email;
  await page.route('**/auth/v1/recover**', (route) => {
    email = route.request().postDataJSON().email;
    return route.fulfill({ json: {} });
  });
  await page.locator('#auth-esqueci').click();
  await page.locator('#auth-email').fill('teste@example.com');
  await page.locator('#auth-enviar').click();
  await expect(page.locator('#auth-msg')).toContainText('Se esse e-mail existir');
  expect(email).toBe('teste@example.com');
  await expect(page.locator('.content')).not.toBeVisible();
  expect(errors).toEqual([]);
});

test('callback de recuperação mantém painel oculto até salvar a nova senha pelo SDK', async ({ page }) => {
  const { errors } = await setup(page, { logged: false });
  let senhaEnviada = false;
  await page.route('**/auth/v1/user', (route) => {
    if (route.request().method() === 'PUT') senhaEnviada = route.request().postDataJSON().password === 'nova-senha-ficticia-123';
    return route.fulfill({ json: user });
  });
  await page.goto('about:blank'); // O link de e-mail inicia um documento novo, não só uma mudança de hash.
  await page.goto(`${appUrl}/#access_token=${token}&refresh_token=fake-refresh&expires_in=3600&token_type=bearer&type=recovery`);
  await expect(page.locator('#auth-titulo')).toHaveText('Nova senha');
  await expect(page.locator('.content')).not.toBeVisible();
  await page.locator('#auth-senha').fill('nova-senha-ficticia-123');
  await page.locator('#auth-enviar').click();
  await expect(page.locator('#perfil-nome')).toHaveText('Teste');
  await expect(page.locator('.content')).toBeVisible();
  expect(senhaEnviada).toBe(true);
  expect(errors).toEqual([]);
});

test('segurança: resposta atrasada de recuperação não libera painel após notificação de mudança de sessão', async ({ page }) => {
  const { errors } = await setup(page, { logged: false });
  let liberar, iniciada;
  const espera = new Promise((resolve) => { liberar = resolve; });
  const pedido = new Promise((resolve) => { iniciada = resolve; });
  await page.route('**/auth/v1/user', async (route) => {
    if (route.request().method() === 'PUT') { iniciada(); await espera; }
    await route.fulfill({ json: user });
  });
  await page.goto('about:blank');
  await page.goto(`${appUrl}/#access_token=${token}&refresh_token=fake-refresh&expires_in=3600&token_type=bearer&type=recovery`);
  await expect(page.locator('#auth-titulo')).toHaveText('Nova senha');
  await page.locator('#auth-senha').fill('senha-nova-de-teste-123');
  await page.locator('#auth-enviar').click();
  await pedido;
  // Simula uma notificação de sessão externa enquanto o HTTP ainda está pendente.
  await page.evaluate(() => sb.auth._notifyAllSubscribers('SIGNED_OUT', null));
  liberar();
  await expect(page.locator('#auth-enviar')).toBeEnabled();
  await expect(page.locator('.content')).not.toBeVisible();
  expect(await page.evaluate(() => emRecuperacao)).toBe(true);
  expect(errors).toEqual([]);
});

test('paginação mantém totais completos e volta à primeira página ao filtrar', async ({ page }) => {
  await setup(page, { rows: Array.from({ length: 45 }, (_, i) => transaction(i + 1, 10, true)) });
  await expect(page.locator('#tabela-corpo tr')).toHaveCount(20);
  await expect(page.locator('#paginacao-info')).toHaveText('1–20 de 45 transações');
  await expect(page.locator('#tabela-total')).toContainText('450,00');
  await page.locator('#proxima-pagina').click();
  await expect(page.locator('#paginacao-info')).toHaveText('21–40 de 45 transações');
  await expect(page.locator('#tabela-corpo')).toContainText('Item 21');
  await page.locator('#proxima-pagina').click();
  await expect(page.locator('#tabela-corpo tr')).toHaveCount(5);
  await expect(page.locator('#proxima-pagina')).toBeDisabled();
  await page.locator('#busca-topo').fill('Item 1');
  await expect(page.locator('#paginacao-info')).toHaveText('1–11 de 11 transações');
  await expect(page.locator('#pagina-anterior')).toBeDisabled();
  await expect(page.locator('#tabela-total')).toContainText('110,00');
});

test('saldo negativo usa a cor correta e o gráfico permite consulta por teclado', async ({ page }) => {
  await setup(page, { view: 'inicio', rows: [transaction(1, -500, true)] });
  await expect(page.locator('#overview-saldo')).toHaveClass(/text-red/);
  const grafico = page.getByRole('slider', { name: /Consultar saldo/ });
  await grafico.focus();
  await page.keyboard.press('Home');
  await expect(grafico).toHaveAttribute('aria-valuenow', '0');
  await page.keyboard.press('ArrowRight');
  await expect(grafico).toHaveAttribute('aria-valuenow', '1');
  await page.keyboard.press('End');
  await expect(grafico).toHaveAttribute('aria-valuetext', /500,00/);
  await page.evaluate(() => navegarStudio('transacoes'));
  await expect(page.locator('#saldo-atual')).toHaveClass(/text-red/);
  await expect(page.locator('#tabela-total')).toHaveClass(/text-red/);
  await expect(page.locator('#tabela-total')).not.toHaveClass(/text-green/);
});

test('troca de usuário limpa números, histórico e resposta da IA da sessão anterior', async ({ page }) => {
  const { errors } = await setup(page, { view: 'inicio' });
  await expect(page.locator('#overview-recentes')).toContainText('Item 1');
  const otherUser = { ...user, id: '22222222-2222-4222-8222-222222222222', email: 'outra@example.com' };
  const otherToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: otherUser.id, role: 'authenticated', aud: 'authenticated', exp: now + 3600, iat: now })}.fake-signature`;
  await page.route('**/auth/v1/user', (route) => route.fulfill({ json: otherUser }));
  await page.route('**/rest/v1/perfis**', (route) => route.fulfill({ json: { nome: 'Outra pessoa', email: otherUser.email, papel: 'cliente' } }));
  await page.route('**/rest/v1/transacoes**', (route) => route.fulfill({ json: [] }));
  await page.evaluate(async (access_token) => {
    document.getElementById('insight-texto').textContent = 'Resposta particular da primeira conta';
    await sb.auth.setSession({ access_token, refresh_token: 'outra-sessao' });
  }, otherToken);
  await expect(page.locator('#perfil-nome')).toHaveText('Outra pessoa');
  await expect(page.locator('#overview-saldo')).toContainText('0,00');
  await expect(page.locator('#overview-recentes')).not.toContainText('Item 1');
  await expect(page.locator('#insight-texto')).not.toContainText('Resposta particular');
  await expect(page.locator('#tabela-total')).toContainText('0,00');
  expect(errors).toEqual([]);
});

test('segurança: textos maliciosos do banco não viram HTML no painel, tabela, relatórios ou contatos', async ({ page }) => {
  const payload = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>';
  const { errors } = await setup(page, { view: 'inicio', rows: [{ ...transaction(1, -50, true), descricao: payload, categoria: payload, recebido_de: payload }] });
  for (const view of ['inicio', 'transacoes', 'relatorios', 'contatos']) {
    await page.evaluate((view) => navegarStudio(view), view);
    await expect(page.locator(`#view-${view}`)).toContainText('<img');
    await expect(page.locator(`#view-${view} img, #view-${view} script`)).toHaveCount(0);
  }
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  expect(errors).toEqual([]);
});

test('segurança: CSP bloqueia script e manipulador de evento injetados', async ({ page }) => {
  await setup(page, { view: 'inicio' });
  await page.evaluate(() => {
    const script = document.createElement('script');
    script.textContent = 'window.__inlineExecutado = true';
    document.body.append(script);
    const button = document.createElement('button');
    button.setAttribute('onclick', 'window.__eventoExecutado = true');
    document.body.append(button);
    button.click();
  });
  expect(await page.evaluate(() => ({ script: !!window.__inlineExecutado, evento: !!window.__eventoExecutado }))).toEqual({ script: false, evento: false });
});

test('segurança: sem login a navegação direta mantém dados ocultos e não chama serviços', async ({ page }) => {
  const { calls, errors } = await setup(page, { logged: false, view: 'admin' });
  await expect(page.locator('.content')).not.toBeVisible();
  await expect(page.locator('#link-admin')).not.toBeVisible();
  expect(calls.quotes).toBe(0);
  await page.evaluate(() => { irParaView('admin'); navegarStudio('transacoes'); });
  await expect(page.locator('.content')).not.toBeVisible();
  await expect(page.locator('#auth-screen')).toBeVisible();
  expect(errors).toEqual([]);
});

test('segurança: troca de conta fecha formulário e limpa textos e arquivo da conta anterior', async ({ page }) => {
  await setup(page);
  await page.locator('#busca-topo').fill('Texto particular');
  await page.evaluate(() => navegarStudio('importacoes'));
  await page.locator('#input-csv').setInputFiles({ name: 'privado.csv', mimeType: 'text/csv', buffer: Buffer.from('dados privados') });
  await page.locator('#btn-nova-transacao').click();
  await page.locator('[name=descricao]').fill('Compra particular da conta A');
  await trocarConta(page);
  await expect(page.locator('#transacao-dialog')).not.toBeVisible();
  await expect(page.locator('[name=descricao]')).toHaveValue('');
  await expect(page.locator('#busca-topo')).toHaveValue('');
  expect(await page.locator('#input-csv').evaluate((input) => input.files.length)).toBe(0);
  await trocarConta(page, user.id, 'Conta original');
  await expect(page.locator('#overview-saldo')).toContainText('0,00');
});

test('segurança: leitura de CSV iniciada por outra conta não dispara inserção após troca de sessão', async ({ page }) => {
  const { calls } = await setup(page, { view: 'importacoes' });
  await page.evaluate((data) => {
    File.prototype.text = () => new Promise((resolve) => { window.liberarLeituraCsv = () => resolve(`${data};Transação particular;Ana;Outros;10,00;Única`); });
  }, today);
  await page.locator('#input-csv').setInputFiles({ name: 'privado.csv', mimeType: 'text/csv', buffer: Buffer.from('teste') });
  await page.locator('#btn-importar-csv').click();
  await page.waitForFunction(() => typeof window.liberarLeituraCsv === 'function');
  await trocarConta(page);
  await page.evaluate(async () => { window.liberarLeituraCsv(); await new Promise((resolve) => setTimeout(resolve, 100)); });
  expect(calls.inserts).toBe(0);
  await expect(page.locator('#importacao-resultado')).not.toContainText('Importação concluída');
});

test('segurança: salvamento atrasado não fecha o novo formulário nem troca o dono da inserção', async ({ page }) => {
  const { errors } = await setup(page, { rows: [] });
  let liberar, capturar;
  const bloqueio = new Promise((resolve) => { liberar = resolve; });
  const recebido = new Promise((resolve) => { capturar = resolve; });
  const insercoes = [];
  await page.route('**/rest/v1/transacoes**', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const body = route.request().postDataJSON(); insercoes.push(body);
    if (insercoes.length === 1) { capturar(); await bloqueio; }
    return route.fulfill({ status: 201, json: { ...body, id: insercoes.length, pago: false } });
  });
  await page.locator('#btn-nova-transacao').click();
  await page.locator('[name=descricao]').fill('Conta A');
  await page.locator('[name=valor]').fill('10');
  await page.locator('#transacao-form button[type=submit]').click();
  await recebido;
  await trocarConta(page);
  await page.locator('#btn-nova-transacao').click();
  await page.locator('[name=descricao]').fill('Conta B');
  await page.locator('[name=valor]').fill('20');
  const resposta = page.waitForResponse((r) => r.url().includes('/rest/v1/transacoes') && r.request().method() === 'POST');
  liberar(); await resposta;
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.locator('#transacao-dialog')).toBeVisible();
  await expect(page.locator('[name=descricao]')).toHaveValue('Conta B');
  await expect(page.locator('#transacao-form button[type=submit]')).toBeEnabled();
  await page.locator('#transacao-form button[type=submit]').click();
  await expect(page.locator('#transacao-dialog')).not.toBeVisible();
  expect(insercoes[0].usuario_id).toBe(user.id);
  expect(insercoes[1].usuario_id).toBe('22222222-2222-4222-8222-222222222222');
  expect(errors).toEqual([]);
});

test('segurança: resposta de IA da conta anterior não libera o botão durante uma nova análise', async ({ page }) => {
  await setup(page);
  const liberar = [];
  let chamadas = 0;
  await page.route('**/functions/v1/insights', async (route) => {
    const indice = chamadas++;
    await new Promise((resolve) => { liberar[indice] = resolve; });
    return route.fulfill({ headers: { 'x-fixture-step': String(indice) }, json: { insight: indice ? 'Análise da conta B' : 'Análise privada da conta A' } });
  });
  await page.locator('#btn-gerar-insight').click();
  await expect.poll(() => chamadas).toBe(1);
  await trocarConta(page);
  await page.evaluate(() => navegarStudio('transacoes'));
  await expect(page.locator('#btn-gerar-insight')).toBeEnabled();
  await page.locator('#btn-gerar-insight').click();
  await expect.poll(() => chamadas).toBe(2);
  const primeira = page.waitForResponse((r) => r.url().includes('/functions/v1/insights') && r.headers()['x-fixture-step'] === '0');
  liberar[0](); await primeira;
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.locator('#btn-gerar-insight')).toBeDisabled();
  await expect(page.locator('#insight-texto')).not.toContainText('privada');
  liberar[1]();
  await expect(page.locator('#insight-texto')).toHaveText('Análise da conta B');
  await expect(page.locator('#btn-gerar-insight')).toBeEnabled();
});

test('simulador profissional mantém equivalência de taxas, prazo e detalhamento', async ({ page }) => {
  const { errors } = await setup(page, { view: 'investimentos' });
  await expect(page.locator('#sim-saldo-final')).toBeVisible();
  const antes = await page.locator('#sim-saldo-final').textContent();
  await page.locator('#sim-unidade-taxa').selectOption('mensal');
  await expect(page.locator('#sim-saldo-final')).toHaveText(antes);
  await page.locator('#sim-unidade-prazo').selectOption('meses');
  await expect(page.locator('#invest-meses')).toHaveValue('120');
  await expect(page.locator('#sim-saldo-final')).toHaveText(antes);
  await page.locator('[data-sim-years="20"]').click();
  await expect(page.locator('#sim-status')).toContainText('240 meses');
  await expect(page.locator('#sim-tabela-corpo tr')).toHaveCount(12);
  await page.locator('#sim-tabela-periodo').selectOption('mensal');
  await page.locator('#sim-proxima').click();
  await expect(page.locator('#sim-tabela-corpo tr').first()).toContainText('Mês 13');
  await page.locator('[data-sim-view="real"]').click();
  await expect(page.locator('#sim-chart-foot')).toContainText('poder de compra');
  const grafico = page.locator('#invest-chart [role=slider]');
  await grafico.focus(); await page.keyboard.press('Home');
  await expect(grafico).toHaveAttribute('aria-valuenow', '0');
  await page.keyboard.press('End');
  await expect(grafico).toHaveAttribute('aria-valuenow', '240');
  expect(errors).toEqual([]);
});

test('simulador calcula aporte para meta, exporta toda projeção e bloqueia resultado inválido', async ({ page }) => {
  const { errors, calls } = await setup(page, { view: 'investimentos' });
  await page.locator('.sim-advanced summary').click();
  await page.locator('#sim-meta').fill('1000000');
  await page.locator('#btn-calcular-investimento').click();
  await expect(page.locator('#sim-usar-aporte')).toBeVisible();
  await page.locator('#sim-usar-aporte').click();
  await expect(page.locator('#sim-goal')).toContainText('Primeiro alcance');
  const downloading = page.waitForEvent('download');
  await page.locator('#sim-exportar').click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('fintheka-projecao-120-meses.csv');
  const stream = await download.createReadStream();
  const buffers = []; for await (const buffer of stream) buffers.push(buffer);
  const csv = Buffer.concat(buffers).toString('utf8');
  expect(csv.split(/\r?\n/)).toHaveLength(122);
  expect(csv).toContain('saldo_poder_compra');
  expect(csv).toContain('taxa_base_anual_pct');
  expect(csv.split(/\r?\n/)[1].split(';')).toHaveLength(16);
  await page.locator('#invest-meses').fill('999999');
  await page.locator('#btn-calcular-investimento').click();
  await expect(page.locator('#invest-resultado [role=alert]')).toContainText('600 meses');
  await expect(page.locator('#sim-exportar')).toBeDisabled();
  await expect(page.locator('#sim-chart-panel')).not.toBeVisible();
  await page.locator('#sim-reset').click();
  await expect(page.locator('#sim-saldo-final')).toBeVisible();
  expect(calls.inserts + calls.updates + calls.deletes).toBe(0);
  expect(errors).toEqual([]);
});

test('simulador separa inflação, custos e prejuízo; zero não produz NaN ou gráfico inválido', async ({ page }) => {
  await setup(page, { view: 'investimentos' });
  await page.locator('.sim-advanced summary').click();
  await page.locator('#sim-unidade-prazo').selectOption('meses');
  await page.locator('#invest-meses').fill('12');
  await page.locator('#invest-taxa').fill('-20');
  await page.locator('#invest-aporte').fill('0');
  await page.locator('#sim-custos').fill('0');
  await page.locator('#sim-inflacao').fill('0');
  await page.locator('#btn-calcular-investimento').click();
  await expect(page.locator('#sim-saldo-final')).toContainText('8.000,00');
  await expect(page.locator('#sim-ganho')).toHaveClass(/text-red/);
  await expect(page.locator('#sim-valor-real')).toContainText('8.000,00');
  await page.locator('#invest-valor-inicial').fill('0');
  await page.locator('#btn-calcular-investimento').click();
  await expect(page.locator('#sim-saldo-final')).toContainText('0,00');
  expect(await page.locator('#invest-chart svg').getAttribute('viewBox')).toMatch(/^0 0 \d+ 270$/);
  expect(await page.locator('#invest-chart').innerHTML()).not.toMatch(/NaN|Infinity/);
});

test('menu móvel mantém navegação por teclado dentro do menu e devolve foco ao fechar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await page.locator('#btn-menu').click();
  await page.locator('.sidebar__brand').focus();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#busca-lateral')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('.sidebar__brand')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.sidebar')).not.toBeVisible();
  await expect(page.locator('#btn-menu')).toBeFocused();
});

test('simulador preserva geometria do gráfico e projeção ao padronizar os temas', async ({ page }) => {
  const fs = require('node:fs');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setup(page, { view: 'investimentos' });
  const file = 'artifacts/redesign/simulador-grafico-preservado.json';
  const referencia = JSON.parse(fs.readFileSync(file,'utf8'));
  const atual = {};
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 960 });
    for (const tema of ['claro', 'escuro']) {
      await page.evaluate((t) => aplicarTema(t), tema);
      // Compara na mesma largura da referencia: ResizeObserver e assincrono.
      const largura = Number(referencia[`${width}-${tema}`].grafico[0].atributos.viewBox.split(' ')[2]);
      await page.locator('#invest-chart').evaluate((el, w) => { el.style.width = `${w}px`; renderizarGraficoSimulacao(); }, largura);
      atual[`${width}-${tema}`] = await page.locator('#invest-chart').evaluate((view) => ({
        projecao: document.getElementById('sim-saldo-final').textContent,
        grafico: [...view.querySelectorAll('svg, path, text')].map((el) => ({ tag: el.tagName, classe: el.getAttribute('class'), texto: el.tagName === 'text' ? el.textContent : null, atributos: Object.fromEntries(['viewBox','d','x','y','text-anchor','aria-valuemin','aria-valuemax','aria-valuenow','aria-valuetext'].map((p) => [p, el.getAttribute(p)])) })),
      }));
    }
  }
  expect(atual).toEqual(referencia);
});

test('capturas de revisão do Studio com dados exclusivamente simulados', async ({ page }) => {
  test.skip(!process.env.CAPTURE_REDESIGN, 'Capturas opcionais para revisão visual.');
  const fs = require('node:fs');
  fs.mkdirSync('artifacts/redesign', { recursive: true });
  const rows = [
    { ...transaction(1, 5200, true), descricao: 'Salário', categoria: 'Salário', recebido_de: 'Empresa' },
    { ...transaction(2, -1250, true), descricao: 'Aluguel do apartamento', categoria: 'Casa', recebido_de: 'Imobiliária' },
    { ...transaction(3, -287.90, true), descricao: 'Compras da semana', categoria: 'Alimentação', recebido_de: 'Supermercado' },
    { ...transaction(4, 1800, true), descricao: 'Projeto de identidade visual', categoria: 'Serviços', recebido_de: 'Estúdio Norte' },
    { ...transaction(5, -159.90), descricao: 'Internet e telefone', categoria: 'Casa', recebido_de: 'Operadora' },
    { ...transaction(6, -89.90, true), descricao: 'Livros e café', categoria: 'Lazer', recebido_de: 'Livraria' },
  ];
  rows.forEach((row, i) => { row.tipo_pagamento = ['Transferência bancária', 'Pix', 'Cartão de crédito', 'Pix', 'Boleto', 'Cartão de débito'][i]; });
  const ago = (days) => { const d = new Date(); d.setDate(d.getDate() - days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  for (let i = 0; i < 28; i++) rows.push({ ...transaction(i + 20, i % 6 === 0 ? 900 : -45 - i * 3, true), data: ago(i + 1), descricao: 'Movimento simulado' });
  for (let i = 1; i <= 5; i++) {
    const d = new Date(); d.setDate(15); d.setMonth(d.getMonth()-i);
    const data = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-15`;
    rows.push({...transaction(100+i,5500+i*120,true),data,descricao:'Receita simulada de revisão',categoria:'Serviços'});
    rows.push({...transaction(200+i,-3200-i*90,true),data,descricao:'Despesa simulada de revisão',categoria:'Casa'});
  }
  await setup(page, { rows, view: 'inicio', cofres: [
    {id:1,nome:'Reserva de emergência',meta:6000,saldo:1800,prazo:null,cor:'verde'},
    {id:2,nome:'Minha próxima viagem',meta:3000,saldo:850,prazo:'2027-07-01',cor:'rosa'},
    {id:3,nome:'Curso de fotografia',meta:450,saldo:450,prazo:null,cor:'violeta'},
  ] });
  await page.setViewportSize({ width: 1512, height: 1050 });
  await expect(page.locator('#overview-saldo')).not.toContainText('--');
  await page.screenshot({ path: 'artifacts/redesign/01-visao-geral.png', fullPage: true, animations: 'disabled' });
  await page.evaluate(() => navegarStudio('transacoes'));
  await page.screenshot({ path: 'artifacts/redesign/02-transacoes.png', fullPage: true, animations: 'disabled' });
  await page.evaluate(() => navegarStudio('mercado'));
  await expect(page.locator('#mercado-grafico canvas').first()).toBeVisible();
  await page.screenshot({ path: 'artifacts/redesign/03-mercado.png', fullPage: true, animations: 'disabled' });
  await page.evaluate(() => { aplicarTema('claro'); navegarStudio('inicio'); });
  await page.screenshot({ path: 'artifacts/redesign/04-tema-claro.png', fullPage: true, animations: 'disabled' });
  await page.evaluate(() => navegarStudio('relatorios'));
  await page.screenshot({ path: 'artifacts/redesign/20-relatorios-cafe.png', fullPage: true, animations: 'disabled' });
  await page.evaluate(() => navegarStudio('inicio'));
  await page.evaluate(() => aplicarTema('escuro'));
  await page.screenshot({ path: 'artifacts/redesign/15-desktop-escuro.png', fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/redesign/05-celular.png', fullPage: true, animations: 'disabled' });
  await page.evaluate(() => navegarStudio('transacoes'));
  await page.locator('#tabela-corpo tr').first().evaluate((row) => row.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await page.screenshot({ path: 'artifacts/redesign/14-movimentos-celular.png', animations: 'disabled' });
  await page.locator('#btn-nova-transacao').click();
  await page.screenshot({ path: 'artifacts/redesign/06-nova-transacao.png', fullPage: true, animations: 'disabled' });
  await page.locator('#transacao-cancelar').click();
  await page.setViewportSize({ width: 1512, height: 1050 });
  await page.evaluate(() => aplicarTema('claro'));
  await page.locator('#btn-nova-transacao').click();
  await page.locator('[name=tipo]').selectOption('despesa');
  await page.locator('[name=descricao]').fill('Compras da semana');
  await page.locator('[name=valor]').fill('287,90');
  await page.getByRole('button', { name: 'Supermercado', exact: true }).click();
  await page.locator('#transacao-titulo').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/redesign/11-categorias-despesa.png', animations: 'disabled' });
  await page.locator('#categoria-criar').click();
  await page.locator('#categoria-nova-nome').fill('Marmitas da semana');
  await page.locator('#categoria-nova-nome').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/redesign/12-criar-categoria.png', animations: 'disabled' });
  await page.locator('#categoria-cancelar').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#categorias-opcoes').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/redesign/13-categorias-celular.png', animations: 'disabled' });
  await page.locator('#transacao-cancelar').click();
  await page.evaluate(() => navegarStudio('investimentos'));
  await page.setViewportSize({ width: 1512, height: 1050 });
  await page.screenshot({ path: 'artifacts/redesign/09-simulador.png', fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/redesign/10-simulador-celular.png', fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 1512, height: 1050 });
  await page.evaluate(() => { aplicarTema('escuro'); navegarStudio('porquinho'); });
  await expect(page.locator('.piggy-card')).toHaveCount(3);
  await page.screenshot({ path: 'artifacts/redesign/16-porquinho-desktop.png', fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/redesign/17-porquinho-celular.png', fullPage: true, animations: 'disabled' });
  await page.route('**/functions/v1/insights',(route)=>route.fulfill({json:{resposta:'Defina uma meta que caiba no seu orçamento e registre o valor que conseguiu separar. Revise suas despesas e acompanhe seu progresso aos poucos. Esta é uma resposta simulada para revisão do layout.'}}));
  await page.evaluate(() => { aplicarTema('claro'); navegarStudio('ia'); });
  await page.locator('#ia-pergunta').fill('Como posso planejar minha reserva de emergência?');
  await page.locator('#ia-enviar').click();
  await expect(page.locator('.chat-message--assistant')).toContainText('resposta simulada');
  await page.setViewportSize({ width: 1512, height: 1050 });
  await page.screenshot({ path: 'artifacts/redesign/18-assistente-desktop.png', fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/redesign/19-assistente-celular.png', fullPage: true, animations: 'disabled' });
  await page.evaluate(() => localStorage.clear());
  const loginPage = await page.context().newPage();
  await setup(loginPage, { logged: false });
  await expect(loginPage.locator('#auth-screen')).toBeVisible();
  await loginPage.setViewportSize({ width: 1512, height: 1050 });
  await loginPage.screenshot({ path: 'artifacts/redesign/07-login.png', fullPage: true, animations: 'disabled' });
  await loginPage.setViewportSize({ width: 390, height: 844 });
  await loginPage.screenshot({ path: 'artifacts/redesign/08-login-celular.png', fullPage: true, animations: 'disabled' });
  await loginPage.close();
});
