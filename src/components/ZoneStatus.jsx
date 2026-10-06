import { formatNTD } from '../lib/format.js'

const ZONE_COPY = {
  recommended: {
    title: '落在建議授信範圍',
    desc: '目前交易條件在示範企業信用政策的建議範圍內。',
  },
  review: {
    title: '需要主管覆核',
    desc: '交易後曝險超過建議範圍，但仍在可覆核的區間內。',
  },
  outside: {
    title: '超出目前信用政策',
    desc: '目前交易條件需要調整，才能回到可接受的信用空間。',
  },
}

export default function ZoneStatus({ evaluation }) {
  const copy = ZONE_COPY[evaluation.zone]

  return (
    <section className="zone-status" data-zone={evaluation.zone} aria-live="polite">
      <div className="zone-main">
        <h2 className="zone-title">
          <span className="zone-dot" aria-hidden="true" />
          {copy.title}
        </h2>
        <p className="zone-desc">{copy.desc}</p>
      </div>

      <dl className="zone-figures">
        <div>
          <dt>交易後政策調整曝險</dt>
          <dd>{formatNTD(evaluation.policyAdjustedExposure)}</dd>
        </div>
        <div>
          <dt>建議範圍上限</dt>
          <dd>{formatNTD(evaluation.recommendedLimit)}</dd>
        </div>
      </dl>

      {evaluation.requiresManualReview && (
        <p className="manual-review">
          <strong>資料可信度低，需要人工覆核。</strong>
          即使落在建議範圍，也不可視為自動核准。
        </p>
      )}

      <p className="calc-note">
        依 Prototype 示範企業信用政策計算（帳期政策係數 ×{evaluation.termPolicyFactor.toFixed(2)}），非 AI 預測
      </p>
    </section>
  )
}
