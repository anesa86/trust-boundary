import { useState } from 'react'
import './App.css'

import { buyers } from './data/buyers.js'
import { policy } from './data/policy.js'
import { demoDeals } from './data/demoDeals.js'
import { evaluateDeal } from './engine/decisionEngine.js'

import BuyerCard from './components/BuyerCard.jsx'
import DealControls from './components/DealControls.jsx'
import ZoneStatus from './components/ZoneStatus.jsx'
import TrustBoundaryChart from './components/TrustBoundaryChart.jsx'

const NO_LOCKS = { amount: false, term: false, deposit: false }

// 金額滑桿與信任邊界圖縱軸的上限：覆核上限的 1.5 倍，取整到百萬（純顯示用）
function getAmountMax(buyer) {
  const reviewLimit = buyer.baseCreditCapacity * policy.reviewBuffer
  return Math.max(1000000, Math.ceil((reviewLimit * 1.5) / 1000000) * 1000000)
}

export default function App() {
  const [buyerId, setBuyerId] = useState(buyers[0].id)
  const [deal, setDeal] = useState(demoDeals[buyers[0].id])
  const [locks, setLocks] = useState(NO_LOCKS)

  const buyer = buyers.find((b) => b.id === buyerId)
  const evaluation = evaluateDeal(buyer, deal, policy)
  const amountMax = getAmountMax(buyer)

  function selectBuyer(id) {
    setBuyerId(id)
    setDeal(demoDeals[id])
    setLocks(NO_LOCKS)
  }

  function updateDeal(patch) {
    setDeal((current) => ({ ...current, ...patch }))
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
        </section>
      </main>
    </div>
  )
}
