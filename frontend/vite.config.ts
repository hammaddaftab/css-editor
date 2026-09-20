import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    // Output goes straight into FastAPI's static directory
    outDir: resolve(__dirname, '../static'),
    emptyOutDir: false, // don't nuke print.css / app.css

    rollupOptions: {
      input: resolve(__dirname, 'src/main.tsx'),
      output: {
        format: 'es',

        // Single predictable filename — the HTML template can hardcode it
        entryFileNames: 'js/bundle.js',

        // Inline all dynamic imports so we ship one file, not a chunk graph
        // (works fine here — no circular deps in CM6 or our code)
        inlineDynamicImports: true,
      },
    },

    // Don't extract / process CSS — we manage app.css and print.css manually
    cssCodeSplit: false,

    // Readable output is fine for a dev tool
    minify: false,
    sourcemap: true,
  },
});
