// =====================================================
// Decision Engine｜Deterministic calculation
// =====================================================
// 本檔所有函式都是「確定性計算」：
// 同樣的輸入，永遠得到同樣的輸出。
//
// 這裡沒有 AI、沒有 ML 預測。
// - Buyer Risk 來自 buyers.js（Prototype 模擬模型輸出）
// - 政策參數來自 policy.js（Prototype 示範企業信用政策）
// - 本檔只負責：財務計算 + 套用公司政策
//
// 金額單位：新台幣（NT$），計算結果四捨五入到整數元
// =====================================================

// 未擔保曝險：這筆交易中，扣掉訂金後賣方實際承擔的金額
// U = dealAmount × (1 − depositRatio)
export function calculateUnsecuredExposure(dealAmount, depositRatio) {
  return Math.round(dealAmount * (1 - depositRatio))
}

// 帳期政策係數：Prototype 示範企業對該帳期設定的信用政策係數
// 來源：policy.js 的 termPolicyFactors
// 這是公司政策參數，不是 AI 預測、不是違約風險倍率、不是產業標準
// 帳期不在 allowedPaymentTerms 中時直接報錯，不自行套用預設值
export function getTermPolicyFactor(paymentTermDays, policy) {
  if (!policy.allowedPaymentTerms.includes(paymentTermDays)) {
    throw new Error(`帳期 ${paymentTermDays} 天不在公司允許的帳期清單中`)
  }
  return policy.termPolicyFactors[paymentTermDays]
}

// 政策調整後總曝險
// U = 新 Deal 未擔保曝險
// P = U × termPolicyFactor（只有新 Deal 套用帳期政策係數）
// E = currentExposure + P（既有曝險不因新 Deal 的帳期而套用係數）
export function calculatePolicyAdjustedExposure(deal, policy) {
  const { dealAmount, depositRatio, paymentTermDays, currentExposure } = deal

  const unsecuredExposure = calculateUnsecuredExposure(dealAmount, depositRatio)
  const termPolicyFactor = getTermPolicyFactor(paymentTermDays, policy)
  const policyAdjustedDealExposure = Math.round(unsecuredExposure * termPolicyFactor)
  const policyAdjustedExposure = currentExposure + policyAdjustedDealExposure

  return {
    unsecuredExposure,
    termPolicyFactor,
    policyAdjustedDealExposure,
    policyAdjustedExposure,
  }
}

// 區域判定
// - recommended：E ≤ baseCreditCapacity（建議授信範圍）
// - review：E ≤ baseCreditCapacity × reviewBuffer（需要主管覆核）
// - outside：其他（超出目前信用政策）
// 剛好等於邊界時，算在較寬鬆的區域（使用 ≤）
// reviewLimit 四捨五入到整數元，避免小數誤差造成邊界誤判
export function classifyExposureZone(policyAdjustedExposure, baseCreditCapacity, policy) {
  const recommendedLimit = baseCreditCapacity
  const reviewLimit = Math.round(baseCreditCapacity * policy.reviewBuffer)

  let zone
  if (policyAdjustedExposure <= recommendedLimit) {
    zone = 'recommended'
  } else if (policyAdjustedExposure <= reviewLimit) {
    zone = 'review'
  } else {
    zone = 'outside'
  }

  return { zone, recommendedLimit, reviewLimit }
}

// 是否需要人工覆核
// 規則：Buyer 的 riskConfidence 為 'low' 時，一律需要人工覆核
// 這與區域判定是兩個獨立維度：
// - 即使 zone 為 recommended，也不能視為自動核准
// - 低可信度不會修改 Buyer Risk、授信基準或曝險計算
export function requiresManualReview(buyer) {
  return buyer.riskConfidence === 'low'
}

// =====================================================
// 單一 Deal 評估：UI 的主要入口
// =====================================================
// deal = { dealAmount, paymentTermDays, depositRatio }
export function evaluateDeal(buyer, deal, policy) {
  const { dealAmount, paymentTermDays, depositRatio } = deal

  const exposure = calculatePolicyAdjustedExposure(
    {
      dealAmount,
      depositRatio,
      paymentTermDays,
      currentExposure: buyer.currentExposure,
    },
    policy,
  )
  const zoneResult = classifyExposureZone(
    exposure.policyAdjustedExposure,
    buyer.baseCreditCapacity,
    policy,
  )

  return {
    dealAmount,
    paymentTermDays,
    depositRatio,
    currentExposure: buyer.currentExposure,
    ...exposure,
    baseCreditCapacity: buyer.baseCreditCapacity,
    recommendedLimit: zoneResult.recommendedLimit,
    reviewLimit: zoneResult.reviewLimit,
    zone: zoneResult.zone,
    requiresManualReview: requiresManualReview(buyer),
  }
}

