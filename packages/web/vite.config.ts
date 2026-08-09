import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    proxy: {
      // API beží vedľa; proxy nám ušetrí CORS aj absolútne URL v kóde
      '/api': 'http://127.0.0.1:3001',
    },
  },
});
