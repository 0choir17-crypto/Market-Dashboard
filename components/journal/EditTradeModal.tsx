'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Trade } from '@/types/trades'
import { SCREEN_NAME_MAP } from '@/lib/screenNames'
import Modal from '@/components/shared/Modal'

type Props = {
  open: boolean
  onClose: () => void
  onSaved: () => void
  trade: Trade | null
}

const SCREEN_OPTIONS = Object.entries(SCREEN_NAME_MAP).map(([raw, display]) => ({
  value: raw,
  label: display,
}))

const REGIME_MAP: Record<string, string> = {
  strong_bull: 'Strong Bull',
  bull: 'Bull',
  neutral: 'Neutral',
  bear: 'Bear',
  strong_bear: 'Strong Bear',
}

const REGIME_LABEL: Record<string, string> = { ...REGIME_MAP }

export default function EditTradeModal({ open, onClose, onSaved, trade }: Props) {
  const [ticker, setTicker] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [screenName, setScreenName] = useState('')
  const [entryDate, setEntryDate] = useState('')
  const [entryPrice, setEntryPrice] = useState('')
  const [shares, setShares] = useState('')
  const [memo, setMemo] = useState('')
  const [mcScore, setMcScore] = useState<number | null>(null)
  const [mcRegime, setMcRegime] = useState<string | null>(null)
  const [mcLoading, setMcLoading] = useState(false)

  // CLOSED trades: exit fields
  const [exitDate, setExitDate] = useState('')
  const [exitPrice, setExitPrice] = useState('')

  // Signal snapshot fields
  const [signalPrice, setSignalPrice] = useState('')
  const [rsAtEntry, setRsAtEntry] = useState('')
  const [rvolAtEntry, setRvolAtEntry] = useState('')
  const [adrAtEntry, setAdrAtEntry] = useState('')
  const [distEma21AtEntry, setDistEma21AtEntry] = useState('')
  const [stopPctAtEntry, setStopPctAtEntry] = useState('')
  const [mcMetAtEntry, setMcMetAtEntry] = useState(false)
  const [mcConditionAtEntry, setMcConditionAtEntry] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const isClosed = trade?.status === 'closed'

  const toStr = (v: number | null | undefined) => v == null ? '' : String(v)
  const toNum = (v: string): number | null => {
    if (v.trim() === '') return null
    const n = Number(v)
    return isNaN(n) ? null : n
  }

  // Populate form from trade
  useEffect(() => {
    if (open && trade) {
      setTicker(trade.ticker)
      setCompanyName(trade.company_name ?? '')
      setScreenName(trade.screen_name ?? '')
      setEntryDate(trade.entry_date)
      setEntryPrice(String(trade.entry_price))
      setShares(String(trade.shares))
      setMemo(trade.memo ?? '')
      // legacy v3 (0-21) は読み込み時点で 0-100 へ正規化。保存時は常に v4 として書き戻す。
      const rawScore = trade.mc_score
      const wasV4 = trade.mc_score_version === 'v4'
      setMcScore(rawScore == null ? null : wasV4 ? rawScore : (rawScore / 21) * 100)
      setMcRegime(trade.mc_regime)
      setExitDate(trade.exit_date ?? '')
      setExitPrice(trade.exit_price != null ? String(trade.exit_price) : '')
      setSignalPrice(toStr(trade.signal_price))
      setRsAtEntry(toStr(trade.rs_at_entry))
      setRvolAtEntry(toStr(trade.rvol_at_entry))
      setAdrAtEntry(toStr(trade.adr_at_entry))
      setDistEma21AtEntry(toStr(trade.dist_ema21_at_entry))
      setStopPctAtEntry(toStr(trade.stop_pct_at_entry))
      setMcMetAtEntry(trade.mc_met_at_entry ?? false)
      setMcConditionAtEntry(trade.mc_condition_at_entry ?? '')
      setError('')
    }
  }, [open, trade])

  // Re-fetch MC Score when entry_date changes
  useEffect(() => {
    if (!open || !entryDate) return
    // Skip if date hasn't changed from original
    if (trade && entryDate === trade.entry_date) return

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
  }, [open, entryDate, trade])

  // PnL preview for closed trades
  const preview = useMemo(() => {
    if (!isClosed || !exitPrice || isNaN(Number(exitPrice)) || !entryPrice || isNaN(Number(entryPrice))) return null
    const ep = parseFloat(exitPrice)
    const enp = parseFloat(entryPrice)
    const sh = parseInt(shares, 10) || 0
    if (!sh) return null
    const pnl = (ep - enp) * sh
    const pnlPct = ((ep - enp) / enp) * 100
    return { pnl, pnlPct, result: pnl > 0 ? 'WIN' : 'LOSS' }
  }, [isClosed, exitPrice, entryPrice, shares])

  async function handleSave() {
    if (!trade) return
    if (!ticker.trim()) { setError('銘柄コードは必須です'); return }
    if (!entryDate) { setError('エントリー日は必須です'); return }
    if (!entryPrice || isNaN(Number(entryPrice))) { setError('エントリー価格は必須です'); return }
    if (!shares || isNaN(Number(shares))) { setError('株数は必須です'); return }

    if (isClosed) {
      if (!exitDate) { setError('イグジット日は必須です'); return }
      if (!exitPrice || isNaN(Number(exitPrice))) { setError('イグジット価格は必須です'); return }
    }

    setSaving(true)
    setError('')

    const record: Record<string, unknown> = {
      ticker: ticker.trim(),
      company_name: companyName.trim() || null,
      screen_name: screenName || null,
      entry_date: entryDate,
      entry_price: parseFloat(entryPrice),
      shares: parseInt(shares, 10),
      mc_score: mcScore,
      mc_regime: mcRegime ? (REGIME_MAP[mcRegime] ?? mcRegime) : null,
      mc_score_version: 'v4',
      memo: memo.trim() || null,
      signal_price: toNum(signalPrice),
      rs_at_entry: toNum(rsAtEntry),
      rvol_at_entry: toNum(rvolAtEntry),
      adr_at_entry: toNum(adrAtEntry),
      dist_ema21_at_entry: toNum(distEma21AtEntry),
      stop_pct_at_entry: toNum(stopPctAtEntry),
      mc_met_at_entry: mcMetAtEntry,
      mc_condition_at_entry: mcConditionAtEntry.trim() || null,
      updated_at: new Date().toISOString(),
    }

    // Recalculate PnL for closed trades
    if (isClosed) {
      const ep = parseFloat(exitPrice)
      const enp = parseFloat(entryPrice)
      const sh = parseInt(shares, 10)
      const pnl = (ep - enp) * sh
      const pnlPct = ((ep - enp) / enp) * 100
      record.exit_date = exitDate
      record.exit_price = ep
      record.pnl = pnl
      record.pnl_pct = pnlPct
      record.result = pnl > 0 ? 'WIN' : 'LOSS'
    }

    const { error: err } = await supabase
      .from('trades')
      .update(record)
      .eq('id', trade.id)

    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
    onClose()
  }

  if (!trade) return null

  return (
    <Modal open={open} onClose={onClose} title="Edit Trade">
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
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* MC Score */}
        <div className="bg-gray-50 rounded-lg px-4 py-3">
          <span className="text-xs font-medium text-gray-500">MC Score: </span>
          {mcLoading ? (
            <span className="text-xs text-gray-400">Loading...</span>
          ) : mcScore != null ? (
            <span className="text-sm font-semibold text-gray-800">
              {Number(mcScore).toFixed(1)}/100
              {' '}({REGIME_LABEL[mcRegime ?? ''] ?? mcRegime ?? '—'})
            </span>
          ) : (
            <span className="text-xs text-gray-400">Not available</span>
          )}
        </div>

        {/* Exit fields for CLOSED trades */}
        {isClosed && (
          <>
            <div className="border-t border-gray-200 pt-4">
              <p className="text-xs font-semibold text-gray-500 mb-3">Exit</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Exit Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={exitDate}
                    onChange={e => setExitDate(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Exit Price <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={exitPrice}
                    onChange={e => setExitPrice(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* PnL preview */}
            {preview && (
              <div className={`rounded-lg px-4 py-3 text-center ${
                preview.result === 'WIN' ? 'bg-emerald-50' : 'bg-red-50'
              }`}>
                <p className={`text-lg font-bold ${
                  preview.result === 'WIN' ? 'text-emerald-700' : 'text-red-700'
                }`}>
                  {preview.pnl >= 0 ? '+' : ''}&yen;{preview.pnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  {' '}
                  ({preview.pnlPct >= 0 ? '+' : ''}{preview.pnlPct.toFixed(2)}%)
                </p>
                <p className={`text-xs font-semibold ${
                  preview.result === 'WIN' ? 'text-emerald-600' : 'text-red-600'
                }`}>
                  {preview.result}
                </p>
              </div>
            )}
          </>
        )}

        {/* Signal Snapshot */}
        <div className="border-t border-gray-200 pt-4">
          <p className="text-xs font-semibold text-gray-500 mb-3">📝 Signal Snapshot</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Signal Price</label>
              <input
                type="number"
                inputMode="decimal"
                value={signalPrice}
                onChange={e => setSignalPrice(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">RS (0-100)</label>
              <input
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={rsAtEntry}
                onChange={e => setRsAtEntry(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">RVOL</label>
              <input
                type="number"
                step="0.1"
                value={rvolAtEntry}
                onChange={e => setRvolAtEntry(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">ADR%</label>
              <input
                type="number"
                step="0.1"
                value={adrAtEntry}
                onChange={e => setAdrAtEntry(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">EMA21 Dist (R)</label>
              <input
                type="number"
                step="0.1"
                value={distEma21AtEntry}
                onChange={e => setDistEma21AtEntry(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Stop%</label>
              <input
                type="number"
                step="0.1"
                value={stopPctAtEntry}
                onChange={e => setStopPctAtEntry(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">MC Condition</label>
              <input
                type="text"
                value={mcConditionAtEntry}
                onChange={e => setMcConditionAtEntry(e.target.value)}
                placeholder="例: MC≤9"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-end">
              <label className="inline-flex items-center gap-2 text-sm text-gray-700 py-2">
                <input
                  type="checkbox"
                  checked={mcMetAtEntry}
                  onChange={e => setMcMetAtEntry(e.target.checked)}
                  className="w-4 h-4 accent-blue-600"
                />
                MC Met
              </label>
            </div>
          </div>
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
