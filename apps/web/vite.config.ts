import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: Number(process.env.WEB_PORT ?? 5173),
    strictPort: true,
    proxy: { '/api': process.env.API_URL ?? 'http://127.0.0.1:4310' },
  },
  preview: { host: '127.0.0.1', port: Number(process.env.WEB_PORT ?? 5173), strictPort: true },
});
