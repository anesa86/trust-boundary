import { useRef, useState } from 'react'
import './App.css'

import { buyers } from './data/buyers.js'
import { policy } from './data/policy.js'
import { demoDeals } from './data/demoDeals.js'
import { evaluateDeal } from './engine/decisionEngine.js'

import BuyerCard from './components/BuyerCard.jsx'
import DealControls from './components/DealControls.jsx'
import ZoneStatus from './components/ZoneStatus.jsx'
import TrustBoundaryChart from './components/TrustBoundaryChart.jsx'
import ActionPanel from './components/ActionPanel.jsx'
import WhyPanel from './components/WhyPanel.jsx'

// =====================================================
// 呼叫 AI 說明 server
// 任何失敗（server 沒開、網路錯誤、API 錯誤、格式不符）都統一回傳 { ok: false }，
// 畫面只顯示「AI 暫時無法使用」；技術細節只印在開發用 console。
// =====================================================

const AI_KEYS = ['summary', 'buyer_status', 'deal_status', 'key_reasons', 'human_note']

function isValidExplanation(value) {
  return (
    value &&
    typeof value === 'object' &&
    AI_KEYS.every((key) => key in value) &&
    Array.isArray(value.key_reasons) &&
    value.key_reasons.every((reason) => typeof reason === 'string')
  )
}

async function requestAiExplanation(request, signal) {
  try {
    const response = await fetch('/api/explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    })
    if (!response.ok) {
      console.info('[AI 說明] server 回應錯誤：', response.status)
      return { ok: false }
    }

    const data = await response.json()
    if (data.source !== 'ai' || !isValidExplanation(data.explanation)) {
      console.info('[AI 說明] 改用規則說明：', data.fallbackReason ?? 'invalid-response')
      return { ok: false }
    }
    return { ok: true, explanation: data.explanation }
  } catch (error) {
    if (error?.name !== 'AbortError') {
      console.info('[AI 說明] 無法連線：', error?.message)
    }
    return { ok: false }
  }
}

const NO_LOCKS = { amount: false, term: false, deposit: false }
const AI_IDLE = { status: 'idle', explanation: null, signature: null }

// 交易狀態簽章：Buyer + 三個交易條件。AI 說明只對同一個簽章有效
function getDealSignature(buyerId, deal) {
  return `${buyerId}|${deal.dealAmount}|${deal.paymentTermDays}|${deal.depositRatio}`
}

// 金額滑桿與信任邊界圖縱軸的上限：覆核上限的 1.5 倍，取整到百萬（純顯示用）
function getAmountMax(buyer) {
  const reviewLimit = buyer.baseCreditCapacity * policy.reviewBuffer
  return Math.max(1000000, Math.ceil((reviewLimit * 1.5) / 1000000) * 1000000)
}

export default function App() {
  const [buyerId, setBuyerId] = useState(buyers[0].id)
  const [deal, setDeal] = useState(demoDeals[buyers[0].id])
  const [locks, setLocks] = useState(NO_LOCKS)
  const [aiState, setAiState] = useState(AI_IDLE)
  const aiRequestRef = useRef(null)

  const buyer = buyers.find((b) => b.id === buyerId)
  const evaluation = evaluateDeal(buyer, deal, policy)
  const amountMax = getAmountMax(buyer)
  const signature = getDealSignature(buyerId, deal)

  // 第一道保護：AI 說明的簽章和目前交易不同，就當作沒有 AI 說明
  const ai = aiState.signature === signature ? aiState : AI_IDLE

  // Buyer 或交易條件一改變：取消進行中的請求，清除 AI 說明
  function resetAi() {
    aiRequestRef.current?.controller.abort()
    aiRequestRef.current = null
    setAiState(AI_IDLE)
  }

  function selectBuyer(id) {
    resetAi()
    setBuyerId(id)
    setDeal(demoDeals[id])
    setLocks(NO_LOCKS)
  }

  function updateDeal(patch) {
    resetAi()
    setDeal((current) => ({ ...current, ...patch }))
  }

  async function requestAi() {
    const controller = new AbortController()
    const request = { id: Symbol('ai-request'), controller }
    aiRequestRef.current = request
    setAiState({ status: 'loading', explanation: null, signature })

    const result = await requestAiExplanation({ buyerId, ...deal }, controller.signal)

    // 第二道保護：回應晚到、或已經有更新的請求 → 直接丟掉，不寫入畫面
    if (aiRequestRef.current !== request) {
      return
    }
    aiRequestRef.current = null
    setAiState(
      result.ok
        ? { status: 'success', explanation: result.explanation, signature }
        : { status: 'error', explanation: null, signature },
    )
  }

  function toggleLock(key) {
    setLocks((current) => ({ ...current, [key]: !current[key] }))
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="brand-name">
          信任邊界<span className="brand-en">Trust Boundary</span>
        </h1>
        <p className="brand-sub">買家信用與條件式授信決策</p>
        <span className="prototype-tag">Prototype 模擬資料</span>
      </header>

      <main className="workspace">
        <aside className="panel-left">
          <div className="panel-section">
            <div className="buyer-switch" role="tablist" aria-label="選擇 Buyer">
              {buyers.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  role="tab"
                  aria-selected={b.id === buyerId}
                  onClick={() => selectBuyer(b.id)}
                >
                  {b.name}
                </button>
              ))}
            </div>
          </div>

          <BuyerCard buyer={buyer} />

          <DealControls
            deal={deal}
            locks={locks}
            policy={policy}
            amountMax={amountMax}
            onChange={updateDeal}
            onToggleLock={toggleLock}
          />
        </aside>

        <section className="panel-right" aria-label="評估結果">
          <ZoneStatus evaluation={evaluation} />
          <TrustBoundaryChart
            buyer={buyer}
            policy={policy}
            evaluation={evaluation}
            yMax={amountMax}
            termLocked={locks.term}
          />
          <ActionPanel
            buyer={buyer}
            deal={deal}
            policy={policy}
            locks={locks}
            evaluation={evaluation}
            onApply={updateDeal}
          />
          <WhyPanel buyer={buyer} evaluation={evaluation} ai={ai} onRequestAi={requestAi} />
        </section>
      </main>
    </div>
  )
}