// =====================================================
// 可行條件搜尋（一次只調整一個變數，其他條件維持原值）
// =====================================================
// target：
// - 'review'：進入覆核區「或更好」（review 或 recommended）
// - 'recommended'：進入建議授信範圍
// 找不到時回傳 null，不自行生成政策外的條件

const ZONE_RANK = { recommended: 0, review: 1, outside: 2 }

function meetsTarget(zone, target) {
  return ZONE_RANK[zone] <= ZONE_RANK[target]
}

// 只調訂金：從 allowedDepositRatios 中，找出能達到 target 的最低比例
export function findMinDepositRatio(buyer, deal, target, policy) {
  const ratios = [...policy.allowedDepositRatios].sort((a, b) => a - b)

  for (const depositRatio of ratios) {
    const result = evaluateDeal(buyer, { ...deal, depositRatio }, policy)
    if (meetsTarget(result.zone, target)) {
      return depositRatio
    }
  }
  return null
}

// 只調金額：以 amountStep 為單位，找出能達到 target 的最高金額（向下取整）
export function findMaxDealAmount(buyer, deal, target, policy) {
  const step = policy.searchConfig.amountStep
  const limit = target === 'recommended'
    ? buyer.baseCreditCapacity
    : Math.round(buyer.baseCreditCapacity * policy.reviewBuffer)

  const room = limit - buyer.currentExposure
  const perDollar = getTermPolicyFactor(deal.paymentTermDays, policy) * (1 - deal.depositRatio)
  if (room <= 0 || perDollar <= 0) {
    return null
  }

  // 先用公式估計，再逐步驗證，確保結果一定真的落在邊界內
  let amount = Math.floor(room / perDollar / step) * step
  const fits = (value) =>
    meetsTarget(evaluateDeal(buyer, { ...deal, dealAmount: value }, policy).zone, target)

  while (amount > 0 && !fits(amount)) {
    amount -= step
  }
  while (fits(amount + step)) {
    amount += step
  }

  return amount > 0 ? amount : null
}

// 只調帳期：從 allowedPaymentTerms 中，找出能達到 target、且最接近原帳期的選項
// 距離相同時，選較短的帳期
export function findNearestPaymentTerm(buyer, deal, target, policy) {
  const candidates = policy.allowedPaymentTerms.filter((paymentTermDays) => {
    const result = evaluateDeal(buyer, { ...deal, paymentTermDays }, policy)
    return meetsTarget(result.zone, target)
  })

  if (candidates.length === 0) {
    return null
  }

  return candidates.reduce((best, term) => {
    const bestDistance = Math.abs(best - deal.paymentTermDays)
    const distance = Math.abs(term - deal.paymentTermDays)
    if (distance < bestDistance || (distance === bestDistance && term < best)) {
      return term
    }
    return best
  })
}

// 統一入口：UI 只需呼叫這一個函式
// - noAdjustmentNeeded：原始條件已在建議授信範圍內
// - 各欄位的值若為 null，代表只調整該變數無法達到目標
export function findFeasibleAdjustments(buyer, deal, policy) {
  const current = evaluateDeal(buyer, deal, policy)

  return {
    currentZone: current.zone,
    noAdjustmentNeeded: current.zone === 'recommended',
    deposit: {
      review: findMinDepositRatio(buyer, deal, 'review', policy),
      recommended: findMinDepositRatio(buyer, deal, 'recommended', policy),
    },
    amount: {
      review: findMaxDealAmount(buyer, deal, 'review', policy),
      recommended: findMaxDealAmount(buyer, deal, 'recommended', policy),
    },
    paymentTerm: {
      review: findNearestPaymentTerm(buyer, deal, 'review', policy),
      recommended: findNearestPaymentTerm(buyer, deal, 'recommended', policy),
    },
  }
}