// =====================================================
// AI 說明服務測試（不連網路，用假的 fetch 模擬各種狀況）
// =====================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { explainDeal } from './explainService.js'

const heroCase = { buyerId: 'buyer-a', dealAmount: 5000000, paymentTermDays: 90, depositRatio: 0 }

const goodExplanation = {
  summary: '本次交易目前超出建議授信範圍。',
  buyer_status: 'Bright Components 信用狀態 B，整體穩定。',
  deal_status: '交易後政策調整曝險 NT$6,500,000，高於建議上限 NT$5,500,000。',
  key_reasons: ['本次金額為典型交易的 5.0 倍', '帳期較典型增加 60 天'],
  human_note: 'Buyer 本身沒有明顯信用惡化，差異來自交易條件。',
}

function fakeFetch(body, { ok = true, status = 200 } = {}) {
  return async () => ({ ok, status, json: async () => body })
}

function responsesBody(text) {
  return { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text }] }] }
}

test('AI server：沒有 API key → fallback，M2 判定仍為 outside', async () => {
  const result = await explainDeal(heroCase, { apiKey: '' })
  assert.equal(result.status, 200)
  assert.equal(result.payload.source, 'fallback')
  assert.equal(result.payload.fallbackReason, 'missing-api-key')
  assert.equal(result.payload.zone, 'outside')
  assert.equal(typeof result.payload.explanation.summary, 'string')
})

test('AI server：AI 回傳正確格式 → source 為 ai', async () => {
  const result = await explainDeal(heroCase, {
    apiKey: 'test-key',
    fetchImpl: fakeFetch(responsesBody(JSON.stringify(goodExplanation))),
  })
  assert.equal(result.payload.source, 'ai')
  assert.deepEqual(result.payload.explanation, goodExplanation)
  assert.equal(result.payload.zone, 'outside')
})

test('AI server：API 錯誤、格式不符、網路失敗 → 都回傳 fallback', async () => {
  const apiError = await explainDeal(heroCase, { apiKey: 'k', fetchImpl: fakeFetch({}, { ok: false, status: 401 }) })
  assert.equal(apiError.payload.fallbackReason, 'api-error-401')

  const extraField = { ...goodExplanation, credit_limit: 'NT$9,999,999' }
  const mismatch = await explainDeal(heroCase, { apiKey: 'k', fetchImpl: fakeFetch(responsesBody(JSON.stringify(extraField))) })
  assert.equal(mismatch.payload.fallbackReason, 'schema-mismatch')

  const network = await explainDeal(heroCase, {
    apiKey: 'k',
    fetchImpl: async () => {
      throw new TypeError('fetch failed')
    },
  })
  assert.equal(network.payload.fallbackReason, 'network-error')

  for (const result of [apiError, mismatch, network]) {
    assert.equal(result.payload.source, 'fallback')
    assert.equal(result.payload.zone, 'outside')
  }
})

test('AI server：不允許的交易條件 → 400，不呼叫 AI', async () => {
  let called = false
  const fetchImpl = async () => {
    called = true
  }
  const badTerm = await explainDeal({ ...heroCase, paymentTermDays: 75 }, { apiKey: 'k', fetchImpl })
  const badDeposit = await explainDeal({ ...heroCase, depositRatio: 0.35 }, { apiKey: 'k', fetchImpl })
  const badAmount = await explainDeal({ ...heroCase, dealAmount: 5000001 }, { apiKey: 'k', fetchImpl })
  assert.equal(badTerm.status, 400)
  assert.equal(badDeposit.status, 400)
  assert.equal(badAmount.status, 400)
  assert.equal(called, false)
})
