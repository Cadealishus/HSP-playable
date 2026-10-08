// Single-file build: ONE index.html you can double-click (file://). Chrome blocks
// module scripts, dynamic imports and font fetches on file://, so everything is
// bundled into one classic IIFE (dynamic map/mission chunks inlined) and assets
// are inlined as data URIs. `npm run build:single` → dist-single/index.html
import base from '../vite.config.js';
export default {
  ...base,
  build: {
    ...base.build,
    outDir: 'dist-single',
    emptyOutDir: true,
    assetsInlineLimit: 1e9,
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: { output: { format: 'iife', inlineDynamicImports: true } },
  },
};
