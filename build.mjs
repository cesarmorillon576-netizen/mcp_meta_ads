import { build } from 'esbuild';
import { mkdirSync } from 'fs';

mkdirSync('dist/meta_ads', { recursive: true });
mkdirSync('dist/google_ads', { recursive: true });

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: false,
  minify: false,
};

await Promise.all([
  build({ ...shared, entryPoints: ['src/meta_ads/server.ts'], outfile: 'dist/meta_ads/server.js' }),
  build({ ...shared, entryPoints: ['src/meta_ads/server_http.ts'], outfile: 'dist/meta_ads/server_http.js' }),
  build({ ...shared, entryPoints: ['src/google_ads/stdio.ts'], outfile: 'dist/google_ads/server.js' }),
]);
console.log('Build complete → dist/meta_ads/server.js  dist/meta_ads/server_http.js  dist/google_ads/server.js');
