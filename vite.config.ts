import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served under /apps/omniphys-particle-sandbox/ when embedded on jakeparr.dev
// (see scripts/build-projects.mjs in that repo). Still works standalone at /
// for local dev via `npm run dev`.
export default defineConfig({
  base: '/apps/omniphys-particle-sandbox/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
