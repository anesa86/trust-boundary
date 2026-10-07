import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // 網頁的 /api 請求轉給本機 AI 說明 server（npm run server）
    // API key 只在 server 端，瀏覽器永遠拿不到
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
})
