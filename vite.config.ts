import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// SEGURIDAD: Nunca inyectar llaves privadas (como GEMINI_API_KEY) mediante `define`.
// Las llamadas a modelos de IA y tokens efímeros de voz se gestionan desde Firebase Cloud Functions.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-firebase': ['firebase/app', 'firebase/firestore', 'firebase/storage', 'firebase/auth', 'firebase/app-check'],
          'vendor-charts': ['recharts'],
          'vendor-pdf': ['jspdf', 'jspdf-autotable'],
          'vendor-ai': ['@google/genai'],
        }
      }
    }
  },
  server: {
    port: 3000
  }
});
