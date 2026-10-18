import { run, config } from './cloudflare.mjs';
if (config().d1_databases[0].database_id === '00000000-0000-4000-8000-000000000000')
  throw new Error('Ejecuta primero npm run deploy:setup.');
await import('./build.mjs');
run(['d1', 'migrations', 'apply', 'DB', '--remote'], { inherit: true });
run(
  [
    'pages',
    'deploy',
    'dist',
    '--project-name',
    config().name,
    '--branch',
    'main',
    '--commit-dirty=true',
  ],
  { inherit: true },
);
