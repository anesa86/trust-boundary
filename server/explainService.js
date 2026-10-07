// =====================================================
// AI 說明服務（server 端）
// =====================================================
// 流程：
// 1. 檢查瀏覽器送來的交易條件，必須在公司政策允許範圍內
// 2. 用 M2 Decision Engine 重新計算（不相信瀏覽器送來的任何數字）
// 3. 把「已算好的結果」交給 OpenAI，只請它整理成文字
// 4. 檢查 AI 回傳格式；任何失敗都回傳 deterministic fallback
//
// AI 不做任何信用決策：不產生分數、額度、區域或調整建議。
// =====================================================

import { buyers } from '../src/data/buyers.js'
import { policy } from '../src/data/policy.js'
import { evaluateDeal, findFeasibleAdjustments } from '../src/engine/decisionEngine.js'
import { buildDeterministicExplanation, getHistoryComparison } from '../src/lib/explanation.js'
import { formatNTDCompact as formatMoney, formatPercent } from '../src/lib/format.js'

const OPENAI_URL = 'https://api.openai.com/v1/responses'
const DEFAULT_MODEL = 'gpt-6-luna'
const TIMEOUT_MS = 15000
const MAX_AMOUNT = 1000000000

// ---------- 1. 輸入檢查 ----------

export function validateExplainRequest(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: '請求內容必須是 JSON 物件' }
  }

  const { buyerId, dealAmount, paymentTermDays, depositRatio } = body
  const buyer = buyers.find((b) => b.id === buyerId)
  const step = policy.searchConfig.amountStep

  if (!buyer) {
    return { ok: false, error: `找不到 Buyer：${buyerId}` }
  }
  if (!Number.isInteger(dealAmount) || dealAmount < step || dealAmount > MAX_AMOUNT || dealAmount % step !== 0) {
    return { ok: false, error: `交易金額必須是 NT$${step.toLocaleString('en-US')} 的整數倍` }
  }
  if (!policy.allowedPaymentTerms.includes(paymentTermDays)) {
    return { ok: false, error: `帳期 ${paymentTermDays} 天不在公司允許的帳期清單中` }
  }
  if (!policy.allowedDepositRatios.includes(depositRatio)) {
    return { ok: false, error: `訂金比例 ${depositRatio} 不在公司允許的清單中` }
  }

  return { ok: true, buyer, deal: { dealAmount, paymentTermDays, depositRatio } }
}

// ---------- 2. 用 M2 引擎重新計算，整理給 AI 的事實 ----------

const ZONE_TEXT = {
  recommended: '落在建議授信範圍',
  review: '需要主管覆核',
  outside: '超出目前信用政策',
}

