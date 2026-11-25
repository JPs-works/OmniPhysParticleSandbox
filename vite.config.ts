import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Served under /apps/omniphys-particle-sandbox/ when embedded on jakeparr.dev
// (see scripts/build-projects.mjs in that repo).
export default defineConfig({
  base: '/apps/omniphys-particle-sandbox/',
  plugins: [react(), tailwindcss()],
  worker: { format: 'es' },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    chunkSizeWarningLimit: 1200,
    // lucide-react's barrel opens ~1500 icon files; cap parallel reads so
    // small file-descriptor limits (Cloudflare builds) don't hit EMFILE.
    rollupOptions: { maxParallelFileOps: 100 },
  },
});
