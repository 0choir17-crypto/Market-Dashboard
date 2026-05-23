'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { WatchlistItem } from '@/types/portfolio'
import Modal from '@/components/shared/Modal'

type Props = {
  open: boolean
  onClose: () => void
  onSaved: () => void
  initial?: Partial<WatchlistItem>
}

const today = () => new Date().toISOString().slice(0, 10)

export default function WatchlistModal({ open, onClose, onSaved, initial }: Props) {
  const isEdit = !!initial?.id

  const [ticker, setTicker] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [watchDate, setWatchDate] = useState(today())
  const [screenTag, setScreenTag] = useState('')
  const [entryPrice, setEntryPrice] = useState('')
  const [stopPrice, setStopPrice] = useState('')
  const [targetR, setTargetR] = useState('')
  const [memo, setMemo] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setTicker(initial?.ticker ?? '')
      setCompanyName(initial?.company_name ?? '')
      // 新規追加時は常に今日の日付。編集時のみ既存の watch_date を保持
      setWatchDate(initial?.watch_date ?? today())
      setScreenTag(initial?.screen_tag ?? '')
      setEntryPrice(initial?.entry_price != null ? String(initial.entry_price) : '')
      setStopPrice(initial?.stop_price != null ? String(initial.stop_price) : '')
      setTargetR(initial?.target_r != null ? String(initial.target_r) : '')
      setMemo(initial?.memo ?? '')
      setError('')
    }
  }, [open, initial])

  async function handleSave() {
    if (!ticker.trim()) { setError('Ticker は必須です'); return }
    setSaving(true)
    setError('')

    const record: Record<string, unknown> = {
      ticker: ticker.trim().toUpperCase(),
      company_name: companyName.trim() || null,
      watch_date: isEdit ? watchDate : today(),
      screen_tag: screenTag.trim() || null,
      entry_price: entryPrice !== '' ? parseFloat(entryPrice) : null,
      stop_price: stopPrice !== '' ? parseFloat(stopPrice) : null,
      target_r: targetR !== '' ? parseFloat(targetR) : null,
      memo: memo.trim() || null,
      updated_at: new Date().toISOString(),
      // シグナルスナップショット（Signalsページから渡された場合のみ値が入る）
      rs_composite: initial?.rs_composite ?? null,
      rvol: initial?.rvol ?? null,
      adr_pct: initial?.adr_pct ?? null,
      dist_ema21_r: initial?.dist_ema21_r ?? null,
      stop_pct: initial?.stop_pct ?? null,
      mc_met: initial?.mc_met ?? null,
      mc_condition: initial?.mc_condition ?? null,
      sector_s33: initial?.sector_s33 ?? null,
      signal_price: initial?.signal_price ?? null,
    }

    const { error: err } = isEdit
      ? await supabase.from('watchlist').update(record).eq('id', initial!.id!)
      : await supabase.from('watchlist').insert(record)

    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Watch' : 'Add Watch'}>
      <div className="px-6 py-5 space-y-4">
        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
        )}

        {/* シグナル情報パネル（Signalsページからの場合のみ表示） */}
        {initial?.rs_composite != null && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Signal data (auto-filled)</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs">
              <span className="text-gray-500">RS: <strong className="text-gray-800">{initial.rs_composite?.toFixed(1)}</strong></span>
              <span className="text-gray-500">RVOL: <strong className={`${(initial.rvol ?? 0) >= 2 ? 'text-emerald-600' : 'text-gray-800'}`}>{initial.rvol?.toFixed(2)}</strong></span>
              <span className="text-gray-500">ADR%: <strong className="text-gray-800">{initial.adr_pct?.toFixed(1)}</strong></span>
              <span className="text-gray-500">EMA21(R): <strong className="text-gray-800">{initial.dist_ema21_r?.toFixed(2)}</strong></span>
              <span className="text-gray-500">Stop%: <strong className="text-gray-800">{initial.stop_pct?.toFixed(1)}</strong></span>
              {initial.sector_s33 && <span className="text-gray-500">Sector: <strong className="text-gray-800">{initial.sector_s33}</strong></span>}
              {initial.signal_price != null && <span className="text-gray-500">Price: <strong className="text-gray-800">&yen;{initial.signal_price.toLocaleString()}</strong></span>}
              {initial.mc_condition && (
                <span className="text-gray-500">MC: <strong className={initial.mc_met ? 'text-emerald-600' : 'text-gray-400'}>{initial.mc_condition} {initial.mc_met ? '\u2705' : '\u274c'}</strong></span>
              )}
            </div>
          </div>
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

          {/* Watch Date（追加日は自動入力） */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Added Date</label>
            <div className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2.5 text-base text-gray-600 font-mono">
              {isEdit ? watchDate : today()}
              <span className="ml-2 text-[10px] text-gray-400">自動</span>
            </div>
          </div>

          {/* Screen Tag */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Screen Tag</label>
            <input
              type="text"
              value={screenTag}
              onChange={e => setScreenTag(e.target.value)}
              placeholder="例: DIV_DY_Incr_EpsGr"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Entry Price */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Signal Price</label>
            <input
              type="number"
              inputMode="numeric"
              value={entryPrice}
              onChange={e => setEntryPrice(e.target.value)}
              placeholder="例: 2500"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Stop Price */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Stop Price</label>
            <input
              type="number"
              inputMode="numeric"
              value={stopPrice}
              onChange={e => setStopPrice(e.target.value)}
              placeholder="例: 2350"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Target R */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">R Target</label>
            <input
              type="number"
              inputMode="numeric"
              value={targetR}
              onChange={e => setTargetR(e.target.value)}
              placeholder="例: 3.0"
              step="0.1"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Memo */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Memo</label>
          <textarea
            value={memo}
            onChange={e => setMemo(e.target.value)}
            rows={3}
            placeholder="スクリーニング理由など"
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
