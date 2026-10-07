// =====================================================
// 手動測試工具：npm run check:ai
// 對本機 server 送出 Hero case，印出結果
// =====================================================

const BASE_URL = 'http://localhost:8787'

const heroCase = {
  buyerId: 'buyer-a',
  dealAmount: 5000000,
  paymentTermDays: 90,
  depositRatio: 0,
}

try {
  const health = await fetch(`${BASE_URL}/api/health`).then((r) => r.json())
  console.log('\n[1] Server 狀態')
  console.log(`    AI 設定：${health.aiConfigured ? '已設定 API key' : '未設定 API key'}`)
  console.log(`    模型：${health.model}`)

  const response = await fetch(`${BASE_URL}/api/explain`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(heroCase),
  })
  const result = await response.json()

  console.log('\n[2] Hero case：Bright Components，NT$5,000,000，Net90，0% 訂金')
  console.log(`    區域（M2 引擎）：${result.zone}`)
  console.log(`    說明來源：${result.source === 'ai' ? 'AI 整理' : '依規則產生（fallback）'}`)
  if (result.fallbackReason) {
    console.log(`    Fallback 原因：${result.fallbackReason}`)
  }

  console.log('\n[3] 說明內容')
  console.log(`    summary：${result.explanation.summary}`)
  console.log(`    buyer_status：${result.explanation.buyer_status}`)
  console.log(`    deal_status：${result.explanation.deal_status}`)
  result.explanation.key_reasons.forEach((reason, index) => {
    console.log(`    key_reasons ${index + 1}：${reason}`)
  })
  console.log(`    human_note：${result.explanation.human_note}\n`)
} catch {
  console.log('\n無法連線到 server。請確認另一個 PowerShell 視窗已執行 npm run server。\n')
}
