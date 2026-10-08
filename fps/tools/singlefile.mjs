// Post-step for the single-file build: inline the bundle into index.html as a
// classic <script> at the end of <body> (a classic script runs on file://).
import { readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
const dir = 'dist-single';
let html = readFileSync(`${dir}/index.html`, 'utf8');
const m = html.match(/<script type="module"[^>]*src="\.?\/?(assets\/[^"]+\.js)"[^>]*><\/script>/);
if (!m) throw new Error('entry script tag not found');
const js = readFileSync(`${dir}/${m[1]}`, 'utf8').replace(/<\/script/gi, '<\\/script');
html = html.replace(m[0], '').replace(/<link rel="modulepreload"[^>]*>/g, '');
html = html.replace(/<\/body>/i, `<script>${js}</script>\n</body>`);
writeFileSync(`${dir}/index.html`, html);
rmSync(`${dir}/assets`, { recursive: true, force: true });
for (const f of readdirSync(dir)) if (f !== 'index.html') rmSync(`${dir}/${f}`, { recursive: true, force: true });
console.log(`dist-single/index.html ${(html.length / 1048576).toFixed(2)} MB`);
