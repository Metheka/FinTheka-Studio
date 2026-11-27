const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

const databasePath = path.resolve(process.env.FINTHEKA_DATA_DIR || path.resolve(__dirname, '../.local-data/postgres'));
async function openDatabase(directory = databasePath) {
  if (directory !== 'memory://') fs.mkdirSync(directory, { recursive: true });
  const release = directory === 'memory://' ? () => {} : lockDatabase(directory);
  let db;
  try {
    // PostgreSQL DATE is a calendar date, not a timestamp (same wire format as PostgREST).
    db = new PGlite({ dataDir: directory, parsers: { 1082: (value) => value } });
    await db.exec(`create table if not exists public.local_migrations (name text primary key)`);
    const applied = new Set((await db.query('select name from public.local_migrations')).rows.map((r) => r.name));
    if (!applied.has('bootstrap')) await db.transaction(async (tx) => {
      await tx.exec(`
        create role anon nologin;
        create role authenticated nologin;
        create role service_role nologin bypassrls;
        create schema auth;
        create table auth.users (
          id uuid primary key, email text unique not null, raw_user_meta_data jsonb default '{}',
          password_salt text not null, password_hash text not null
        );
        create table auth.sessions (
          access_hash text primary key, refresh_hash text unique not null,
          usuario_id uuid not null references auth.users(id) on delete cascade,
          expires_at timestamptz not null, refresh_expires_at timestamptz not null
        );
        create function auth.uid() returns uuid language sql stable as $$
          select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
        $$;
        grant usage on schema auth, public to anon, authenticated, service_role;
        grant execute on function auth.uid() to anon, authenticated, service_role;
      `);
      await tx.exec(fs.readFileSync(path.resolve(__dirname, '../supabase/schema.sql'), 'utf8'));
      await tx.query('insert into public.local_migrations values ($1)', ['bootstrap']);
    });
    const migrations = path.resolve(__dirname, '../supabase/migrations');
    for (const name of fs.readdirSync(migrations).filter((n) => n.endsWith('.sql')).sort()) {
      if (applied.has(name)) continue;
      // The original migrations contain their own BEGIN/COMMIT.
      await db.exec(fs.readFileSync(path.join(migrations, name), 'utf8'));
      await db.query('insert into public.local_migrations values ($1)', [name]);
    }
    const close = db.close.bind(db);
    db.close = async () => { try { await close(); } finally { release(); } };
    return db;
  } catch (error) { if (db) await db.close(); release(); throw error; }
}

function lockDatabase(directory) {
  const file = path.resolve(directory, '../postgres.lock');
  const value = JSON.stringify({ pid: process.pid, nonce: require('node:crypto').randomUUID() });
  try { fs.writeFileSync(file, value, { flag: 'wx' }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let owner;
    try { owner = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { throw new Error('Trava do banco inválida. Confira .local-data/postgres.lock antes de iniciar.'); }
    let alive = true;
    try { process.kill(owner.pid, 0); } catch (e) { if (e.code === 'ESRCH') alive = false; }
    if (alive) throw new Error('O banco local já está aberto. Encerre o outro servidor com Ctrl+C antes de continuar.');
    fs.unlinkSync(file);
    fs.writeFileSync(file, value, { flag: 'wx' });
  }
  return () => { if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === value) fs.unlinkSync(file); };
}

async function asUser(db, id, action) {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [id]);
    await tx.exec('set local role authenticated');
    return action(tx);
  });
}

module.exports = { openDatabase, asUser, lockDatabase, databasePath };
