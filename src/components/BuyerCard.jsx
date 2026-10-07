import { formatNTDCompact } from '../lib/format.js'

const CONFIDENCE_LABEL = { high: '高', low: '低' }

const CAPACITY_TAG = {
  'prototype-credit-policy-output': {
    text: '模擬政策',
    title: 'Prototype 模擬授信基準，不是真實企業的正式信用額度',
  },
  'prototype-starting-policy': {
    text: '起始政策',
    title: '新 Buyer 的 Prototype 起始信用政策，不是 ML 預測值',
  },
}

export default function BuyerCard({ buyer }) {
  const tag = CAPACITY_TAG[buyer.baseCreditCapacityType]

  return (
    <section className="panel-section" aria-label="Buyer 狀態">
      <h2 className="buyer-name">{buyer.name}</h2>
      <p className="buyer-name-en">{buyer.nameEn}</p>
      <p className="buyer-tenure">
        {buyer.relationshipYears > 0
          ? `合作 ${buyer.relationshipYears} 年`
          : '新合作對象，尚無本企業交易紀錄'}
      </p>

      <p className="buyer-state">
        <strong>{buyer.riskGradeLabel}</strong>｜{buyer.creditHealthLabel}
      </p>

      <dl className="facts">
        <div>
          <dt>付款流程摩擦</dt>
          <dd>{buyer.paymentFrictionLabel}</dd>
        </div>
        <div>
          <dt>資料可信度</dt>
          <dd>{CONFIDENCE_LABEL[buyer.riskConfidence] ?? buyer.riskConfidence}</dd>
        </div>
        <div>
          <dt>
            Prototype 授信基準
            {tag && (
              <span className="sim-tag" title={tag.title}>
                {tag.text}
              </span>
            )}
          </dt>
          <dd className="num">{formatNTDCompact(buyer.baseCreditCapacity)}</dd>
        </div>
        <div>
          <dt>目前曝險</dt>
          <dd className="num">{formatNTDCompact(buyer.currentExposure)}</dd>
        </div>
      </dl>

      {buyer.paymentFrictionSignals.length > 0 && (
        <ul className="friction-note" aria-label="付款流程訊號">
          {buyer.paymentFrictionSignals.map((signal) => (
            <li key={signal}>{signal}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
