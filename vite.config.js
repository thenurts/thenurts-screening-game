import { defineConfig } from 'vite';

// base './' lets the same bundle run from GitHub Pages, the Shopify page (via public/loader.js) or any static host.
export default defineConfig({
  base: './',
  build: {
    manifest: true,
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1600, // Phaser core chunk is ~1.2 MB minified
    rollupOptions: { output: { manualChunks: (id) => (id.includes('node_modules/phaser') ? 'phaser' : undefined) } },
  },
  server: { host: true },
});
