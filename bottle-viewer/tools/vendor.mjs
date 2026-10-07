// Copies the game's exact three.js build (fps/node_modules/three, r180) plus only the
// addon modules the viewer and generator import, following their relative imports.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
const SRC = resolve('../fps/node_modules/three');
const OUT = resolve('vendor/three');
const entry = [
  'controls/OrbitControls.js', 'loaders/GLTFLoader.js', 'exporters/GLTFExporter.js',
  'environments/RoomEnvironment.js', 'postprocessing/EffectComposer.js', 'postprocessing/RenderPass.js',
  'postprocessing/ShaderPass.js', 'postprocessing/OutputPass.js', 'postprocessing/UnrealBloomPass.js',
  'utils/BufferGeometryUtils.js', 'geometries/RoundedBoxGeometry.js',
];
const seen = new Set();
function copyAddon(rel) {
  if (seen.has(rel)) return; seen.add(rel);
  const from = join(SRC, 'examples/jsm', rel), to = join(OUT, 'addons', rel);
  mkdirSync(dirname(to), { recursive: true }); copyFileSync(from, to);
  const code = readFileSync(from, 'utf8');
  for (const m of code.matchAll(/from\s+['"](\.{1,2}\/[^'"]+)['"]/g)) copyAddon(relative(join(SRC, 'examples/jsm'), resolve(dirname(from), m[1])));
}
mkdirSync(join(OUT, 'build'), { recursive: true });
for (const f of ['three.module.js', 'three.core.js']) copyFileSync(join(SRC, 'build', f), join(OUT, 'build', f));
copyFileSync(join(SRC, 'LICENSE'), join(OUT, 'LICENSE'));
entry.forEach(copyAddon);
const pkg = JSON.parse(readFileSync(join(SRC, 'package.json'), 'utf8'));
writeFileSync(join(OUT, 'VERSION.txt'), `three ${pkg.version} (copied from the game's fps/node_modules)\n` + [...seen].sort().join('\n') + '\n');
console.log('three', pkg.version, 'addons', seen.size);
