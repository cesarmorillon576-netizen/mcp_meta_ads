import { build } from 'esbuild';
import { mkdirSync, copyFileSync, existsSync, createWriteStream, cpSync, rmSync } from 'fs';
import { get } from 'https';

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
  build({ ...shared, entryPoints: ['src/google_ads/server.ts'], outfile: 'dist/google_ads/server.js' }),
]);
console.log('Build complete → dist/meta_ads/server.js  dist/google_ads/server.js');

copyFileSync('dist/meta_ads/server.js', 'windows_build/meta_ads.js');
copyFileSync('dist/google_ads/server.js', 'windows_build/google_ads.js');
console.log('Copied      → windows_build/meta_ads.js  windows_build/google_ads.js');

// Skills de Claude Code: viajan dentro del paquete para que el instalador
// (setup.ps1) los copie a %USERPROFILE%\.claude\skills durante la instalacion.
if (existsSync('skills')) {
  // Regenerar desde cero para no arrastrar skills renombrados/eliminados.
  rmSync('windows_build/skills', { recursive: true, force: true });
  cpSync('skills', 'windows_build/skills', { recursive: true });
  console.log('Copied      → windows_build/skills/ (playbooks para Claude Code)');
}

// ---------------------------------------------------------------------------
// Portable Node.js for Windows — bundled in the distribution zip so end users
// don't need to install anything. Signed official binary from nodejs.org.
// ---------------------------------------------------------------------------
const NODE_VERSION = 'v20.18.2';
const NODE_EXE_URL = `https://nodejs.org/dist/${NODE_VERSION}/win-x64/node.exe`;
const NODE_EXE_PATH = 'windows_build/node.exe';

if (existsSync(NODE_EXE_PATH)) {
  console.log('Skipping    → windows_build/node.exe already present');
} else {
  process.stdout.write(`Downloading Node.js ${NODE_VERSION} for Windows (~27 MB)... `);
  try {
    await downloadFile(NODE_EXE_URL, NODE_EXE_PATH);
    console.log('Done');
    console.log('Downloaded  → windows_build/node.exe');
  } catch (err) {
    console.error(`\nERROR: Could not download node.exe: ${err.message}`);
    console.error(`Manually download from: ${NODE_EXE_URL}`);
    console.error('and place it in windows_build/node.exe');
    process.exit(1);
  }
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);

    function request(targetUrl) {
      get(targetUrl, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          request(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          file.destroy();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const total = parseInt(res.headers['content-length'] ?? '0', 10);
        let received = 0;
        res.on('data', (chunk) => {
          received += chunk.length;
          if (total > 0) {
            process.stdout.write(`\r  ${(received / 1024 / 1024).toFixed(1)} / ${(total / 1024 / 1024).toFixed(1)} MB  `);
          }
        });
        res.pipe(file);
        file.on('finish', () => { file.close(); process.stdout.write('\n'); resolve(); });
        file.on('error', (e) => { file.destroy(); reject(e); });
      }).on('error', reject);
    }

    request(url);
  });
}
