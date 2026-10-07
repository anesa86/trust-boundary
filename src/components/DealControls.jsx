import { useState } from 'react'
import { formatNTD, formatPercent } from '../lib/format.js'

function LockIcon({ locked }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      {locked ? <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /> : <path d="M5.5 7V5a2.5 2.5 0 0 1 4.9-.7" />}
    </svg>
  )
}

function LockButton({ locked, onToggle, label }) {
  return (
    <button
      type="button"
      className="lock-button"
      aria-pressed={locked}
      aria-label={locked ? `解除鎖定${label}` : `鎖定${label}`}
      onClick={onToggle}
    >
      <LockIcon locked={locked} />
      {locked ? '已鎖定' : '鎖定'}
    </button>
  )
}

function AmountControl({ value, step, max, locked, onChange }) {
  // 輸入中的文字；離開輸入框時才對齊到 amountStep
  const [draft, setDraft] = useState(null)

  function commit(raw) {
    const digits = Number(String(raw).replace(/[^\d]/g, ''))
    const snapped = Math.max(step, Math.round(digits / step) * step)
    onChange(snapped)
    setDraft(null)
  }

  return (
    <>
      <div className="amount-row">
        {!locked && (
          <button
            type="button"
            className="step-button"
            aria-label="減少 NT$100,000"
            onClick={() => onChange(Math.max(step, value - step))}
          >
            −
          </button>
        )}
        <input
          className="amount-input"
          inputMode="numeric"
          aria-label="交易金額"
          readOnly={locked}
          value={draft ?? formatNTD(value)}
          onFocus={() => !locked && setDraft(String(value))}
          onChange={(event) => setDraft(event.target.value.replace(/[^\d]/g, ''))}
          onBlur={() => draft !== null && commit(draft)}
          onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
        />
        {!locked && (
          <button
            type="button"
            className="step-button"
            aria-label="增加 NT$100,000"
            onClick={() => onChange(value + step)}
          >
            +
          </button>
        )}
      </div>
      {!locked && (
        <>
          <input
            className="amount-slider"
            type="range"
            min={step}
            max={Math.max(max, value)}
            step={step}
            value={value}
            aria-label="交易金額滑桿"
            title="每次調整 NT$100,000（依 Prototype 示範政策）"
            onChange={(event) => onChange(Number(event.target.value))}
          />
        </>
      )}
    </>
  )
}

function Segments({ options, value, locked, format, label, compact = false, onChange }) {
  return (
    <div className={`segments${compact ? ' is-compact' : ''}`} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={option === value}
          disabled={locked && option !== value}
          onClick={() => !locked && onChange(option)}
        >
          {format(option)}
        </button>
      ))}
    </div>
  )
}

export default function DealControls({ deal, locks, policy, amountMax, onChange, onToggleLock }) {
  return (
    <section className="panel-section" aria-label="交易條件">
      <h3 className="section-title">本次交易條件</h3>

      <div className={`control${locks.amount ? ' is-locked' : ''}`}>
        <div className="control-head">
          <span className="control-label">交易金額</span>
          <LockButton label="交易金額" locked={locks.amount} onToggle={() => onToggleLock('amount')} />
        </div>
        <AmountControl
          value={deal.dealAmount}
          step={policy.searchConfig.amountStep}
          max={amountMax}
          locked={locks.amount}
          onChange={(dealAmount) => onChange({ dealAmount })}
        />
      </div>

      <div className={`control${locks.term ? ' is-locked' : ''}`}>
        <div className="control-head">
          <span className="control-label">付款帳期</span>
          <LockButton label="付款帳期" locked={locks.term} onToggle={() => onToggleLock('term')} />
        </div>
        <Segments
          label="付款帳期"
          options={policy.allowedPaymentTerms}
          value={deal.paymentTermDays}
          locked={locks.term}
          format={(days) => `Net${days}`}
          onChange={(paymentTermDays) => onChange({ paymentTermDays })}
        />
      </div>

      <div className={`control${locks.deposit ? ' is-locked' : ''}`}>
        <div className="control-head">
          <span className="control-label">訂金比例</span>
          <LockButton label="訂金比例" locked={locks.deposit} onToggle={() => onToggleLock('deposit')} />
        </div>
        <Segments
          label="訂金比例"
          options={policy.allowedDepositRatios}
          value={deal.depositRatio}
          locked={locks.deposit}
          compact
          format={formatPercent}
          onChange={(depositRatio) => onChange({ depositRatio })}
        />
      </div>
    </section>
  )
}
