'use client'

import { useState, useEffect, useMemo } from 'react'
import { updateResilient } from '@/lib/resilientWrite'
import { Trade } from '@/types/trades'
import { SCREEN_NAME_MAP } from '@/lib/screenNames'
import { classifyResult } from '@/lib/tradeResult'
import { formatYen, formatPct } from '@/lib/format'
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

export default function EditTradeModal({ open, onClose, onSaved, trade }: Props) {
  const [ticker, setTicker] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [screenName, setScreenName] = useState('')
  const [entryDate, setEntryDate] = useState('')
  const [entryPrice, setEntryPrice] = useState('')
  const [shares, setShares] = useState('')
  const [memo, setMemo] = useState('')

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

  // PnL preview for closed trades
  const preview = useMemo(() => {
    if (!isClosed || !exitPrice || isNaN(Number(exitPrice)) || !entryPrice || isNaN(Number(entryPrice))) return null
    const ep = parseFloat(exitPrice)
    const enp = parseFloat(entryPrice)
    const sh = parseInt(shares, 10) || 0
    if (!sh) return null
    const pnl = (ep - enp) * sh
    const pnlPct = ((ep - enp) / enp) * 100
    return { pnl, pnlPct, result: classifyResult(pnl) }
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
      record.result = classifyResult(pnl)
    }

    const { error: err } = await updateResilient('trades', record, { id: trade.id })

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
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[var(--bg-card)]"
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
            {preview && (() => {
              const bg = preview.result === 'WIN' ? 'bg-emerald-50'
                : preview.result === 'LOSS' ? 'bg-red-50'
                : 'bg-[var(--bg-card-hover)]'
              const fgStrong = preview.result === 'WIN' ? 'text-emerald-700'
                : preview.result === 'LOSS' ? 'text-red-700'
                : 'text-gray-700'
              const fgWeak = preview.result === 'WIN' ? 'text-emerald-600'
                : preview.result === 'LOSS' ? 'text-red-600'
                : 'text-gray-600'
              return (
                <div className={`rounded-lg px-4 py-3 text-center ${bg}`}>
                  <p className={`text-lg font-bold font-mono ${fgStrong}`}>
                    {formatYen(preview.pnl, { sign: true })}
                    {' '}
                    ({formatPct(preview.pnlPct, { sign: true })})
                  </p>
                  <p className={`text-xs font-semibold ${fgWeak}`}>
                    {preview.result}
                  </p>
                </div>
              )
            })()}
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
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-[var(--bg-card-hover)] transition-colors min-h-[44px]"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors min-h-[44px] disabled:opacity-50"
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
