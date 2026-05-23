'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Trade } from '@/types/trades'
import { SCREEN_NAME_MAP } from '@/lib/screenNames'
import { calculateMfeMae } from '@/lib/mfeMae'
import Modal from '@/components/shared/Modal'

type Props = {
  open: boolean
  onClose: () => void
  onSaved: () => void
  trade: Trade | null
}

const today = () => new Date().toISOString().slice(0, 10)

export default function CloseTradeModal({ open, onClose, onSaved, trade }: Props) {
  const [exitDate, setExitDate] = useState(today())
  const [exitPrice, setExitPrice] = useState('')
  const [exitReason, setExitReason] = useState('利確')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const EXIT_REASONS = ['利確', '損切', 'トレール損切', '目標達成', 'その他']

  useEffect(() => {
    if (open) {
      setExitDate(today())
      setExitPrice('')
      setExitReason('利確')
      setError('')
    }
  }, [open])

  // リアルタイム損益計算
  const preview = useMemo(() => {
    if (!trade || !exitPrice || isNaN(Number(exitPrice))) return null
    const ep = parseFloat(exitPrice)
    const pnl = (ep - trade.entry_price) * trade.shares
    const pnlPct = ((ep - trade.entry_price) / trade.entry_price) * 100
    return { pnl, pnlPct, result: pnl > 0 ? 'WIN' : 'LOSS' }
  }, [trade, exitPrice])

  async function handleSave() {
    if (!trade) return
    if (!exitDate) { setError('イグジット日は必須です'); return }
    if (!exitPrice || isNaN(Number(exitPrice))) { setError('イグジット価格は必須です'); return }

    setSaving(true)
    setError('')

    const ep = parseFloat(exitPrice)
    const pnl = (ep - trade.entry_price) * trade.shares
    const pnlPct = ((ep - trade.entry_price) / trade.entry_price) * 100
    const result = pnl > 0 ? 'WIN' : 'LOSS'

    // R倍率計算（stop_priceがある場合）
    const rMult =
      trade.stop_price != null && trade.entry_price !== trade.stop_price
        ? (ep - trade.entry_price) / (trade.entry_price - trade.stop_price)
        : null

    const { error: err } = await supabase
      .from('trades')
      .update({
        exit_date: exitDate,
        exit_price: ep,
        pnl,
        pnl_pct: pnlPct,
        result,
        r_multiple: rMult,
        exit_reason: exitReason,
        status: 'closed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', trade.id)

    if (err) { setSaving(false); setError(err.message); return }

    // MFE/MAE 計算（失敗してもクローズは成功扱い）
    try {
      const mfeMae = await calculateMfeMae(trade.ticker, trade.entry_date, exitDate, trade.entry_price)
      if (mfeMae) {
        await supabase.from('trades').update(mfeMae).eq('id', trade.id)
      }
    } catch (e) {
      console.warn('MFE/MAE計算スキップ:', e)
    }

    // consec_losses 更新
    const { data: riskData } = await supabase
      .from('risk_settings')
      .select('id, consec_losses')
      .limit(1)
      .maybeSingle()

    const prevLosses = riskData?.consec_losses ?? 0
    const newLosses = (rMult != null && rMult < 0) || (rMult == null && pnl < 0) ? prevLosses + 1 : 0

    if (riskData?.id) {
      await supabase
        .from('risk_settings')
        .update({ consec_losses: newLosses, updated_at: new Date().toISOString() })
        .eq('id', riskData.id)
    } else {
      await supabase.from('risk_settings').insert({ consec_losses: newLosses })
    }

    setSaving(false)
    onSaved()
    onClose()
  }

  if (!trade) return null

  const screenDisplay = trade.screen_name
    ? (SCREEN_NAME_MAP[trade.screen_name] ?? trade.screen_name)
    : '—'

  return (
    <Modal open={open} onClose={onClose} title="Close Trade">
      <div className="px-6 py-5 space-y-4">
        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
        )}

        {/* トレード情報 */}
        <div className="bg-gray-50 rounded-lg px-4 py-3 space-y-1">
          <p className="text-sm font-semibold text-gray-900">
            {trade.ticker} {trade.company_name ?? ''}
          </p>
          <p className="text-xs text-gray-500">
            {screenDisplay} &middot; Entry: {trade.entry_date} &middot; &yen;{trade.entry_price.toLocaleString()} &times; {trade.shares} sh
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Exit Date */}
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

          {/* Exit Price */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Exit Price <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              inputMode="numeric"
              value={exitPrice}
              onChange={e => setExitPrice(e.target.value)}
              placeholder="例: 4100"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Exit Reason */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Exit Reason</label>
            <select
              value={exitReason}
              onChange={e => setExitReason(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {EXIT_REASONS.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
        </div>

        {/* リアルタイム損益プレビュー */}
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
            {saving ? 'Confirming...' : 'Confirm'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
