// Builds the deployable site in _site/ and stamps the service worker.
//
// BUILD is a hash of the app's own files (not the data), so publishing a new
// catalogue never forces phones to re-download the app, while any code change
// always ships as a new, complete offline copy.

import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, '_site');
const SHIP = ['index.html', 'manifest.webmanifest', 'sw.js', '.nojekyll', 'src', 'assets', 'data'];
// Loaded only when needed and cached on first use, so they stay out of the install.
const LAZY = ['src/vendor/xlsx.mini.min.js', 'src/vendor/barcode-detector.js', 'src/vendor/zxing_reader.wasm', 'src/vendor/pdfjs/pdf.min.mjs', 'src/vendor/pdfjs/pdf.worker.min.mjs'];

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
for (const item of SHIP) {
  try { cpSync(join(ROOT, item), join(OUT, item), { recursive: true }); } catch { /* optional */ }
}

const shell = ['index.html', 'manifest.webmanifest', ...walk(join(OUT, 'src')).map((p) => relative(OUT, p)), ...walk(join(OUT, 'assets')).map((p) => relative(OUT, p))]
  .filter((p) => !LAZY.includes(p) && !p.endsWith('.DS_Store'))
  .sort();

const hash = createHash('sha256');
for (const p of shell) hash.update(p).update(readFileSync(join(OUT, p)));
hash.update(readFileSync(join(ROOT, 'sw.js')));
const build = hash.digest('hex').slice(0, 12);

const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8')
  .replace("const BUILD = 'dev';", `const BUILD = '${build}';`)
  .replace('[/*__ASSETS__*/]', JSON.stringify(shell.map((p) => './' + p)));
writeFileSync(join(OUT, 'sw.js'), sw);
console.log(`build ${build} · ${shell.length} files precached`);
