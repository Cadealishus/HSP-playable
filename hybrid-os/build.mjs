// Bundles src/ into one self-contained page: dist/hybrid-os.html (React from cdnjs)
// and build/test.html (React inlined, full document) for local browser testing.
import * as esbuild from 'esbuild';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const reactGlobals = {
  name: 'react-globals',
  setup(b) {
    b.onResolve({ filter: /^react(-dom)?(\/.*)?$/ }, (a) => ({ path: a.path, namespace: 'global' }));
    b.onLoad({ filter: /.*/, namespace: 'global' }, (a) => ({
      contents: a.path.startsWith('react-dom') ? 'module.exports = window.ReactDOM' : 'module.exports = window.React',
      loader: 'js',
    }));
  },
};

fs.mkdirSync('build', { recursive: true });
await esbuild.build({
  entryPoints: ['src/main.jsx'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  outfile: 'build/app.js',
  plugins: [reactGlobals],
  inject: ['src/react-shim.js'],
  jsxFactory: 'React.createElement',
  jsxFragment: 'React.Fragment',
  loader: { '.js': 'jsx' },
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
});
execSync('npx tailwindcss -i src/styles.css -o build/app.css --minify', { stdio: 'pipe' });

const js = fs.readFileSync('build/app.js', 'utf8').replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync('build/app.css', 'utf8');
const fonts = 'https://fonts.googleapis.com/css2?family=Sora:wght@200;300;400;500;600;700&family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap';
const head = `<title>HYBRID OS</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${fonts}">
<style>${css}</style>`;
const body = `<div id="root"></div>`;

const page = `${head}
${body}
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script>${js}</script>
`;
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/hybrid-os.html', page);

const r = fs.readFileSync('node_modules/react/umd/react.production.min.js', 'utf8');
const rd = fs.readFileSync('node_modules/react-dom/umd/react-dom.production.min.js', 'utf8');
fs.writeFileSync('build/test.html', `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${head}</head><body>${body}<script>${r}</script><script>${rd}</script><script>${js}</script></body></html>`);
console.log(`dist/hybrid-os.html  ${(page.length / 1024).toFixed(0)} KB`);
