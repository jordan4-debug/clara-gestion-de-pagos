import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
await import('./build.mjs');
const cli = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const processHandle = spawn(
  process.execPath,
  [cli, 'pages', 'dev', 'dist', '--ip', '127.0.0.1', '--port', '8788', '--inspector-port', '0'],
  { stdio: 'inherit' },
);
processHandle.on('exit', (code) => {
  process.exitCode = code || 0;
});
process.on('SIGINT', () => processHandle.kill('SIGINT'));