export function buildFacts(buyer, deal) {
  const evaluation = evaluateDeal(buyer, deal, policy)
  const adjustments = findFeasibleAdjustments(buyer, deal, policy)
  const history = getHistoryComparison(buyer, evaluation)
  const fallback = buildDeterministicExplanation(buyer, evaluation)

  // 只給 AI「顯示用文字」，不給原始風險機率，避免 AI 重新解讀或計算
  // 金額已由引擎算好，這裡只轉成與網頁相同的精簡顯示格式（例如 NT$6.5M）
  const facts = {
    buyer: {
      name: buyer.name,
      relationship: buyer.relationshipYears > 0 ? `合作 ${buyer.relationshipYears} 年` : '新合作對象',
      credit_grade: buyer.riskGradeLabel,
      credit_health: buyer.creditHealthLabel,
      data_confidence: buyer.riskConfidence === 'low' ? '低' : '高',
      payment_friction: buyer.paymentFrictionLabel,
      payment_friction_signals: buyer.paymentFrictionSignals,
      recent_payment_trend: buyer.recentPaymentTrendLabel,
      external_credit_summary: buyer.externalCreditSummary,
      industry_outlook: buyer.industryOutlookLabel,
      typical_order_amount: buyer.typicalOrderAmount === null ? '尚無資料' : formatMoney(buyer.typicalOrderAmount),
      typical_payment_term: buyer.typicalPaymentTermDays === null ? '尚無資料' : `${buyer.typicalPaymentTermDays} 天`,
      current_exposure: formatMoney(buyer.currentExposure),
    },
    deal: {
      amount: formatMoney(deal.dealAmount),
      payment_term: `Net${deal.paymentTermDays}`,
      deposit: formatPercent(deal.depositRatio),
    },
    engine_result: {
      zone: ZONE_TEXT[evaluation.zone],
      requires_manual_review: evaluation.requiresManualReview,
      unsecured_exposure: formatMoney(evaluation.unsecuredExposure),
      policy_adjusted_exposure_after_deal: formatMoney(evaluation.policyAdjustedExposure),
      recommended_limit: formatMoney(evaluation.recommendedLimit),
      review_limit: formatMoney(evaluation.reviewLimit),
      amount_vs_typical: history.hasHistory ? `${history.amountRatio.toFixed(1)} 倍` : '尚無資料',
      term_vs_typical: history.hasHistory ? `${history.termDiffDays >= 0 ? '+' : ''}${history.termDiffDays} 天` : '尚無資料',
    },
    single_variable_adjustments_to_recommended: {
      deposit: adjustments.deposit.recommended === null ? '無法只靠訂金達成' : `訂金至少 ${formatPercent(adjustments.deposit.recommended)}`,
      amount: adjustments.amount.recommended === null ? '無法只靠金額達成' : `金額不超過 ${formatMoney(adjustments.amount.recommended)}`,
      payment_term: adjustments.paymentTerm.recommended === null ? '無法只靠帳期達成' : `帳期 Net${adjustments.paymentTerm.recommended}`,
      no_adjustment_needed: adjustments.noAdjustmentNeeded,
    },
    rule_based_reference: fallback,
  }

  return { evaluation, facts, fallback }
}

// ---------- 3. OpenAI 請求（Responses API + strict JSON Schema） ----------

const EXPLANATION_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    buyer_status: { type: 'string' },
    deal_status: { type: 'string' },
    key_reasons: { type: 'array', items: { type: 'string' } },
    human_note: { type: 'string' },
  },
  required: ['summary', 'buyer_status', 'deal_status', 'key_reasons', 'human_note'],
  additionalProperties: false,
}

const SYSTEM_PROMPT = `你是 B2B 貿易信用管理工具「信任邊界」的說明撰寫助手，讀者是企業的信用主管與業務。

你的唯一工作：把系統已經計算好的結果，整理成精簡、專業、易懂的繁體中文說明。

嚴格規則：
1. 只能使用提供的事實。不得新增任何資料、外部資訊或數字。
2. 不得重新計算、估算或修改任何數字。提到金額、比例、帳期時，必須原樣使用提供的文字。
3. 不得做任何信用決策：不得核准、拒絕、給分數、給額度、改變區域判定或提出新的交易方案。
4. 不得推論因果。付款摩擦訊號只能描述為「觀察到的流程訊號」，不得說成信用惡化的原因或證據。
5. 不得把 Buyer 描述成壞客戶。避免「高風險」「拒絕」「不安全」等用語，改用「超出目前建議範圍」「需要進一步覆核」「交易條件需要調整」。
6. 若 requires_manual_review 為 true，必須在 human_note 中提醒需要人工覆核，且不可視為自動核准。
7. 若資料可信度低，不得暗示系統知道精準風險。
8. 區分「Buyer 本身的信用狀態」與「本次交易條件造成的曝險」。

輸出長度：
- summary：一句話，40 字以內
- buyer_status：一句話，60 字以內
- deal_status：一句話，60 字以內
- key_reasons：2 到 4 條，每條 40 字以內
- human_note：一句話，60 字以內`

export function buildOpenAIRequest(facts, model) {
  return {
    model,
    input: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `以下是系統已計算完成的結果（JSON）。請依規則整理說明：\n${JSON.stringify(facts, null, 2)}`,
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'deal_explanation',
        strict: true,
        schema: EXPLANATION_SCHEMA,
      },
    },
    max_output_tokens: 2000,
  }
}

