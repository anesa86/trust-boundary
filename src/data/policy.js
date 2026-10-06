// =====================================================
// 信用政策參數｜Prototype company credit policy parameters
// =====================================================
// 本檔為競賽 Prototype 中「一家示範企業」自行設定的信用政策參數。
//
// 這些數值：
// - 不是 AI 模型輸出
// - 不是業界標準
// - 不是學術研究證明的風險倍率
//
// 單位說明：
// - allowedPaymentTerms：帳期天數
// - termMultipliers：示範企業對不同帳期設定的保守係數（政策選擇，非預測）
// - allowedDepositRatios：0 到 1 之間的小數（0.30 = 30%）
// - amountStep：新台幣（NT$）
//
// 可行條件搜尋政策：
// - 帳期只從 allowedPaymentTerms 中選擇
// - 訂金比例只從 allowedDepositRatios 中選擇，不自行生成清單外的比例
// - 只有交易金額使用 amountStep 做離散搜尋
// =====================================================

export const policy = {
    policyType: 'prototype-company-policy',
    isValidatedIndustryStandard: false,
    description:
      'Prototype 示範企業之信用政策參數，正式部署需依企業 risk appetite、資金成本與歷史信用損失重新校準。',
  
    allowedPaymentTerms: [30, 45, 60, 90],
  
    termMultipliers: {
      30: 1.00,
      45: 1.05,
      60: 1.10,
      90: 1.20,
    },
  
    allowedDepositRatios: [0, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.40, 0.50],
  
    reviewBuffer: 1.15,
  
    searchConfig: {
      amountStep: 100000,
    },
  }