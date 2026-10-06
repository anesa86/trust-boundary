// =====================================================
// Decision Engine 自動測試
// 執行方式：npm test
// =====================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  calculateUnsecuredExposure,
  getTermPolicyFactor,
  calculatePolicyAdjustedExposure,
  classifyExposureZone,
  requiresManualReview,
  evaluateDeal,
  findFeasibleAdjustments,
} from './decisionEngine.js'
import { policy } from '../data/policy.js'
import { buyers } from '../data/buyers.js'

// 從 Prototype 模擬資料中取出三個 Buyer
const buyerA = buyers.find((b) => b.id === 'buyer-a')
const buyerB = buyers.find((b) => b.id === 'buyer-b')
const buyerC = buyers.find((b) => b.id === 'buyer-c')

// -----------------------------------------------------
// calculateUnsecuredExposure：未擔保曝險
// -----------------------------------------------------

test('未擔保曝險：0% 訂金時，等於交易金額', () => {
  assert.equal(calculateUnsecuredExposure(5000000, 0), 5000000)
})

test('未擔保曝險：20% 訂金', () => {
  assert.equal(calculateUnsecuredExposure(5000000, 0.2), 4000000)
})

test('未擔保曝險：30% 訂金', () => {
  assert.equal(calculateUnsecuredExposure(5000000, 0.3), 3500000)
})

// -----------------------------------------------------
// getTermPolicyFactor：帳期政策係數
// 來源為 Prototype company credit policy，不是 AI 預測
// -----------------------------------------------------

test('帳期政策係數：Net30 → 1.00', () => {
  assert.equal(getTermPolicyFactor(30, policy), 1.00)
})

test('帳期政策係數：Net45 → 1.05', () => {
  assert.equal(getTermPolicyFactor(45, policy), 1.05)
})

test('帳期政策係數：Net60 → 1.10', () => {
  assert.equal(getTermPolicyFactor(60, policy), 1.10)
})

test('帳期政策係數：Net90 → 1.20', () => {
  assert.equal(getTermPolicyFactor(90, policy), 1.20)
})

test('帳期政策係數：不允許的帳期（75 天）必須報錯，不可自行推測', () => {
  assert.throws(
    () => getTermPolicyFactor(75, policy),
    /75/,
  )
})

// -----------------------------------------------------
// calculatePolicyAdjustedExposure：政策調整後總曝險
// E = currentExposure + U × termPolicyFactor
// -----------------------------------------------------

test('政策調整後曝險：Hero case（Buyer A，500 萬、Net90、0% 訂金）', () => {
  const result = calculatePolicyAdjustedExposure(
    {
      dealAmount: 5000000,
      depositRatio: 0,
      paymentTermDays: 90,
      currentExposure: 500000,
    },
    policy,
  )

  assert.deepEqual(result, {
    unsecuredExposure: 5000000,
    termPolicyFactor: 1.20,
    policyAdjustedDealExposure: 6000000,
    policyAdjustedExposure: 6500000,
  })
})

test('政策調整後曝險：既有曝險不可套用新 Deal 的帳期係數', () => {
  const result = calculatePolicyAdjustedExposure(
    {
      dealAmount: 1000000,
      depositRatio: 0,
      paymentTermDays: 90,
      currentExposure: 1000000,
    },
    policy,
  )

  // 正確：100 萬 + 100 萬 × 1.2 = 220 萬
  // 錯誤寫法 (100 萬 + 100 萬) × 1.2 會得到 240 萬
  assert.equal(result.policyAdjustedExposure, 2200000)
})

test('政策調整後曝險：有訂金 + Net30', () => {
  const result = calculatePolicyAdjustedExposure(
    {
      dealAmount: 800000,
      depositRatio: 0.2,
      paymentTermDays: 30,
      currentExposure: 1000000,
    },
    policy,
  )

  // 80 萬 × 0.8 = 64 萬；× 1.00 = 64 萬；+ 100 萬 = 164 萬
  assert.equal(result.unsecuredExposure, 640000)
  assert.equal(result.policyAdjustedDealExposure, 640000)
  assert.equal(result.policyAdjustedExposure, 1640000)
})

test('政策調整後曝險：不允許的帳期必須報錯', () => {
  assert.throws(
    () =>
      calculatePolicyAdjustedExposure(
        {
          dealAmount: 1000000,
          depositRatio: 0,
          paymentTermDays: 75,
          currentExposure: 0,
        },
        policy,
      ),
    /75/,
  )
})

