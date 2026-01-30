import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {

        port: 3000,
        host: '0.0.0.0',
        allowedHosts: true, // Allow external tunnels (Cloudflare/Playit)
        proxy: {
            '/api': {
                target: (() => {
                    try {
                        const settingsPath = path.resolve(__dirname, '../backend/data/settings.json');
                        if (fs.existsSync(settingsPath)) {
                            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
                            if (settings.app.https?.enabled) {
                                return 'https://127.0.0.1:3001';
                            }
                        }
                    } catch (e) {
                        console.warn('Vite proxy failed to read settings.json, falling back to HTTP.');
                    }
                    return 'http://127.0.0.1:3001';
                })(),
                changeOrigin: true,
                secure: false, // Essential for self-signed development certs
            }
        }
      },

      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './src'),
          '@shared': path.resolve(__dirname, '../shared'),
        }
      }
    };
});
