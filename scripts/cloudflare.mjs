import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
export const cli = fileURLToPath(
  new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url),
);
export const config = () => {
  const result = ts.parseConfigFileTextToJson(
    'wrangler.jsonc',
    readFileSync('wrangler.jsonc', 'utf8'),
  );
  if (result.error) throw new Error('No se pudo leer wrangler.jsonc.');
  return result.config;
};
export function run(args, { inherit = false } = {}) {
  return execFileSync(process.execPath, [cli, ...args], {
    encoding: 'utf8',
    stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      CI: 'true',
      WRANGLER_SEND_METRICS: 'false',
      CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID || JSON.parse(readFileSync('cloudflare-account.json','utf8')).account_id,
    },
  });
}
