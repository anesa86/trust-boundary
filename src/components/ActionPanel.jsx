import { findFeasibleAdjustments } from '../engine/decisionEngine.js'
import { formatNTD, formatPercent } from '../lib/format.js'

const OPTIONS = [
  {
    key: 'deposit',
    lockKey: 'deposit',
    label: '只調整訂金',
    describe: (value) => `訂金提高至 ${formatPercent(value)}`,
    patch: (value) => ({ depositRatio: value }),
  },
  {
    key: 'amount',
    lockKey: 'amount',
    label: '只調整金額',
    describe: (value) => `交易金額降至 ${formatNTD(value)}`,
    patch: (value) => ({ dealAmount: value }),
  },
  {
    key: 'paymentTerm',
    lockKey: 'term',
    label: '只調整帳期',
    describe: (value) => `帳期改為 Net${value}`,
    patch: (value) => ({ paymentTermDays: value }),
  },
]

const LOCK_TEXT = {
  amount: (deal) => formatNTD(deal.dealAmount),
  term: (deal) => `Net${deal.paymentTermDays}`,
  deposit: (deal) => `訂金 ${formatPercent(deal.depositRatio)}`,
}

export default function ActionPanel({ buyer, deal, policy, locks, evaluation, onApply }) {
  const lockedKeys = Object.keys(locks).filter((key) => locks[key])
  const allLocked = lockedKeys.length === 3
  const adjustments = findFeasibleAdjustments(buyer, deal, policy)
  const openOptions = OPTIONS.filter((option) => !locks[option.lockKey])
  const showReview = evaluation.zone === 'outside'

  return (
    <section className="action-card" aria-label="可行調整">
      <div className="card-head">
        <h2 className="card-title">接下來可以怎麼調</h2>
        {lockedKeys.length > 0 && (
          <p className="locked-summary">
            不可談條件：
            {lockedKeys.map((key) => (
              <span key={key} className="locked-chip">{LOCK_TEXT[key](deal)}</span>
            ))}
          </p>
        )}
      </div>

      {adjustments.noAdjustmentNeeded ? (
        <p className="action-empty">
          目前條件已在建議授信範圍內，不需要調整。
          {evaluation.requiresManualReview && '但 Buyer 資料可信度低，仍需人工覆核。'}
        </p>
      ) : allLocked ? (
        <div className="action-empty">
          <p><strong>目前所有交易條件皆已鎖定。</strong></p>
          <p>系統無法在既有條件下尋找替代方案。解除一項條件以查看可行空間。</p>
        </div>
      ) : (
        <>
          <p className="action-intro">
            其他條件維持不變，只調整一項時，進入建議授信範圍所需的最小調整：
          </p>
          <ul className="action-list">
            {openOptions.map((option) => {
              const recommended = adjustments[option.key].recommended
              const review = adjustments[option.key].review
              return (
                <li key={option.key} className="action-item">
                  <p className="action-label">{option.label}</p>
                  {recommended !== null ? (
                    <div className="action-row">
                      <p className="action-main">
                        {option.describe(recommended)}
                        <span className="action-result">→ 進入建議授信範圍</span>
                      </p>
                      <button
                        type="button"
                        className="button-primary"
                        onClick={() => onApply(option.patch(recommended))}
                      >
                        套用
                      </button>
                    </div>
                  ) : (
                    <p className="action-none">只調整這一項，無法進入建議授信範圍。</p>
                  )}
                  {showReview && review !== null && review !== recommended && (
                    <div className="action-row is-secondary">
                      <p className="action-sub">
                        {option.describe(review)}
                        <span className="action-result">→ 可送主管覆核</span>
                      </p>
                      <button
                        type="button"
                        className="button-ghost"
                        onClick={() => onApply(option.patch(review))}
                      >
                        套用並送覆核
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          {evaluation.requiresManualReview && (
            <p className="action-footnote">Buyer 資料可信度低：即使調整後進入建議範圍，仍需人工覆核。</p>
          )}
        </>
      )}
    </section>
  )
}
