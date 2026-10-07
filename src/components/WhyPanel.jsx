import { buildDeterministicExplanation, getHistoryComparison } from '../lib/explanation.js'
import { formatNTDCompact } from '../lib/format.js'

export default function WhyPanel({ buyer, evaluation, ai, onRequestAi }) {
  const history = getHistoryComparison(buyer, evaluation)
  const ruleExplanation = buildDeterministicExplanation(buyer, evaluation)

  // 只有 AI 成功時才換成 AI 說明；其他狀態一律顯示規則說明
  const isAi = ai.status === 'success'
  const explanation = isAi ? ai.explanation : ruleExplanation
  const isLoading = ai.status === 'loading'

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
              典型 Net{buyer.typicalPaymentTermDays} → 本次 Net{evaluation.paymentTermDays}
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
              目前 {formatNTDCompact(buyer.currentExposure)} → 政策評估曝險 {formatNTDCompact(evaluation.policyAdjustedExposure)}
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

      <div className="explanation" aria-live="polite" aria-busy={isLoading}>
        <div className="explanation-head">
          <p className="explanation-source">{isAi ? 'AI 整理' : '依規則產生'}</p>
          {!isAi && (
            <button
              type="button"
              className="button-quiet"
              disabled={isLoading}
              onClick={onRequestAi}
            >
              {isLoading ? 'AI 整理中…' : '用 AI 整理說明'}
            </button>
          )}
        </div>

        {ai.status === 'error' && (
          <p className="explanation-notice">AI 暫時無法使用，目前顯示依規則產生的說明</p>
        )}

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
