import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { UserConfig, defineConfig } from 'vite';
import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from "url";
import process from 'node:process'
// Load environment variables from .env file
loadEnv();

let config: UserConfig = {};
const proxyOptions = {
  target: `http://127.0.0.1:${process.env.BACKEND_PORT}`,
  changeOrigin: false,
  secure: true,
  ws: false,
};

const host = process.env.HOST
  ? process.env.HOST.replace(/https?:\/\//, "")
  : "localhost";
console.log("host", host)
let hmrConfig;
if (host === "localhost") {
  hmrConfig = {
    protocol: "ws",
    host: "localhost",
    port: process.env.FRONTEND_PORT ? parseInt(process.env.FRONTEND_PORT) : 64999,
    clientPort: process.env.FRONTEND_PORT ? parseInt(process.env.FRONTEND_PORT) : 64999,
  };
} else {
  hmrConfig = {
    protocol: "wss",
    host: host,
    port: parseInt(process.env.FRONTEND_PORT as string),
    clientPort: 443,
  };
}
// https://vitejs.dev/config/
config = {
  root: dirname(fileURLToPath(import.meta.url)),
  plugins: [
    react(),
    tsconfigPaths(),
  ],
  define: {
    "process.env.SHOPIFY_API_KEY": JSON.stringify(process.env.VITE_SHOPIFY_CLIENT_ID),
  },
  resolve: {
    alias: {
      '@assets': resolve(__dirname, './public/assets'),
      '@data': resolve(__dirname, './src/data'),
      '@hooks': resolve(__dirname, './src/Hooks'),
    },
    preserveSymlinks: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            return id.toString().split('node_modules/')[1].split('/')[0].toString();
          }

          const extension = id.split('.').pop();
          if (extension && extension?.indexOf("css") > -1) {
            return 'styles.css';
          }
        }
      }
    }
  },
  server: {
    host: "localhost",
    port: parseInt((process.env.FRONTEND_PORT ?? process.env.PORT) as string),
    hmr: hmrConfig,
    proxy: {
      "^/api(/|(\\?.*)?$)": proxyOptions,
      '/ComfyBackendDirect': {
        target: 'https://swarm.matbee.com',
        changeOrigin: true,
        ws: true,
        secure: false
      },
      '/segment': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        ws: false,
        secure: false
      },
      '/generate-model': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        ws: false,
        secure: false
      },
    },
  },
};
export default defineConfig(config);