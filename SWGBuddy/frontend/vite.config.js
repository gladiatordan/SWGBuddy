import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  return {
    plugins: [react()],
    
    // CONDITIONAL BASE:
    // - In Dev ('serve'): Use root '/' so localhost:5173/resources works
    // - In Prod ('build'): Use '/static/' so Flask finds the assets
    base: command === 'build' ? '/static/' : '/', 

    build: {
      outDir: 'dist',
      assetsDir: 'assets',
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:5000',
          changeOrigin: true,
          secure: false,
        },
        '/login': 'http://127.0.0.1:5000',
        '/logout': 'http://127.0.0.1:5000',
        '/callback': 'http://127.0.0.1:5000'
      }
    }
  }
})
