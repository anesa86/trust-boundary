// =====================================================
// 信任邊界圖用的邊界值
// =====================================================
// 問題：在某個帳期下，「本次交易未擔保曝險」最多可以到多少，
//       仍然屬於指定區域？
//
// 這裡不寫第二套信用公式。每一次判斷都交給 M2 的 evaluateDeal，
// 只是用二分搜尋，找出剛好還在區域內的那一元。
// 以 0% 訂金試算時，交易金額 = 未擔保曝險，所以結果可直接畫在縱軸上。
// =====================================================

import { evaluateDeal } from '../engine/decisionEngine.js'

function meetsTarget(zone, target) {
  return target === 'recommended' ? zone === 'recommended' : zone !== 'outside'
}

export function findBoundaryExposure(buyer, paymentTermDays, target, policy) {
  const fits = (unsecuredExposure) => {
    const result = evaluateDeal(
      buyer,
      { dealAmount: unsecuredExposure, paymentTermDays, depositRatio: 0 },
      policy,
    )
    return meetsTarget(result.zone, target)
  }

  // 目前曝險已經超過界線：這個帳期沒有任何空間
  if (!fits(0)) {
    return 0
  }

  let low = 0
  let high = 1
  while (fits(high)) {
    high *= 2
  }
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2)
    if (fits(mid)) {
      low = mid
    } else {
      high = mid
    }
  }
  return low
}

// 四個政策帳期的兩條邊界
export function getTrustBoundaries(buyer, policy) {
  return policy.allowedPaymentTerms.map((paymentTermDays) => ({
    paymentTermDays,
    recommended: findBoundaryExposure(buyer, paymentTermDays, 'recommended', policy),
    review: findBoundaryExposure(buyer, paymentTermDays, 'review', policy),
  }))
}
