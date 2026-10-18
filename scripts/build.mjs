import { build as viteBuild } from 'vite';
import { build as bundle } from 'esbuild';
import { writeFile } from 'node:fs/promises';
await viteBuild();
await bundle({
  entryPoints: ['server/worker.mjs'],
  outfile: 'dist/_worker.js',
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  external: ['node:crypto'],
  minify: true,
});
await writeFile(
  'dist/_routes.json',
  JSON.stringify({ version: 1, include: ['/api/*'], exclude: [] }, null, 2),
);
console.log('Frontend and Pages API built.');
