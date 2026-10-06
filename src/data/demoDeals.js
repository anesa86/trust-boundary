// =====================================================
// Demo 預設交易條件
// =====================================================
// 切換 Buyer 時，畫面先載入的一筆示範交易，方便上台展示。
// 這不是 Buyer 資料，也不是模型輸出；使用者可以自由調整。
// =====================================================

export const demoDeals = {
  // Hero 主案例：Buyer 穩定，但這筆交易明顯偏離過去模式
  'buyer-a': { dealAmount: 5000000, paymentTermDays: 90, depositRatio: 0 },
  // 付款摩擦偏高，但信用健康大致穩定；這筆交易落在覆核區
  'buyer-b': { dealAmount: 2400000, paymentTermDays: 60, depositRatio: 0 },
  // 新 Buyer：小額交易落在建議範圍，但仍需人工覆核
  'buyer-c': { dealAmount: 600000, paymentTermDays: 30, depositRatio: 0 },
}
