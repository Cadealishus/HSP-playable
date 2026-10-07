# Bottle Realism Comparison Viewer

A standalone viewer for choosing the FLOP OPS graphics style. One reference bottle
(identical shape, size, colours, cap, label and fill level, see `src/spec.js`) built three ways:

| Version | Built from |
|---|---|
| **Current FLOP OPS** | `tools/gen/build-flopops.js`: the game's prop method (CylinderGeometry, 10/8 sides), the game's own glass + rubber texture bakes from `fps/src/materials` (read-only), 300 px/m canvas label |
| **Call of Duty-inspired** | `tools/gen/build-aaa.js`: lathed glass with wall thickness, transmission, knurled cap, 1K maps |
| **Bodycam-inspired** | `tools/gen/build-bodycam.js`: thick refractive glass with dispersion, punt, seams, fingerprints/dust, fibrous torn label, 2K maps |

Nothing in the game (`fps/`) is modified.

## Launch

```
cd bottle-viewer
node serve.mjs          # no npm install needed
```
Open http://localhost:5180 (Chrome or Edge recommended). Any static server also works
(`npx serve`, `python -m http.server`): it must serve this folder, not open `index.html` as a file.

## Use

- Toolbar: side-by-side / single-bottle inspect, lighting preset (studio, outdoor, dim indoor),
  shading channel (final, base colour, normal, ORM, UV checker), auto-rotate, wireframe,
  post-processing on/off, bodycam camera effect (off by default, needs post on), reset camera, screenshot.
- Drag to orbit, scroll to zoom: all bays stay in sync.
- **Metrics**: per-bottle triangles, vertices, meshes, materials, draw calls, textures, download size,
  estimated texture memory, measured load times.
- **Benchmark**: isolated per-version runs at a fixed resolution, 1 / 25 / 100 bottles. Run it on the PC you play on.
- **Generation usage**: measured authoring and generator times; type in real token/credit figures.
- **Report**: export Markdown or JSON with every value marked measured / estimate / static / not available.

## Files

- `assets/<version>/bottle.glb`: the editable asset (glTF 2.0, opens in Blender)
- `assets/<version>/textures/*.png`: editable texture sources
- `assets/<version>/manifest.json`: texture list and generation timings
- `generation/`: run log, authoring timestamps, compiled usage
- `vendor/three/`: three.js r180, copied from the game so versions match

## Regenerate an asset

```
node tools/build-assets.mjs flopops|aaa|bodycam   # needs ../fps/node_modules (playwright) and Chromium
node tools/compile-usage.mjs
```
