import { formatNTDCompact } from '../lib/format.js'

const ZONE_COPY = {
  recommended: {
    title: '落在建議授信範圍',
    desc: '目前交易條件在示範企業信用政策的建議範圍內。',
  },
  review: {
    title: '需要主管覆核',
    desc: '政策評估曝險超過建議範圍，但仍在可覆核的區間內。',
  },
  outside: {
    title: '超出目前信用政策',
    desc: '目前交易條件需要調整，才能回到可接受的信用空間。',
  },
}

export default function ZoneStatus({ evaluation }) {
  const copy = ZONE_COPY[evaluation.zone]
  // 資料可信度低的新 Buyer：zone 與人工覆核是兩個不同概念，說明文字分開講清楚
  const desc =
    evaluation.requiresManualReview && evaluation.zone === 'recommended'
      ? '交易落在新合作對象的起始信用政策範圍內。'
      : copy.desc

  return (
    <section className="zone-status" data-zone={evaluation.zone} aria-live="polite">
      <div className="zone-main">
        <h2 className="zone-title">
          <span className="zone-dot" aria-hidden="true" />
          {copy.title}
        </h2>
        <p className="zone-desc">{desc}</p>
      </div>

      <div className="zone-side">
        <dl className="zone-figures">
          <div>
            <dt>政策評估曝險</dt>
            <dd>{formatNTDCompact(evaluation.policyAdjustedExposure)}</dd>
          </div>
          <div>
            <dt>建議範圍上限</dt>
            <dd>{formatNTDCompact(evaluation.recommendedLimit)}</dd>
          </div>
        </dl>
        <p className="calc-note">依 Prototype 示範企業信用政策計算，非 AI 預測</p>
      </div>

      {evaluation.requiresManualReview && (
        <p className="manual-review">
          <strong>內部交易資料不足，需要人工覆核，不代表自動核准。</strong>
        </p>
      )}

    </section>
  )
}
