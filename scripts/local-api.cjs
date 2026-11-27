const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { asUser } = require('./local-db.cjs');
const scrypt = promisify(crypto.scrypt);
const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
const fail = (status, message, code = 'LOCAL_ERROR') => Object.assign(new Error(message), { status, code });
const tables = {
  aceites_termos: ['usuario_id', 'versao', 'aceito_em'],
  perfis: ['id', 'nome', 'email', 'papel', 'criado_em'],
  transacoes: ['id', 'usuario_id', 'data', 'descricao', 'recebido_de', 'categoria', 'valor', 'tipo_pagamento', 'pago', 'criado_em'],
  cofrinhos: ['id', 'usuario_id', 'nome', 'meta', 'saldo', 'prazo', 'cor', 'criado_em'],
  movimentos_cofrinho: ['id', 'cofrinho_id', 'usuario_id', 'tipo', 'valor', 'criado_em'],
};

function publicUser(row) {
  return { id: row.id, email: row.email, aud: 'authenticated', role: 'authenticated', user_metadata: row.raw_user_meta_data };
}

async function session(tx, row) {
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const encode = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const access = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: row.id, exp: expires, aud: 'authenticated', role: 'authenticated', session_id: crypto.randomUUID() })}.${crypto.randomBytes(32).toString('base64url')}`;
  const refresh = crypto.randomBytes(48).toString('base64url');
  // Tokens are opaque to the server: only hashes issued here are accepted.
  await tx.query(`insert into auth.sessions values ($1,$2,$3,to_timestamp($4),now()+interval '7 days')`, [digest(access), digest(refresh), row.id, expires]);
  return { access_token: access, refresh_token: refresh, expires_in: 3600, expires_at: expires, token_type: 'bearer', user: publicUser(row) };
}

async function bodyJSON(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) throw fail(413, 'Arquivo ou solicitação acima de 1 MB.');
    chunks.push(chunk);
  }
  try {
    const value = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
    if (!value || typeof value !== 'object') throw new Error('Invalid JSON body');
    return value;
  }
  catch { throw fail(400, 'JSON inválido.'); }
}

function send(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

function column(table, name) {
  if (!tables[table]?.includes(name)) throw fail(400, 'Campo inválido.');
  return `"${name}"`;
}

async function rest(tx, req, url, table, body) {
  if (!Object.hasOwn(tables, table)) throw fail(404, 'Recurso não encontrado.');
  const params = [], bind = (v) => { params.push(v); return `$${params.length}`; };
  const fields = url.searchParams.get('select') || '*';
  const selected = fields === '*' ? '*' : fields.split(',').map((f) => column(table, f)).join(',');
  // The SDK supplies a quoted column list for bulk inserts. SQL still uses
  // the validated keys of the JSON records, never this URL fragment.
  if (url.searchParams.has('columns')) {
    if (req.method !== 'POST') throw fail(400, 'Colunas inválidas.');
    for (const name of url.searchParams.get('columns').split(',')) column(table, name.replace(/^"|"$/g, ''));
  }
  const filters = [];
  for (const [key, value] of url.searchParams) {
    if (['select', 'order', 'limit', 'offset', 'columns'].includes(key)) continue;
    if (!value.startsWith('eq.')) throw fail(400, 'Filtro inválido.');
    filters.push(`${column(table, key)} = ${bind(value.slice(3))}`);
  }
  const where = filters.length ? ` where ${filters.join(' and ')}` : '';
  let result;
  if (req.method === 'GET') {
    const order = (url.searchParams.get('order') || '').split(',').filter(Boolean).map((item) => {
      const [key, dir] = item.split('.');
      if (!['asc', 'desc'].includes(dir)) throw fail(400, 'Ordenação inválida.');
      return `${column(table, key)} ${dir}`;
    }).join(',');
    const limit = Number(url.searchParams.get('limit') || 500), offset = Number(url.searchParams.get('offset') || 0);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10001 || !Number.isSafeInteger(offset) || offset < 0) throw fail(400, 'Paginação inválida.');
    result = await tx.query(`select ${selected} from public.${table}${where}${order ? ` order by ${order}` : ''} limit ${bind(limit)} offset ${bind(offset)}`, params);
  } else if (req.method === 'POST') {
    const rows = Array.isArray(body) ? body : [body];
    if (!rows.length || rows.length > 500) throw fail(400, 'Envie de 1 a 500 registros por vez.');
    if (rows.some((r) => !r || typeof r !== 'object' || Array.isArray(r))) throw fail(400, 'Registros inválidos.');
    const keys = Object.keys(rows[0]);
    if (!keys.length || rows.some((r) => !r || Object.keys(r).length !== keys.length || keys.some((k) => !Object.hasOwn(r, k)))) throw fail(400, 'Registros inválidos.');
    const names = keys.map((k) => column(table, k)).join(',');
    const values = rows.map((r) => `(${keys.map((k) => bind(r[k])).join(',')})`).join(',');
    result = await tx.query(`insert into public.${table} (${names}) values ${values} returning ${selected}`, params);
  } else if (req.method === 'PATCH') {
    if (!filters.length || !body || Array.isArray(body) || !Object.keys(body).length) throw fail(400, 'Edição inválida.');
    const updates = Object.entries(body).map(([key, value]) => `${column(table, key)} = ${bind(value)}`).join(',');
    result = await tx.query(`update public.${table} set ${updates}${where} returning ${selected}`, params);
  } else if (req.method === 'DELETE') {
    if (!filters.length) throw fail(400, 'Informe o registro a excluir.');
    result = await tx.query(`delete from public.${table}${where} returning ${selected}`, params);
  } else throw fail(405, 'Método não permitido.');
  if ((req.headers.accept || '').includes('application/vnd.pgrst.object+json')) {
    if (result.rows.length !== 1) throw fail(406, 'Registro não encontrado ou sem permissão.', 'PGRST116');
    return result.rows[0];
  }
  return result.rows;
}

function quotes(body) {
  const moedas = [['USD', 'Dólar americano', 5.15], ['EUR', 'Euro', 5.60], ['GBP', 'Libra esterlina', 6.65], ['BTC', 'Bitcoin', 350000], ['ARS', 'Peso argentino', 0.005], ['JPY', 'Iene japonês', 0.034], ['CAD', 'Dólar canadense', 3.75], ['AUD', 'Dólar australiano', 3.35], ['CHF', 'Franco suíço', 5.85], ['CNY', 'Yuan chinês', 0.72]];
  if (!body.par) return { usd: 5.15, eur: 5.60, demonstracao: true, moedas: moedas.map(([codigo, nome, valor]) => ({ codigo, nome, valor, variacao: 0.25 })) };
  const moeda = moedas.find(([codigo]) => body.par === codigo);
  if (!moeda) throw fail(400, 'Par de moedas inválido.');
  const dias = Number(body.dias || 30);
  if (![7, 15, 30, 60, 90, 180, 365].includes(dias)) throw fail(400, 'Período inválido.');
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const base = new Date(`${hoje}T12:00:00Z`);
  return { demonstracao: true, historico: Array.from({ length: dias }, (_, i) => {
    const date = new Date(base); date.setUTCDate(date.getUTCDate() - dias + 1 + i);
    const open = moeda[2] * (1 + Math.sin(i / 5) * 0.015), close = open * (1 + Math.cos(i / 3) * 0.003);
    return { time: date.toISOString().slice(0, 10), open, close, high: Math.max(open, close) * 1.003, low: Math.min(open, close) * 0.997 };
  }) };
}

async function insights(tx, body) {
  const rows = (await tx.query('select valor,pago from public.transacoes order by data desc,id desc limit 200')).rows;
  const receita = rows.filter((r) => Number(r.valor) > 0).reduce((s, r) => s + Math.round(Number(r.valor) * 100), 0) / 100;
  const despesa = -rows.filter((r) => Number(r.valor) < 0).reduce((s, r) => s + Math.round(Number(r.valor) * 100), 0) / 100;
  const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const resumo = `Análise local por regras, sem IA externa. Nos ${rows.length} lançamentos mais recentes: receitas de ${brl(receita)}, despesas de ${brl(despesa)} e resultado previsto de ${brl(receita - despesa)}. ${rows.filter((r) => !r.pago).length} lançamentos estão pendentes.`;
  const pergunta = String(body.mensagens?.at(-1)?.content || '').toLowerCase();
  const dica = /meta|poup|guard|econom/.test(pergunta) ? ' Defina um valor mensal que caiba no orçamento e registre sua evolução no Porquinho. Os registros são manuais e não movimentam dinheiro.' : /dívida|divida|juro/.test(pergunta) ? ' Liste as dívidas, seus juros e vencimentos. Compare o custo total antes de renegociar e priorize os compromissos essenciais.' : ' Confira os lançamentos pendentes, agrupe as despesas por categoria e planeje os pagamentos antes de assumir novos gastos.';
  return { insight: resumo + dica, resposta: resumo + dica, local: true };
}

function createLocalApi(db) {
  const attempts = new Map();
  return async (req, res, url) => {
    try {
      const origin = req.headers.origin;
      if (origin && origin !== `http://${req.headers.host}`) throw fail(403, 'Origem não permitida.');
      const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await bodyJSON(req) : {};
      const route = url.pathname.replace(/^\/local/, '');
      if (req.method === 'POST' && (route === '/auth/v1/signup' || route === '/auth/v1/token')) {
        const email = String(body.email || '').trim().toLowerCase();
        // Bound password hashing work, including repeated bad logins and registrations.
        const key = `${req.socket.remoteAddress}`;
        const now = Date.now(), attempt = attempts.get(key);
        if (attempt && now - attempt.since < 60000 && attempt.count >= 30) throw fail(429, 'Aguarde um minuto antes de tentar novamente.');
        attempts.set(key, !attempt || now - attempt.since >= 60000 ? { since: now, count: 1 } : { ...attempt, count: attempt.count + 1 });
        if (url.searchParams.get('grant_type') === 'refresh_token' && route === '/auth/v1/token') {
          const data = await db.transaction(async (tx) => {
            const row = (await tx.query(`select u.* from auth.users u join auth.sessions s on u.id=s.usuario_id where s.refresh_hash=$1 and s.refresh_expires_at>now()`, [digest(String(body.refresh_token || ''))])).rows[0];
            if (!row) throw fail(401, 'Sessão expirada. Entre novamente.');
            await tx.query('delete from auth.sessions where refresh_hash=$1', [digest(body.refresh_token)]);
            return session(tx, row);
          });
          return send(res, 200, data);
        }
        const password = String(body.password || '');
        if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254 || !password || password.length > 72) throw fail(400, 'Confira o e-mail e a senha.');
        const existing = (await db.query('select * from auth.users where email=$1', [email])).rows[0];
        if (route === '/auth/v1/signup') {
          if (password.length < 12) throw fail(400, 'A senha precisa ter pelo menos 12 caracteres.');
          if (existing) throw fail(400, 'Não foi possível cadastrar este e-mail.');
          const salt = crypto.randomBytes(16).toString('hex');
          const hash = (await scrypt(password, salt, 64)).toString('hex');
          const data = await db.transaction(async (tx) => {
            const first = !(await tx.query('select id from auth.users limit 1')).rows.length;
            const row = (await tx.query(`insert into auth.users values ($1,$2,$3,$4,$5) returning *`, [crypto.randomUUID(), email, { nome: String(body.data?.nome || '').trim().slice(0, 100), termos_aceitos: body.data?.termos_aceitos, termos_versao: body.data?.termos_versao }, salt, hash])).rows[0];
            if (first) await tx.query("update public.perfis set papel='admin' where id=$1", [row.id]);
            return session(tx, row);
          });
          return send(res, 200, data);
        }
        const hash = await scrypt(password, existing?.password_salt || 'invalid-user', 64);
        if (!existing || !crypto.timingSafeEqual(hash, Buffer.from(existing.password_hash, 'hex'))) throw fail(400, 'E-mail ou senha incorretos.', 'invalid_credentials');
        return send(res, 200, await db.transaction((tx) => session(tx, existing)));
      }
      if (route === '/auth/v1/recover') throw fail(400, 'No modo local não há envio de e-mail. Use a recuperação pelo terminal descrita em APRESENTACAO_LOCAL.md.');
      const access = (req.headers.authorization || '').replace(/^Bearer /i, '');
      const user = (await db.query(`select u.* from auth.users u join auth.sessions s on u.id=s.usuario_id where s.access_hash=$1 and s.expires_at>now()`, [digest(access)])).rows[0];
      if (!user) throw fail(401, 'Sessão inválida. Entre novamente.');
      if (route === '/functions/v1/excluir-conta' && req.method === 'POST') {
        if (Object.keys(body).some((k) => !['senha', 'confirmacao'].includes(k)) || body.confirmacao !== 'EXCLUIR' || typeof body.senha !== 'string' || !body.senha || body.senha.length > 72) throw fail(400, 'Informe sua senha e confirme digitando EXCLUIR.');
        const hash = await scrypt(body.senha, user.password_salt, 64);
        if (!crypto.timingSafeEqual(hash, Buffer.from(user.password_hash, 'hex'))) throw fail(403, 'Não foi possível confirmar sua senha. Tente novamente.');
        await db.query('delete from auth.users where id=$1', [user.id]);
        return send(res, 200, { excluida: true });
      }
      if (route === '/auth/v1/user' && req.method === 'GET') return send(res, 200, publicUser(user));
      if (route === '/auth/v1/user' && req.method === 'PUT') {
        if (typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 72) throw fail(400, 'Use uma senha de 12 a 72 caracteres.');
        const salt = crypto.randomBytes(16).toString('hex'), hash = (await scrypt(body.password, salt, 64)).toString('hex');
        await db.transaction(async (tx) => {
          await tx.query('update auth.users set password_salt=$1,password_hash=$2 where id=$3', [salt, hash, user.id]);
          await tx.query('delete from auth.sessions where usuario_id=$1 and access_hash<>$2', [user.id, digest(access)]);
        });
        return send(res, 200, publicUser(user));
      }
      if (route === '/auth/v1/logout' && req.method === 'POST') {
        await db.query('delete from auth.sessions where access_hash=$1', [digest(access)]);
        return send(res, 200, {});
      }
      const data = await asUser(db, user.id, async (tx) => {
        if (route === '/functions/v1/cotacoes' && req.method === 'POST') return quotes(body);
        if (route === '/functions/v1/insights' && req.method === 'POST') return insights(tx, body);
        if (route === '/rest/v1/rpc/resumo_usuarios' && req.method === 'POST') return (await tx.query('select * from public.resumo_usuarios()')).rows;
        if (route === '/rest/v1/rpc/movimentar_cofrinho' && req.method === 'POST') return (await tx.query('select * from public.movimentar_cofrinho($1,$2,$3,$4)', [body.p_cofrinho, body.p_tipo, body.p_valor, body.p_requisicao])).rows[0];
        if (/^\/rest\/v1\/[a-z_]+$/.test(route)) return rest(tx, req, url, route.split('/').at(-1), body);
        throw fail(404, 'Recurso não encontrado.');
      });
      send(res, req.method === 'POST' && route.startsWith('/rest/v1/') ? 201 : 200, data);
    } catch (error) {
      const known = ['P0001', '54000'].includes(error.code);
      const status = error.status || (error.code ? 400 : 500);
      const message = error.status || known ? error.message : status === 400 ? 'Dados inválidos ou operação sem permissão.' : 'Não foi possível concluir a operação local.';
      if (status === 500) console.error('Falha na API local:', error);
      send(res, status, { message, msg: message, erro: message, code: error.code || 'LOCAL_ERROR' });
    }
  };
}

module.exports = { createLocalApi };
