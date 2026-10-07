// =====================================================
// 信任邊界 AI 說明 server
// 啟動方式：npm run server
// =====================================================
// API key 只在這裡讀取（server 端 .env），絕不送到瀏覽器。

import process from 'node:process'
import express from 'express'
import { explainDeal } from './explainService.js'

// 讀取專案根目錄的 .env；沒有 .env 也能啟動，AI 會自動改用 fallback
try {
  process.loadEnvFile('.env')
} catch {
  console.log('找不到 .env，AI 說明將使用 fallback（依規則產生）')
}

const PORT = Number(process.env.PORT) || 8787
const app = express()

app.use(express.json({ limit: '10kb' }))

// 健康檢查：只回報「有沒有設定 key」，不回報 key 內容
app.get('/api/health', (request, response) => {
  response.json({
    ok: true,
    aiConfigured: Boolean(process.env.OPENAI_API_KEY),
    model: process.env.OPENAI_MODEL || 'gpt-6-luna（預設）',
  })
})

app.post('/api/explain', async (request, response) => {
  const result = await explainDeal(request.body, {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL,
  })

  if (result.payload.source === 'fallback') {
    console.log(`AI 說明改用 fallback：${result.payload.fallbackReason}`)
    if (result.debugDetail) {
      console.log(`OpenAI 錯誤說明：${result.debugDetail}`)
    }
  }
  response.status(result.status).json(result.payload)
})

// JSON 格式錯誤等例外：回傳清楚訊息，不洩漏內部細節
app.use((error, request, response, next) => {
  if (response.headersSent) {
    return next(error)
  }
  response.status(400).json({ error: '請求格式錯誤' })
})

app.listen(PORT, () => {
  console.log(`信任邊界 server 已啟動：http://localhost:${PORT}`)
  console.log(`AI 說明：${process.env.OPENAI_API_KEY ? '已設定 API key' : '未設定 API key（使用 fallback）'}`)
})
