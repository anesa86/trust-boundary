// =====================================================
// Buyer 資料｜Prototype 模擬資料
// =====================================================
// 本檔所有 Buyer 皆為競賽 Prototype 設計之模擬案例，
// 不是真實企業，也不是真實信用資料。
//
// 欄位說明：
// - name：畫面主要顯示的中文名稱（虛構）；nameEn：英文名稱（虛構）
// - 金額單位：新台幣（NT$）
// - 帳期、逾期天數單位：天
// - buyerRiskProbability、onTimePaymentRate：0 到 1 之間的小數
// - buyerRiskProbability / riskGrade / riskConfidence：
//   Prototype 模擬模型輸出；網站內「沒有」即時訓練模型
// - baseCreditCapacity：Prototype 模擬授信基準，不是經驗證的真實最佳額度
// - baseCreditCapacityType：
//   'prototype-credit-policy-output'：既有 Buyer 的模擬授信基準
//   'prototype-starting-policy'：新 Buyer 的起始信用政策（非 ML 預測）
// - creditHealth 與 paymentFriction 是兩個獨立訊號；
//   Prototype v1 中，付款摩擦不得調降 baseCreditCapacity 或 buyerRiskProbability
//
// 資料模型原則（三個 Buyer 使用相同欄位，不省略欄位）：
// - 單值資料若尚無資料，使用 null（null 代表「尚無資料」，不是 0）
// - 複數訊號若無可列出項目，使用空陣列 []
// - paymentFrictionSignals 為 [] 時，需搭配 paymentFriction 判讀：
//   若 paymentFriction 為 'unknown'，代表目前沒有可列出的已知訊號，
//   但不代表已證明沒有付款摩擦
// =====================================================

export const buyers = [
  // Buyer A：Hero 主案例
  // Buyer 本身穩定，但一筆異常 Deal 仍可能超出授信邊界
  {
    id: 'buyer-a',
    name: '明輝零組件',
    nameEn: 'Bright Components',
    relationshipYears: 3.2,

    buyerRiskProbability: 0.07,
    riskGrade: 'B',
    riskGradeLabel: 'B',
    riskConfidence: 'high',

    creditHealth: 'stable',
    creditHealthLabel: '整體穩定',

    paymentFriction: 'low',
    paymentFrictionLabel: '低',

    baseCreditCapacity: 5500000,
    baseCreditCapacityType: 'prototype-credit-policy-output',
    currentExposure: 500000,

    typicalOrderAmount: 1000000,
    typicalPaymentTermDays: 30,

    onTimePaymentRate: 0.92,
    averageDaysLate: 2.8,
    recentPaymentTrend: 'slightly-slower',
    recentPaymentTrendLabel: '大致穩定，近期略微放緩',

    externalCreditSummary: '外部信用資訊目前維持穩定',

    industryOutlook: 'stable',
    industryOutlookLabel: '持平',

    paymentFrictionSignals: [],

    prototypeData: true,
    prototypeDataLabel: 'Prototype 模擬資料',
  },

  // Buyer B：付款摩擦 ≠ 信用惡化
  {
    id: 'buyer-b',
    name: '新衡零售系統',
    nameEn: 'Nova Retail Systems',
    relationshipYears: 2.1,

    buyerRiskProbability: 0.12,
    riskGrade: 'B-',
    riskGradeLabel: 'B-',
    riskConfidence: 'high',

    creditHealth: 'mostly-stable',
    creditHealthLabel: '大致穩定',

    paymentFriction: 'high',
    paymentFrictionLabel: '偏高',

    baseCreditCapacity: 3200000,
    baseCreditCapacityType: 'prototype-credit-policy-output',
    currentExposure: 1000000,

    typicalOrderAmount: 800000,
    typicalPaymentTermDays: 45,

    onTimePaymentRate: 0.82,
    averageDaysLate: 5.5,
    recentPaymentTrend: 'stable-with-process-friction',
    recentPaymentTrendLabel: '近期付款時間略有波動，但尚無明顯信用惡化',

    externalCreditSummary: '外部信用資訊目前未見重大惡化',

    industryOutlook: 'slightly-soft',
    industryOutlookLabel: '持平偏弱',

    paymentFrictionSignals: [
      '近期曾出現 invoice approval delay',
      '流程摩擦目前不直接視為 Buyer 信用惡化',
    ],

    prototypeData: true,
    prototypeDataLabel: 'Prototype 模擬資料',
  },

  // Buyer C：新 Buyer / thin-file
  // 不提供精準 Buyer Risk；baseCreditCapacity 為新 Buyer 起始信用政策，非 ML 預測
  {
    id: 'buyer-c',
    name: '光川貿易',
    nameEn: 'Lumen Trading',
    relationshipYears: 0,

    buyerRiskProbability: null,
    riskGrade: 'unrated',
    riskGradeLabel: '未定',
    riskConfidence: 'low',

    creditHealth: 'building',
    creditHealthLabel: '資料仍在建立中',

    paymentFriction: 'unknown',
    paymentFrictionLabel: '尚無足夠資料',

    baseCreditCapacity: 800000,
    baseCreditCapacityType: 'prototype-starting-policy',
    currentExposure: 0,

    typicalOrderAmount: null,
    typicalPaymentTermDays: null,

    onTimePaymentRate: null,
    averageDaysLate: null,
    recentPaymentTrend: 'insufficient-data',
    recentPaymentTrendLabel: '尚無內部付款紀錄',

    externalCreditSummary: '公開企業基本資料未見異常，但缺乏本企業交易紀錄',

    industryOutlook: 'stable',
    industryOutlookLabel: '持平',

    // 目前沒有可列出的已知訊號；paymentFriction 仍為 'unknown'，不代表已證明沒有摩擦
    paymentFrictionSignals: [],

    prototypeData: true,
    prototypeDataLabel: 'Prototype 模擬資料',
  },
]
