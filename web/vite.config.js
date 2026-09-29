import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the Vite server forwards API and map requests to the Node
// API on :4000, so the browser only ever sees one origin (same as production,
// where Nginx does this job).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/geoserver': 'http://localhost:4000',
    },
  },
});
