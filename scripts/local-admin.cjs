const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { Writable } = require('node:stream');
const { openDatabase, lockDatabase, databasePath: data } = require('./local-db.cjs');

async function main() {
  const [action, argument] = process.argv.slice(2);
  if (action === 'restore') {
    if (!argument) throw new Error('Use npm run local:restore -- backups/ARQUIVO.tar.gz');
    const source = path.resolve(argument);
    const bytes = fs.readFileSync(source);
    fs.mkdirSync(path.dirname(data), { recursive: true });
    const release = lockDatabase(data);
    const restored = path.resolve(data, `../restore-${crypto.randomUUID()}`);
    try {
      const { PGlite } = require('@electric-sql/pglite');
      const db = new PGlite({ dataDir: restored, loadDataDir: new Blob([bytes]) });
      try {
        await db.waitReady;
        await db.query('select id from auth.users limit 1');
        await db.query('select name from public.local_migrations limit 1');
        await db.exec('delete from auth.sessions');
      } finally { await db.close(); }
      let previous;
      if (fs.existsSync(data)) {
        previous = `${data}-antes-${Date.now()}`;
        fs.renameSync(data, previous);
      }
      try { fs.renameSync(restored, data); }
      catch (error) { if (previous) fs.renameSync(previous, data); throw error; }
      console.log('Backup restaurado. O banco anterior foi preservado em .local-data. Entre novamente na sua conta.');
    } finally { release(); }
    return;
  }
  if (!['backup', 'password'].includes(action)) throw new Error('Escolha backup, restore ou password.');
  if (!fs.existsSync(path.join(data, 'PG_VERSION'))) throw new Error('Ainda não existe banco local. Execute npm start e crie uma conta primeiro.');
  const db = await openDatabase();
  try {
    if (action === 'backup') {
      const dump = await db.dumpDataDir('gzip');
      const directory = path.resolve(process.env.FINTHEKA_BACKUP_DIR || path.resolve(__dirname, '../backups'));
      fs.mkdirSync(directory, { recursive: true });
      const file = path.join(directory, `fintheka-${new Date().toISOString().replace(/[:.]/g, '-')}.tar.gz`);
      fs.writeFileSync(file, Buffer.from(await dump.arrayBuffer()), { flag: 'wx' });
      console.log(`Backup criado: ${file}\nContém dados e contas locais. Transporte separadamente do GitHub.`);
    } else {
      const email = String(argument || '').trim().toLowerCase();
      const row = (await db.query('select id from auth.users where email=$1', [email])).rows[0];
      if (!row) throw new Error('Conta não encontrada. Use npm run local:password -- seu@email.com');
      if (!process.stdin.isTTY) throw new Error('Execute em um terminal interativo para digitar a nova senha.');
      const output = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
      const rl = require('node:readline/promises').createInterface({ input: process.stdin, output, terminal: true });
      let password, confirmation;
      try {
        process.stdout.write('Nova senha (12 a 72 caracteres; digitação oculta): ');
        password = await rl.question('');
        process.stdout.write('\nConfirme a senha: ');
        confirmation = await rl.question('');
        process.stdout.write('\n');
      } finally { rl.close(); }
      if (password !== confirmation || password.length < 12 || password.length > 72) throw new Error('As senhas devem coincidir e ter de 12 a 72 caracteres.');
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = (await promisify(crypto.scrypt)(password, salt, 64)).toString('hex');
      await db.transaction(async (tx) => {
        await tx.query('update auth.users set password_salt=$1,password_hash=$2 where id=$3', [salt, hash, row.id]);
        await tx.query('delete from auth.sessions where usuario_id=$1', [row.id]);
      });
      console.log('Senha local atualizada. Entre novamente no site.');
    }
  } finally { await db.close(); }
}
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
