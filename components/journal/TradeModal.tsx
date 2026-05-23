'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { SCREEN_NAME_MAP } from '@/lib/screenNames'
import Modal from '@/components/shared/Modal'

type Props = {
  open: boolean
  onClose: () => void
  onSaved: () => void
  initial?: {
    ticker?: string
    company_name?: string
    screen_name?: string
    // シグナルスナップショット
    sector_s33?: string
    signal_price?: number
    rs_at_entry?: number
    rvol_at_entry?: number
    adr_at_entry?: number
    dist_ema21_at_entry?: number
    stop_pct_at_entry?: number
    mc_met_at_entry?: boolean
    mc_condition_at_entry?: string
  }
}

const today = () => new Date().toISOString().slice(0, 10)

// スクリーン選択肢: raw name → display name
const SCREEN_OPTIONS = Object.entries(SCREEN_NAME_MAP).map(([raw, display]) => ({
  value: raw,
  label: display,
}))

export default function TradeModal({ open, onClose, onSaved, initial }: Props) {
  const [ticker, setTicker] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [screenName, setScreenName] = useState('')
  const [entryDate, setEntryDate] = useState(today())
  const [entryPrice, setEntryPrice] = useState('')
  const [shares, setShares] = useState('')
  const [memo, setMemo] = useState('')
  const [mcScore, setMcScore] = useState<number | null>(null)
  const [mcRegime, setMcRegime] = useState<string | null>(null)
  const [mcLoading, setMcLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // フォーム初期化
  useEffect(() => {
    if (open) {
      setTicker(initial?.ticker ?? '')
      setCompanyName(initial?.company_name ?? '')
      setScreenName(initial?.screen_name ?? '')
      setEntryDate(today())
      setEntryPrice('')
      setShares('')
      setMemo('')
      setMcScore(null)
      setMcRegime(null)
      setError('')
    }
  }, [open, initial])

  // entry_date 変更時に MC v4 Score を自動取得
  useEffect(() => {
    if (!open || !entryDate) return
    let cancelled = false

    async function fetchMc() {
      setMcLoading(true)
      const { data } = await supabase
        .from('market_conditions')
        .select('mc_v4, mc_regime_v4, scorecard_regime')
        .lte('date', entryDate)
        .order('date', { ascending: false })
        .limit(1)
        .single()

      if (!cancelled && data) {
        const d = data as Record<string, unknown>
        const v4 = d.mc_v4 as number | null | undefined
        if (v4 != null) {
          setMcScore(v4)
          setMcRegime((d.mc_regime_v4 as string | null) ?? (d.scorecard_regime as string | null) ?? null)
        } else {
          // v4 未集計の日付は空欄のまま (手入力で対応)
          setMcScore(null)
          setMcRegime((d.mc_regime_v4 as string | null) ?? (d.scorecard_regime as string | null) ?? null)
        }
      } else if (!cancelled) {
        setMcScore(null)
        setMcRegime(null)
      }
      if (!cancelled) setMcLoading(false)
    }

    fetchMc()
    return () => { cancelled = true }
  }, [open, entryDate])

  async function handleSave() {
    if (!ticker.trim()) { setError('銘柄コードは必須です'); return }
    if (!entryDate) { setError('エントリー日は必須です'); return }
    if (!entryPrice || isNaN(Number(entryPrice))) { setError('エントリー価格は必須です'); return }
    if (!shares || isNaN(Number(shares))) { setError('株数は必須です'); return }

    setSaving(true)
    setError('')

    // MC regime を表示用に変換
    const regimeMap: Record<string, string> = {
      strong_bull: 'Strong Bull',
      bull: 'Bull',
      neutral: 'Neutral',
      bear: 'Bear',
      strong_bear: 'Strong Bear',
    }

    const record: Record<string, unknown> = {
      ticker: ticker.trim(),
      company_name: companyName.trim() || null,
      screen_name: screenName || null,
      entry_date: entryDate,
      entry_price: parseFloat(entryPrice),
      shares: parseInt(shares, 10),
      mc_score: mcScore,
      mc_regime: mcRegime ? (regimeMap[mcRegime] ?? mcRegime) : null,
      mc_score_version: 'v4',
      memo: memo.trim() || null,
      status: 'open',
      // シグナルスナップショット（Signalsページから渡された場合のみ値が入る）
      sector_s33: initial?.sector_s33 ?? null,
      signal_price: initial?.signal_price ?? null,
      rs_at_entry: initial?.rs_at_entry ?? null,
      rvol_at_entry: initial?.rvol_at_entry ?? null,
      adr_at_entry: initial?.adr_at_entry ?? null,
      dist_ema21_at_entry: initial?.dist_ema21_at_entry ?? null,
      stop_pct_at_entry: initial?.stop_pct_at_entry ?? null,
      mc_met_at_entry: initial?.mc_met_at_entry ?? null,
      mc_condition_at_entry: initial?.mc_condition_at_entry ?? null,
    }

    const { error: err } = await supabase.from('trades').insert(record)

    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
    onClose()
  }

  const regimeLabel: Record<string, string> = {
    strong_bull: 'Strong Bull',
    bull: 'Bull',
    neutral: 'Neutral',
    bear: 'Bear',
    strong_bear: 'Strong Bear',
  }

  return (
    <Modal open={open} onClose={onClose} title="New Trade">
      <div className="px-6 py-5 space-y-4">
        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Ticker */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Ticker <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={ticker}
              onChange={e => setTicker(e.target.value)}
              placeholder="例: 7203"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Company Name */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
            <input
              type="text"
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              placeholder="例: トヨタ自動車"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Screen Name */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Screen</label>
            <select
              value={screenName}
              onChange={e => setScreenName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">-- Select --</option>
              {SCREEN_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
              <option value="other">Other</option>
            </select>
          </div>

          {/* Entry Date */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Entry Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={entryDate}
              onChange={e => setEntryDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Entry Price */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Entry Price <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              inputMode="numeric"
              value={entryPrice}
              onChange={e => setEntryPrice(e.target.value)}
              placeholder="例: 3850"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Shares */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Shares <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              inputMode="numeric"
              value={shares}
              onChange={e => setShares(e.target.value)}
              placeholder="例: 100"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* シグナル情報パネル（Signalsページからの場合のみ表示） */}
        {initial?.rs_at_entry != null && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Signal data (auto-filled)</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs">
              <span className="text-gray-500">RS: <strong className="text-gray-800">{initial.rs_at_entry?.toFixed(1)}</strong></span>
              <span className="text-gray-500">RVOL: <strong className={`${(initial.rvol_at_entry ?? 0) >= 2 ? 'text-emerald-600' : 'text-gray-800'}`}>{initial.rvol_at_entry?.toFixed(2)}</strong></span>
              <span className="text-gray-500">ADR%: <strong className="text-gray-800">{initial.adr_at_entry?.toFixed(1)}</strong></span>
              <span className="text-gray-500">EMA21(R): <strong className="text-gray-800">{initial.dist_ema21_at_entry?.toFixed(2)}</strong></span>
              <span className="text-gray-500">Stop%: <strong className="text-gray-800">{initial.stop_pct_at_entry?.toFixed(1)}</strong></span>
              {initial.sector_s33 && <span className="text-gray-500">Sector: <strong className="text-gray-800">{initial.sector_s33}</strong></span>}
              {initial.signal_price != null && <span className="text-gray-500">Price: <strong className="text-gray-800">&yen;{initial.signal_price.toLocaleString()}</strong></span>}
              {initial.mc_condition_at_entry && (
                <span className="text-gray-500">MC: <strong className={initial.mc_met_at_entry ? 'text-emerald-600' : 'text-gray-400'}>{initial.mc_condition_at_entry} {initial.mc_met_at_entry ? '\u2705' : '\u274c'}</strong></span>
              )}
            </div>
          </div>
        )}

        {/* MC Score 表示 */}
        <div className="bg-gray-50 rounded-lg px-4 py-3">
          <span className="text-xs font-medium text-gray-500">MC Score: </span>
          {mcLoading ? (
            <span className="text-xs text-gray-400">Loading...</span>
          ) : mcScore != null ? (
            <span className="text-sm font-semibold text-gray-800">
              {Number(mcScore).toFixed(1)}/100
              {' '}({regimeLabel[mcRegime ?? ''] ?? mcRegime ?? '—'})
            </span>
          ) : (
            <span className="text-xs text-gray-400">Not available</span>
          )}
        </div>

        {/* Memo */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Memo</label>
          <textarea
            value={memo}
            onChange={e => setMemo(e.target.value)}
            rows={2}
            placeholder="エントリー理由など"
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors min-h-[44px]"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors min-h-[44px] disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
