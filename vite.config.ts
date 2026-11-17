import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// SEGURIDAD: Nunca inyectar llaves privadas (como GEMINI_API_KEY) mediante `define`.
// Las llamadas a modelos de IA y tokens efímeros de voz se gestionan desde Firebase Cloud Functions.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    emptyOutDir: true
  },
  server: {
    port: 3000
  }
});
