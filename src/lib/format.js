// 顯示用格式工具：只負責「怎麼顯示」，不做任何信用計算

// NT$5,000,000
export function formatNTD(value) {
  return `NT$${Math.round(value).toLocaleString('en-US')}`
}

// NT$5.5M、NT$0.5M、NT$6.33M
export function formatNTDCompact(value) {
  if (value === 0) {
    return 'NT$0'
  }
  const millions = value / 1000000
  const text = Number.isInteger(Math.round(millions * 100) / 10)
    ? millions.toFixed(1)
    : millions.toFixed(2)
  return `NT$${text}M`
}

// 0.2 → 20%
export function formatPercent(ratio) {
  return `${Math.round(ratio * 100)}%`
}
