// =====================================================
// Deterministic explanation（規則產生的說明文字）
// =====================================================
// 輸出格式和 Day 2 的 AI structured output 完全相同：
// { summary, buyer_status, deal_status, key_reasons, human_note }
//
// 這份說明只整理「已經算好的結果」與 Buyer 資料，不做任何新的推論：
// - 不產生風險分數、不決定額度
// - 不宣稱任何因果關係
// AI 掛掉時，這份就是 fallback，所以必須永遠保留。
// =====================================================

import { formatNTD, formatNTDCompact } from './format.js'

const SUMMARY = {
  recommended: '本次交易落在建議授信範圍內。',
  review: '本次交易超過建議範圍，但仍在可覆核區間，需要主管覆核。',
  outside: '本次交易目前超出建議授信範圍，交易條件需要調整。',
}

export function getHistoryComparison(buyer, evaluation) {
  const hasHistory = buyer.typicalOrderAmount !== null && buyer.typicalPaymentTermDays !== null
  if (!hasHistory) {
    return { hasHistory: false }
  }
  return {
    hasHistory: true,
    amountRatio: evaluation.dealAmount / buyer.typicalOrderAmount,
    termDiffDays: evaluation.paymentTermDays - buyer.typicalPaymentTermDays,
  }
}

// 付款流程摩擦偏高的 Buyer（目前只有 Buyer B）：
// 先說明「付款變慢 ≠ 信用惡化」，避免使用者一開始就形成信用惡化的印象。
// 只使用 buyers.js 裡已有的文字，不新增任何資料。
function buildFrictionFirstReasons(buyer) {
  const signal = buyer.paymentFrictionSignals[0]
  return [
    signal
      ? `${signal} 等付款流程摩擦訊號，作為流程提醒，不直接視為信用惡化`
      : '近期觀察到付款流程摩擦訊號，作為流程提醒，不直接視為信用惡化',
    buyer.externalCreditSummary,
    `信用健康狀態目前為「${buyer.creditHealthLabel}」`,
    buyer.recentPaymentTrendLabel,
  ]
}

export function buildDeterministicExplanation(buyer, evaluation) {
  const history = getHistoryComparison(buyer, evaluation)
  const reasons = []

  if (evaluation.zone !== 'recommended') {
    const over = evaluation.policyAdjustedExposure - evaluation.recommendedLimit
    reasons.push(`交易後政策調整曝險高於建議範圍上限 ${formatNTD(over)}`)
  }

  if (history.hasHistory && history.amountRatio >= 1.5) {
    reasons.push(`本次金額為歷史典型交易的 ${history.amountRatio.toFixed(1)} 倍`)
  }

  if (history.hasHistory && history.termDiffDays > 0) {
    reasons.push(`帳期較 Buyer 典型交易增加 ${history.termDiffDays} 天`)
  }

  if (evaluation.requiresManualReview) {
    reasons.push('Buyer 資料可信度低，結果需要人工覆核')
  }

  if (buyer.currentExposure > 0) {
    reasons.push(`Buyer 目前已有 ${formatNTDCompact(buyer.currentExposure)} 曝險，已計入本次評估`)
  }

  const buyerStatus = buyer.riskConfidence === 'low'
    ? `${buyer.name} 為新合作對象，內部付款紀錄尚在建立中。`
    : `${buyer.name} 信用狀態 ${buyer.riskGradeLabel}｜${buyer.creditHealthLabel}；${buyer.recentPaymentTrendLabel}。`

  const dealStatus = `交易後政策調整曝險 ${formatNTD(evaluation.policyAdjustedExposure)}，建議範圍上限 ${formatNTD(evaluation.recommendedLimit)}。`

  let humanNote
  if (buyer.riskConfidence === 'low') {
    humanNote = '資料仍在建立中，系統不提供精準風險分數，結果需搭配人工判斷。'
  } else if (evaluation.zone !== 'recommended') {
    humanNote = 'Buyer 本身目前沒有明顯信用惡化；差異主要來自本次交易條件與既有曝險。'
  } else {
    humanNote = '目前條件可依建議範圍處理。'
  }

  return {
    summary: SUMMARY[evaluation.zone],
    buyer_status: buyerStatus,
    deal_status: dealStatus,
    key_reasons: buyer.paymentFriction === 'high'
      ? buildFrictionFirstReasons(buyer)
      : reasons.slice(0, 4),
    human_note: humanNote,
  }
}
