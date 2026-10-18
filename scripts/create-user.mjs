import { createInterface } from 'node:readline/promises';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { hashPassword } from '../server/passwords.mjs';
import { run } from './cloudflare.mjs';
const target = process.argv[2];
if (!['--local', '--remote'].includes(target))
  throw new Error('Indica --local o --remote para seleccionar la base.');
if (!process.stdin.isTTY)
  throw new Error(
    'Ejecuta este comando en una terminal interactiva para escribir la contraseña sin mostrarla.',
  );
const rl = createInterface({ input: process.stdin, output: process.stdout });
const email = (await rl.question('Correo de la cuenta: ')).trim().toLowerCase();
const name = (await rl.question('Nombre: ')).trim();
const role = (await rl.question('Rol (owner / assistant): ')).trim();
rl.close();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name || !['owner', 'assistant'].includes(role))
  throw new Error('Revisa correo, nombre y rol.');
async function secret(prompt) {
  process.stdout.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  return new Promise((resolve, reject) => {
    let value = '';
    const onData = (chunk) => {
      for (const c of chunk) {
        if (c === '\u0003') {
          finish();
          reject(new Error('Cancelado.'));
          return;
        }
        if (c === '\r' || c === '\n') {
          finish();
          resolve(value);
          return;
        }
        if (c === '\u007f' || c === '\b') {
          value = value.slice(0, -1);
        } else if (c >= ' ') value += c;
      }
    };
    const finish = () => {
      process.stdin.off('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
    };
    process.stdin.on('data', onData);
  });
}
const password = await secret('Contraseña nueva (no se muestra): '),
  confirmation = await secret('Repite la contraseña: ');
if (password.length < 12 || password.length > 128 || password !== confirmation)
  throw new Error('Las contraseñas deben coincidir y tener entre 12 y 128 caracteres.');
const sql = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const hash = await hashPassword(password);
mkdirSync('.local', { recursive: true });
const file = '.local/account-seed.sql';
try {
  writeFileSync(
    file,
    `INSERT INTO accounts(email,name,role,password_hash,demo) VALUES(${sql(email)},${sql(name)},${sql(role)},${sql(hash)},0);`,
    { mode: 0o600 },
  );
  run(['d1', 'execute', 'DB', target, '--file', file], { inherit: true });
  console.log('Cuenta creada. Usa el formulario de inicio de sesión.');
} finally {
  unlinkSync(file);
}