// 從 Responses API 的回應中取出文字；拒答或不完整時回傳原因
export function extractOutputText(data) {
  if (data?.status === 'incomplete') {
    return { ok: false, reason: 'incomplete' }
  }
  if (typeof data?.output_text === 'string' && data.output_text) {
    return { ok: true, text: data.output_text }
  }
  for (const item of data?.output ?? []) {
    if (item?.type !== 'message') continue
    for (const part of item.content ?? []) {
      if (part?.type === 'refusal') {
        return { ok: false, reason: 'refusal' }
      }
      if (part?.type === 'output_text' && typeof part.text === 'string') {
        return { ok: true, text: part.text }
      }
    }
  }
  return { ok: false, reason: 'empty-output' }
}

// 再檢查一次 AI 回傳的結構（strict schema 之外的第二道防線）
export function validateAiExplanation(value) {
  const keys = ['summary', 'buyer_status', 'deal_status', 'key_reasons', 'human_note']
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  if (Object.keys(value).length !== keys.length) return false
  if (!keys.every((key) => key in value)) return false

  const textFields = ['summary', 'buyer_status', 'deal_status', 'human_note']
  if (!textFields.every((key) => typeof value[key] === 'string' && value[key].trim() && value[key].length <= 200)) {
    return false
  }
  const reasons = value.key_reasons
  return (
    Array.isArray(reasons) &&
    reasons.length >= 1 &&
    reasons.length <= 4 &&
    reasons.every((reason) => typeof reason === 'string' && reason.trim() && reason.length <= 120)
  )
}

async function requestAiExplanation(facts, { apiKey, model, fetchImpl }) {
  let response
  try {
    response = await fetchImpl(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(buildOpenAIRequest(facts, model)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (error) {
    const isTimeout = error?.name === 'TimeoutError' || error?.name === 'AbortError'
    return { ok: false, reason: isTimeout ? 'timeout' : 'network-error' }
  }

  if (!response.ok) {
    // 只在 server 視窗印出 OpenAI 的錯誤說明，方便除錯；不回傳給瀏覽器
    let detail
    try {
      detail = (await response.json())?.error?.message ?? ''
    } catch {
      detail = ''
    }
    return { ok: false, reason: `api-error-${response.status}`, detail }
  }

  let data
  try {
    data = await response.json()
  } catch {
    return { ok: false, reason: 'invalid-api-response' }
  }

  const output = extractOutputText(data)
  if (!output.ok) {
    return output
  }

  let parsed
  try {
    parsed = JSON.parse(output.text)
  } catch {
    return { ok: false, reason: 'invalid-json' }
  }

  if (!validateAiExplanation(parsed)) {
    return { ok: false, reason: 'schema-mismatch' }
  }
  return { ok: true, explanation: parsed }
}

// ---------- 4. 對外的主函式 ----------

export async function explainDeal(body, { apiKey, model, fetchImpl = fetch } = {}) {
  const input = validateExplainRequest(body)
  if (!input.ok) {
    return { status: 400, payload: { error: input.error } }
  }

  const { evaluation, facts, fallback } = buildFacts(input.buyer, input.deal)
  const base = {
    request: { buyerId: input.buyer.id, ...input.deal },
    zone: evaluation.zone,
    requiresManualReview: evaluation.requiresManualReview,
  }

  if (!apiKey) {
    return {
      status: 200,
      payload: { ...base, source: 'fallback', fallbackReason: 'missing-api-key', model: null, explanation: fallback },
    }
  }

  const usedModel = model || DEFAULT_MODEL
  const result = await requestAiExplanation(facts, { apiKey, model: usedModel, fetchImpl })

  if (!result.ok) {
    return {
      status: 200,
      debugDetail: result.detail,
      payload: { ...base, source: 'fallback', fallbackReason: result.reason, model: usedModel, explanation: fallback },
    }
  }

  return {
    status: 200,
    payload: { ...base, source: 'ai', fallbackReason: null, model: usedModel, explanation: result.explanation },
  }
}
