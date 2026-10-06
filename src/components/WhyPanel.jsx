import { buildDeterministicExplanation, getHistoryComparison } from '../lib/explanation.js'
import { formatNTDCompact } from '../lib/format.js'

export default function WhyPanel({ buyer, evaluation }) {
  const history = getHistoryComparison(buyer, evaluation)
  const explanation = buildDeterministicExplanation(buyer, evaluation)

  return (
    <section className="why-card" aria-label="原因說明">
      <div className="card-head">
        <h2 className="card-title">這次和他過去有什麼不同？</h2>
      </div>

      {history.hasHistory ? (
        <dl className="compare-list">
          <div className="compare-row">
            <dt>交易金額</dt>
            <dd>
              典型 {formatNTDCompact(buyer.typicalOrderAmount)} → 本次 {formatNTDCompact(evaluation.dealAmount)}
            </dd>
            <dd className="compare-delta">{history.amountRatio.toFixed(1)}×</dd>
          </div>
          <div className="compare-row">
            <dt>付款帳期</dt>
            <dd>
              典型 {buyer.typicalPaymentTermDays} 天 → 本次 {evaluation.paymentTermDays} 天
            </dd>
            <dd className="compare-delta">
              {history.termDiffDays === 0
                ? '相同'
                : `${history.termDiffDays > 0 ? '+' : ''}${history.termDiffDays} 天`}
            </dd>
          </div>
          <div className="compare-row">
            <dt>信用曝險</dt>
            <dd>
              目前 {formatNTDCompact(buyer.currentExposure)} → 交易後 {formatNTDCompact(evaluation.policyAdjustedExposure)}（政策調整後）
            </dd>
            <dd className="compare-delta" />
          </div>
          <div className="compare-row">
            <dt>付款節奏</dt>
            <dd>{buyer.recentPaymentTrendLabel}</dd>
            <dd className="compare-delta" />
          </div>
        </dl>
      ) : (
        <p className="compare-empty">
          {buyer.name} 尚無本企業交易紀錄，無法與過去比較。{buyer.externalCreditSummary}。
        </p>
      )}

      <div className="explanation">
        <p className="explanation-source">說明（依規則產生，非 AI）</p>
        <p className="explanation-summary">{explanation.summary}</p>
        {explanation.key_reasons.length > 0 && (
          <ul className="explanation-reasons">
            {explanation.key_reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
        <p className="explanation-note">{explanation.human_note}</p>
      </div>
    </section>
  )
}
