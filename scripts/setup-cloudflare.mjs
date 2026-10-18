import { writeFileSync } from 'node:fs';
import { config, run } from './cloudflare.mjs';
const settings = config(),
  name = settings.name;
let projects = JSON.parse(run(['pages', 'project', 'list', '--json']));
if (!projects.some((p) => (p.name || p['Project Name']) === name)) {
  console.log(
    run([
      'pages',
      'project',
      'create',
      name,
      '--production-branch',
      'main',
      '--compatibility-date',
      settings.compatibility_date,
      '--compatibility-flags',
      'nodejs_compat',
    ]),
  );
}
let databases = JSON.parse(run(['d1', 'list', '--json']));
if (!databases.some((d) => d.name === name)) {
  console.log(run(['d1', 'create', name]));
  databases = JSON.parse(run(['d1', 'list', '--json']));
}
const database = databases.find((d) => d.name === name);
if (!database?.uuid) throw new Error('Cloudflare no devolvió el ID de la base de datos.');
settings.d1_databases[0].database_id = database.uuid;
writeFileSync('wrangler.jsonc', JSON.stringify(settings, null, 2) + '\n');
run(['d1', 'migrations', 'apply', 'DB', '--remote'], { inherit: true });
console.log(
  'Pages y D1 configurados. Los identificadores devueltos por Cloudflare quedaron guardados.',
);
