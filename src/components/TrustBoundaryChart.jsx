import { getTrustBoundaries } from '../lib/boundary.js'
import { formatNTDCompact } from '../lib/format.js'

const WIDTH = 720
const HEIGHT = 280
const MARGIN = { top: 30, right: 24, bottom: 30, left: 64 }
const PLOT_W = WIDTH - MARGIN.left - MARGIN.right
const PLOT_H = HEIGHT - MARGIN.top - MARGIN.bottom
const COLUMN_GAP = 18

const ZONE_LABEL = {
  recommended: '建議授信範圍',
  review: '需要主管覆核',
  outside: '超出目前信用政策',
}

// 縱軸刻度：挑一個讓刻度數落在 4～6 個的間距
function getTickStep(max) {
  const steps = [100000, 200000, 250000, 500000, 1000000, 2000000, 2500000, 5000000]
  return steps.find((step) => max / step <= 6) ?? 10000000
}

function tickLabel(value) {
  if (value === 0) return '0'
  return `${value / 1000000}M`
}

export default function TrustBoundaryChart({ buyer, policy, evaluation, yMax, termLocked }) {
  const boundaries = getTrustBoundaries(buyer, policy)
  const columnCount = boundaries.length
  const columnW = (PLOT_W - COLUMN_GAP * (columnCount - 1)) / columnCount

  const y = (value) => MARGIN.top + PLOT_H - (Math.min(value, yMax) / yMax) * PLOT_H
  const columnX = (index) => MARGIN.left + index * (columnW + COLUMN_GAP)

  const tickStep = getTickStep(yMax)
  const ticks = []
  for (let value = 0; value <= yMax; value += tickStep) {
    ticks.push(value)
  }

  const activeIndex = boundaries.findIndex((b) => b.paymentTermDays === evaluation.paymentTermDays)
  const active = boundaries[activeIndex]
  const pointX = columnX(activeIndex) + columnW / 2
  const pointY = y(evaluation.unsecuredExposure)
  const isClipped = evaluation.unsecuredExposure > yMax

  // 交易點標籤：預設放在點的上方；如果會壓到這一欄的邊界線，改放到點的下方
  // 只調整文字位置，交易點本身的座標不變
  const labelOffset = (() => {
    if (!active) return -24
    const lineYs = [y(active.recommended), y(active.review)]
    const plotTop = MARGIN.top
    const plotBottom = HEIGHT - MARGIN.bottom
    const fits = (offset) => {
      const top = pointY + offset - 13
      const bottom = pointY + offset + 4
      return top >= plotTop && bottom <= plotBottom && lineYs.every((lineY) => lineY < top || lineY > bottom)
    }
    return [-24, 32].find(fits) ?? -24
  })()

  return (
    <section className="boundary-card" aria-label="信任邊界">
      <div className="boundary-head">
        <h2 className="boundary-title">信任邊界</h2>
        <ul className="boundary-legend">
          <li><span className="swatch swatch-recommended" />建議授信範圍</li>
          <li><span className="swatch swatch-review" />需要主管覆核</li>
          <li><span className="swatch swatch-outside" />超出目前信用政策</li>
        </ul>
      </div>

      <svg
        className="boundary-svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`本次未擔保曝險 ${formatNTDCompact(evaluation.unsecuredExposure)}，帳期 Net${evaluation.paymentTermDays}，${ZONE_LABEL[evaluation.zone]}`}
      >
        {/* 縱軸名稱（左上）與目前帳期的政策邊界（右上）：共用圖表上方同一行 */}
        <text className="axis-title" x={MARGIN.left - 52} y={14}>
          本次未擔保曝險（NT$）
        </text>
        {active && (
          <text className="boundary-values-svg" x={WIDTH - MARGIN.right} y={14} textAnchor="end">
            <tspan>Net{active.paymentTermDays} 政策邊界</tspan>
            <tspan className="value-recommended-svg" dx="14">━ </tspan>
            <tspan>建議上限 </tspan>
            <tspan className="value-strong">{formatNTDCompact(active.recommended)}</tspan>
            <tspan className="value-review-svg" dx="14">━ </tspan>
            <tspan>覆核上限 </tspan>
            <tspan className="value-strong">{formatNTDCompact(active.review)}</tspan>
          </text>
        )}

        {/* 縱軸刻度 */}
        {ticks.map((value) => (
          <g key={value}>
            <line
              className="grid-line"
              x1={MARGIN.left - 6}
              x2={WIDTH - MARGIN.right}
              y1={y(value)}
              y2={y(value)}
            />
            <text className="tick-label" x={MARGIN.left - 12} y={y(value)} textAnchor="end" dominantBaseline="middle">
              {tickLabel(value)}
            </text>
          </g>
        ))}

        {/* 四個政策帳期：每個帳期是一根獨立的柱，不做連續曲線 */}
        {boundaries.map((boundary, index) => {
          const x = columnX(index)
          const isActive = index === activeIndex
          const isMuted = termLocked && !isActive
          return (
            <g key={boundary.paymentTermDays} className={`term-column${isMuted ? ' is-muted' : ''}`}>
              <rect className="zone-outside" x={x} y={y(yMax)} width={columnW} height={y(boundary.review) - y(yMax)} />
              <rect className="zone-review" x={x} y={y(boundary.review)} width={columnW} height={y(boundary.recommended) - y(boundary.review)} />
              <rect className="zone-recommended" x={x} y={y(boundary.recommended)} width={columnW} height={y(0) - y(boundary.recommended)} />

              {/* 邊界節點 */}
              <line className="boundary-line boundary-review" x1={x} x2={x + columnW} y1={y(boundary.review)} y2={y(boundary.review)} />
              <line className="boundary-line boundary-recommended" x1={x} x2={x + columnW} y1={y(boundary.recommended)} y2={y(boundary.recommended)} />

              <text
                className={`term-label${isActive ? ' is-active' : ''}`}
                x={x + columnW / 2}
                y={HEIGHT - MARGIN.bottom + 22}
                textAnchor="middle"
              >
                Net{boundary.paymentTermDays}
                {termLocked && isActive ? '（已鎖定）' : ''}
              </text>
            </g>
          )
        })}

        {/* 本次交易 */}
        <g
          className={`deal-point deal-${evaluation.zone}`}
          style={{ transform: `translate(${pointX}px, ${pointY}px)` }}
        >
          <circle className="deal-halo" r="16" />
          <circle className="deal-dot" r="7" />
          <text className="deal-label" y={labelOffset} textAnchor="middle">
            本次交易 {formatNTDCompact(evaluation.unsecuredExposure)}
            {isClipped ? ' ↑' : ''}
          </text>
        </g>
      </svg>

      <p className="boundary-note">
        橫軸僅含示範企業信用政策允許的 4 種帳期；帳期越長，允許的空間越小。邊界已計入 Buyer 目前曝險 {formatNTDCompact(buyer.currentExposure)}。
      </p>
    </section>
  )
}
