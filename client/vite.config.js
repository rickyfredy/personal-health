import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Reads the root .env so the dev proxy follows the same PORT the API uses.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../', '');
  const apiPort = env.PORT || 3001;

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': `http://localhost:${apiPort}`
      }
    },
    build: { outDir: 'dist' }
  };
});