// -----------------------------------------------------
// classifyExposureZone：區域判定
// Buyer A：baseCreditCapacity = 5,500,000
// recommendedLimit = 5,500,000
// reviewLimit = 5,500,000 × 1.15 = 6,325,000
// -----------------------------------------------------

test('區域判定：Hero case 650 萬 → outside', () => {
  assert.deepEqual(classifyExposureZone(6500000, 5500000, policy), {
    zone: 'outside',
    recommendedLimit: 5500000,
    reviewLimit: 6325000,
  })
})

test('區域判定：剛好等於建議界線 → recommended', () => {
  assert.equal(classifyExposureZone(5500000, 5500000, policy).zone, 'recommended')
})

test('區域判定：超過建議界線 1 元 → review', () => {
  assert.equal(classifyExposureZone(5500001, 5500000, policy).zone, 'review')
})

test('區域判定：剛好等於覆核界線 → review（小數誤差陷阱）', () => {
  assert.equal(classifyExposureZone(6325000, 5500000, policy).zone, 'review')
})

test('區域判定：超過覆核界線 1 元 → outside', () => {
  assert.equal(classifyExposureZone(6325001, 5500000, policy).zone, 'outside')
})

test('區域判定：Buyer B 覆核界線為整數 3,680,000', () => {
  assert.equal(classifyExposureZone(0, 3200000, policy).reviewLimit, 3680000)
})

// -----------------------------------------------------
// requiresManualReview：是否需要人工覆核
// 規則：riskConfidence === 'low' → true
// 與區域判定是兩個獨立維度
// -----------------------------------------------------

test('人工覆核：Buyer A（可信度 high）→ 不需要', () => {
  assert.equal(requiresManualReview(buyerA), false)
})

test('人工覆核：Buyer B（可信度 high）→ 不需要', () => {
  assert.equal(requiresManualReview(buyerB), false)
})

test('人工覆核：Buyer C（可信度 low）→ 需要', () => {
  assert.equal(requiresManualReview(buyerC), true)
})

test('人工覆核：Buyer C 即使落在 recommended 區，仍需要人工覆核', () => {
  // Buyer C 小額交易：50 萬、Net30、0% 訂金
  const exposure = calculatePolicyAdjustedExposure(
    {
      dealAmount: 500000,
      depositRatio: 0,
      paymentTermDays: 30,
      currentExposure: buyerC.currentExposure,
    },
    policy,
  )
  const zoneResult = classifyExposureZone(
    exposure.policyAdjustedExposure,
    buyerC.baseCreditCapacity,
    policy,
  )

  // 曝險：0 + 50 萬 × 1.00 = 50 萬 ≤ 80 萬 → recommended
  assert.equal(zoneResult.zone, 'recommended')
  // 但資料可信度低，仍不可視為自動核准
  assert.equal(requiresManualReview(buyerC), true)
})

// -----------------------------------------------------
// Hero Case integration test
// Buyer A：500 萬、Net90、0% 訂金
// -----------------------------------------------------

test('Hero case 整合測試：評估結果 + 三種單一變數調整', () => {
  const heroDeal = { dealAmount: 5000000, paymentTermDays: 90, depositRatio: 0 }

  const evaluation = evaluateDeal(buyerA, heroDeal, policy)
  assert.equal(evaluation.unsecuredExposure, 5000000)
  assert.equal(evaluation.termPolicyFactor, 1.20)
  assert.equal(evaluation.policyAdjustedExposure, 6500000)
  assert.equal(evaluation.baseCreditCapacity, 5500000)
  assert.equal(evaluation.reviewLimit, 6325000)
  assert.equal(evaluation.zone, 'outside')
  assert.equal(evaluation.requiresManualReview, false)

  const adjustments = findFeasibleAdjustments(buyerA, heroDeal, policy)
  assert.deepEqual(adjustments, {
    currentZone: 'outside',
    noAdjustmentNeeded: false,
    deposit: { review: 0.05, recommended: 0.20 },
    amount: { review: 4800000, recommended: 4100000 },
    paymentTerm: { review: 60, recommended: 30 },
  })

  // 搜尋結果必須來自公司允許的條件集合
  assert.ok(policy.allowedDepositRatios.includes(adjustments.deposit.review))
  assert.ok(policy.allowedDepositRatios.includes(adjustments.deposit.recommended))
  assert.ok(policy.allowedPaymentTerms.includes(adjustments.paymentTerm.review))
  assert.ok(policy.allowedPaymentTerms.includes(adjustments.paymentTerm.recommended))
})