'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Trade } from '@/types/trades'
import { RiskSettings } from '@/types/portfolio'

type Props = {
  riskSettings: RiskSettings | null
  history: Trade[]
  onRefresh: () => void
}

function fmt(v: number | null | undefined, d = 0): string {
  if (v == null) return '—'
  return v.toLocaleString('ja-JP', { minimumFractionDigits: d, maximumFractionDigits: d })
}

export default function RiskTab({ riskSettings, history, onRefresh }: Props) {
  const [accountCapital, setAccountCapital] = useState('')
  const [riskPct, setRiskPct] = useState('')
  const [maxPositions, setMaxPositions] = useState('')
  const [monthlyDdLimit, setMonthlyDdLimit] = useState('')
  const [quarterlyDdLimit, setQuarterlyDdLimit] = useState('')
  const [annualDdLimit, setAnnualDdLimit] = useState('')
  const [monthStartCapital, setMonthStartCapital] = useState('')
  const [memo, setMemo] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (riskSettings) {
      setAccountCapital(riskSettings.account_capital != null ? String(riskSettings.account_capital) : '')
      setRiskPct(riskSettings.risk_pct != null ? String(riskSettings.risk_pct) : '')
      setMaxPositions(riskSettings.max_positions != null ? String(riskSettings.max_positions) : '')
      setMonthlyDdLimit(riskSettings.monthly_dd_limit != null ? String(riskSettings.monthly_dd_limit) : '')
      setQuarterlyDdLimit(riskSettings.quarterly_dd_limit != null ? String(riskSettings.quarterly_dd_limit) : '')
      setAnnualDdLimit(riskSettings.annual_dd_limit != null ? String(riskSettings.annual_dd_limit) : '')
      setMonthStartCapital(riskSettings.month_start_capital != null ? String(riskSettings.month_start_capital) : '')
      setMemo(riskSettings.memo ?? '')
    }
  }, [riskSettings])

  // Calculate monthly P&L from trade_history
  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthlyPnl = history
    .filter(h => h.exit_date?.startsWith(thisMonth) && h.pnl != null)
    .reduce((sum, h) => sum + (h.pnl ?? 0), 0)
  const monthlyPnlHasData = history.some(h => h.exit_date?.startsWith(thisMonth))

  // Derived values
  const capital = parseFloat(accountCapital)
  const rPct = parseFloat(riskPct)
  const maxPos = parseInt(maxPositions)
  const mStart = parseFloat(monthStartCapital)
  const mddLimit = parseFloat(monthlyDdLimit)
  const consecLosses = riskSettings?.consec_losses ?? 0
  const isHalfRisk = consecLosses >= 3
  const appliedRiskPct = isHalfRisk ? rPct / 2 : rPct

  const riskYenPerTrade = !isNaN(capital) && !isNaN(rPct) ? capital * rPct / 100 : null
  const maxInvestYen = !isNaN(capital) && !isNaN(maxPos) && maxPos > 0 ? capital / maxPos : null
  const monthlyDdPct = !isNaN(mStart) && mStart > 0 && monthlyPnlHasData ? (monthlyPnl / mStart) * 100 : null
  const ddOk = monthlyDdPct != null && !isNaN(mddLimit) ? monthlyDdPct > mddLimit : null

  async function handleSave() {
    setSaving(true)
    setError('')

    const record = {
      account_capital: accountCapital !== '' ? parseFloat(accountCapital) : null,
      risk_pct: riskPct !== '' ? parseFloat(riskPct) : null,
      max_positions: maxPositions !== '' ? parseInt(maxPositions) : null,
      monthly_dd_limit: monthlyDdLimit !== '' ? parseFloat(monthlyDdLimit) : null,
      quarterly_dd_limit: quarterlyDdLimit !== '' ? parseFloat(quarterlyDdLimit) : null,
      annual_dd_limit: annualDdLimit !== '' ? parseFloat(annualDdLimit) : null,
      month_start_capital: monthStartCapital !== '' ? parseFloat(monthStartCapital) : null,
      memo: memo.trim() || null,
      updated_at: new Date().toISOString(),
    }

    let err
    if (riskSettings?.id) {
      const res = await supabase.from('risk_settings').update(record).eq('id', riskSettings.id)
      err = res.error
    } else {
      const res = await supabase.from('risk_settings').insert(record)
      err = res.error
    }

    setSaving(false)
    if (err) { setError(err.message); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    onRefresh()
  }

  const inputClass = "w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
  const labelClass = "block text-xs font-medium text-gray-600 mb-1"
  const roClass = "w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2.5 text-base font-mono text-gray-700"

  return (
    <div className="space-y-5 max-w-2xl">
      {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      {/* === Capital & Risk Settings === */}
      <div className="bg-white rounded-xl border border-[#e8eaed] shadow-sm p-5">
        <h3 className="text-sm font-bold text-gray-800 mb-4">💰 Capital & Risk Settings</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Account Capital (¥)</label>
            <input type="number" inputMode="numeric" value={accountCapital}
              onChange={e => setAccountCapital(e.target.value)} placeholder="例: 5000000"
              className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Base Risk % (e.g., 2.5)</label>
            <input type="number" inputMode="numeric" value={riskPct} step="0.1"
              onChange={e => setRiskPct(e.target.value)} placeholder="例: 2.5"
              className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>→ Risk ¥/Trade (auto)</label>
            <div className={roClass}>{riskYenPerTrade != null ? `¥${fmt(riskYenPerTrade)}` : '—'}</div>
          </div>
          <div>
            <label className={labelClass}>Max Positions</label>
            <input type="number" inputMode="numeric" value={maxPositions}
              onChange={e => setMaxPositions(e.target.value)} placeholder="例: 10"
              className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>→ Max Invest ¥/Ticker (auto)</label>
            <div className={roClass}>{maxInvestYen != null ? `¥${fmt(maxInvestYen)}` : '—'}</div>
          </div>
        </div>
      </div>

      {/* === Drawdown Rules === */}
      <div className="bg-white rounded-xl border border-[#e8eaed] shadow-sm p-5">
        <h3 className="text-sm font-bold text-gray-800 mb-4">📉 Drawdown Rules</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Monthly DD Limit % (e.g., -8)</label>
            <input type="number" inputMode="numeric" value={monthlyDdLimit} step="0.1"
              onChange={e => setMonthlyDdLimit(e.target.value)} placeholder="例: -8"
              className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Quarterly DD Limit % (e.g., -15)</label>
            <input type="number" inputMode="numeric" value={quarterlyDdLimit} step="0.1"
              onChange={e => setQuarterlyDdLimit(e.target.value)} placeholder="例: -15"
              className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Annual DD Limit % (e.g., -25)</label>
            <input type="number" inputMode="numeric" value={annualDdLimit} step="0.1"
              onChange={e => setAnnualDdLimit(e.target.value)} placeholder="例: -25"
              className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Month Start Capital ¥ (update on 1st)</label>
            <input type="number" inputMode="numeric" value={monthStartCapital}
              onChange={e => setMonthStartCapital(e.target.value)} placeholder="例: 4900000"
              className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Realized P&L ¥ (auto, {thisMonth})</label>
            <div className={`${roClass} ${monthlyPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {monthlyPnlHasData ? `${monthlyPnl >= 0 ? '+' : ''}¥${fmt(monthlyPnl)}` : '—'}
            </div>
          </div>
          <div>
            <label className={labelClass}>Monthly DD % (auto)</label>
            <div className={`${roClass} ${monthlyDdPct != null ? (monthlyDdPct >= 0 ? 'text-green-600' : 'text-red-600') : ''}`}>
              {monthlyDdPct != null ? `${monthlyDdPct >= 0 ? '+' : ''}${monthlyDdPct.toFixed(2)}%` : '—'}
            </div>
          </div>
          <div>
            <label className={labelClass}>DD Check</label>
            <div className={roClass}>
              {ddOk === null ? '—' : ddOk
                ? <span className="text-green-600 font-bold">🟢 OK</span>
                : <span className="text-red-600 font-bold">🔴 NG — DD over limit</span>
              }
            </div>
          </div>
        </div>
      </div>

      {/* === Losing Streak === */}
      <div className={`rounded-xl border shadow-sm p-5 ${isHalfRisk ? 'bg-yellow-50 border-yellow-300' : 'bg-white border-[#e8eaed]'}`}>
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-sm font-bold text-gray-800">🔄 Losing Streak</h3>
          {isHalfRisk && (
            <span className="px-2 py-0.5 bg-yellow-200 text-yellow-800 rounded-full text-xs font-bold">⚠️ Risk halved</span>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Losing Streak (auto)</label>
            <div className={`${roClass} ${consecLosses >= 3 ? 'text-red-600 font-bold' : ''}`}>
              {consecLosses}
            </div>
          </div>
          <div>
            <label className={labelClass}>Applied Risk %</label>
            <div className={`${roClass} ${isHalfRisk ? 'text-orange-600 font-bold' : 'text-green-600'}`}>
              {!isNaN(appliedRiskPct) ? `${appliedRiskPct.toFixed(2)}%${isHalfRisk ? ' (halved)' : ''}` : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* Memo */}
      <div className="bg-white rounded-xl border border-[#e8eaed] shadow-sm p-5">
        <label className={labelClass}>Memo</label>
        <textarea value={memo} onChange={e => setMemo(e.target.value)} rows={3}
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          placeholder="リスク管理方針など" />
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className={`px-6 py-3 text-sm font-semibold text-white rounded-lg transition-colors min-h-[44px] disabled:opacity-50 ${saved ? 'bg-green-600' : 'bg-blue-600 hover:bg-blue-700'}`}
        >
          {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save'}
        </button>
      </div>
    </div>
  )
}
