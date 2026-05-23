'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Trade } from '@/types/trades'
import Modal from '@/components/shared/Modal'

type Props = {
  open: boolean
  onClose: () => void
  onSaved: () => void
  position: Trade | null
}

const today = () => new Date().toISOString().slice(0, 10)

const EXIT_REASONS = ['利確', '損切', 'トレール損切', '目標達成', 'その他']

const SHARE_LOT = 100

export default function CloseModal({ open, onClose, onSaved, position }: Props) {
  const [exitPrice, setExitPrice] = useState('')
  const [exitDate, setExitDate] = useState(today())
  const [exitReason, setExitReason] = useState('利確')
  const [sellShares, setSellShares] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setExitPrice('')
      setExitDate(today())
      setExitReason('利確')
      setSellShares(position ? String(position.shares) : '')
      setError('')
    }
  }, [open, position])

  if (!position) return null

  const ep = parseFloat(exitPrice)
  const parsedSellShares = parseInt(sellShares, 10)
  const effectiveSellShares = Number.isFinite(parsedSellShares) && parsedSellShares > 0
    ? parsedSellShares
    : position.shares
  const isPartial = effectiveSellShares < position.shares
  const realizedPnl = !isNaN(ep) ? (ep - position.entry_price) * effectiveSellShares : null
  const rMultiple =
    !isNaN(ep) && position.stop_price != null && position.entry_price !== position.stop_price
      ? (ep - position.entry_price) / (position.entry_price - position.stop_price)
      : null

  async function handleClose() {
    if (exitPrice === '') { setError('売値は必須です'); return }
    if (!exitDate) { setError('売却日は必須です'); return }
    if (!position) return

    // 売却株数 validation: 100株単位、1株以上、保有株以下
    const parsed = parseInt(sellShares, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('売却株数は1株以上で入力してください'); return
    }
    if (parsed > position.shares) {
      setError(`売却株数は保有株数 ${position.shares} 以下にしてください`); return
    }
    if (parsed % SHARE_LOT !== 0) {
      setError(`売却株数は ${SHARE_LOT} 株単位で入力してください`); return
    }

    setSaving(true)
    setError('')

    const ep2 = parseFloat(exitPrice)
    const closeShares = parsed
    const remainingShares = position.shares - closeShares
    const isPartialClose = remainingShares > 0
    const pnl = (ep2 - position.entry_price) * closeShares
    const rMult =
      position.stop_price != null && position.entry_price !== position.stop_price
        ? (ep2 - position.entry_price) / (position.entry_price - position.stop_price)
        : null
    const pnlPct = position.entry_price > 0
      ? ((ep2 - position.entry_price) / position.entry_price) * 100
      : null

    if (isPartialClose) {
      // Partial close: insert a new closed trade record for the sold portion
      // and reduce the shares on the original (still-open) position.
      const closedCostBasis = position.cost_basis != null
        ? position.cost_basis * (closeShares / position.shares)
        : null
      const remainingCostBasis = position.cost_basis != null
        ? position.cost_basis * (remainingShares / position.shares)
        : position.cost_basis

      const closedRecord = {
        ticker: position.ticker,
        company_name: position.company_name,
        screen_name: position.screen_name,
        entry_date: position.entry_date,
        entry_price: position.entry_price,
        shares: closeShares,
        exit_date: exitDate,
        exit_price: ep2,
        pnl: pnl,
        pnl_pct: pnlPct,
        result: pnl >= 0 ? 'WIN' : 'LOSS',
        mc_score: position.mc_score,
        mc_regime: position.mc_regime,
        mc_score_version: position.mc_score_version ?? 'v4',
        memo: position.memo,
        status: 'closed',
        sector_s33: position.sector_s33,
        stop_price: position.stop_price,
        stop_21l: position.stop_21l,
        cost_basis: closedCostBasis,
        init_risk_pct: position.init_risk_pct,
        target_r: position.target_r,
        exit_reason: exitReason,
        r_multiple: rMult,
        signal_price: position.signal_price,
        rs_at_entry: position.rs_at_entry,
        rvol_at_entry: position.rvol_at_entry,
        adr_at_entry: position.adr_at_entry,
        dist_ema21_at_entry: position.dist_ema21_at_entry,
        stop_pct_at_entry: position.stop_pct_at_entry,
        mc_met_at_entry: position.mc_met_at_entry,
        mc_condition_at_entry: position.mc_condition_at_entry,
        updated_at: new Date().toISOString(),
      }

      const { error: insertErr } = await supabase.from('trades').insert(closedRecord)
      if (insertErr) { setSaving(false); setError(insertErr.message); return }

      const { error: updateErr } = await supabase
        .from('trades')
        .update({
          shares: remainingShares,
          cost_basis: remainingCostBasis,
          updated_at: new Date().toISOString(),
        })
        .eq('id', position.id)
      if (updateErr) { setSaving(false); setError(updateErr.message); return }
    } else {
      // Full close: update existing trade in place
      const { error: updateErr } = await supabase
        .from('trades')
        .update({
          exit_date: exitDate,
          exit_price: ep2,
          pnl: pnl,
          pnl_pct: pnlPct,
          r_multiple: rMult,
          exit_reason: exitReason,
          result: pnl >= 0 ? 'WIN' : 'LOSS',
          status: 'closed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', position.id)
      if (updateErr) { setSaving(false); setError(updateErr.message); return }
    }

    // 3. Update consec_losses in risk_settings
    const { data: riskData } = await supabase
      .from('risk_settings')
      .select('id, consec_losses')
      .limit(1)
      .maybeSingle()

    const prevLosses = riskData?.consec_losses ?? 0
    const newLosses = (rMult != null && rMult < 0) ? prevLosses + 1 : 0

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

  return (
    <Modal open={open} onClose={onClose} title={`Close: ${position.ticker}`}>
      <div className="px-6 py-5 space-y-4">
        {/* Position summary */}
        <div className="bg-gray-50 rounded-lg px-4 py-3 text-xs text-gray-600 grid grid-cols-3 gap-2">
          <div><span className="text-gray-400 block">Entry Price</span>¥{position.entry_price.toLocaleString()}</div>
          <div><span className="text-gray-400 block">Shares</span>{position.shares.toLocaleString()} sh</div>
          <div><span className="text-gray-400 block">Stop</span>{position.stop_price != null ? `¥${position.stop_price.toLocaleString()}` : '—'}</div>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              placeholder="例: 2800"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>

          {/* Sell Shares (100株単位、部分売却対応) */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              売却株数 <span className="text-red-500">*</span>
              <span className="ml-1 text-[10px] text-gray-400">（{SHARE_LOT}株単位）</span>
            </label>
            <input
              type="number"
              inputMode="numeric"
              value={sellShares}
              onChange={e => setSellShares(e.target.value)}
              min={SHARE_LOT}
              max={position.shares}
              step={SHARE_LOT}
              placeholder={String(position.shares)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-[10px] text-gray-400">
              保有: {position.shares.toLocaleString()} sh
              {isPartial && effectiveSellShares > 0 && (
                <span className="ml-2 text-orange-600 font-semibold">
                  部分売却 → 残 {(position.shares - effectiveSellShares).toLocaleString()} sh
                </span>
              )}
            </p>
          </div>

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

        {/* Calculated P&L preview */}
        {realizedPnl != null && (
          <div className="bg-gray-50 rounded-lg px-4 py-3 grid grid-cols-2 gap-4">
            <div>
              <span className="text-xs text-gray-400 block mb-0.5">Realized PnL</span>
              <span
                className={`text-lg font-bold font-mono ${realizedPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}
              >
                {realizedPnl >= 0 ? '+' : ''}¥{realizedPnl.toLocaleString('ja-JP', { maximumFractionDigits: 0 })}
              </span>
            </div>
            {rMultiple != null && (
              <div>
                <span className="text-xs text-gray-400 block mb-0.5">R Multiple</span>
                <span
                  className={`text-lg font-bold font-mono ${rMultiple >= 0 ? 'text-green-600' : 'text-red-600'}`}
                >
                  {rMultiple >= 0 ? '+' : ''}{rMultiple.toFixed(2)}R
                </span>
              </div>
            )}
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
            onClick={handleClose}
            disabled={saving}
            className="px-5 py-2 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 transition-colors min-h-[44px] disabled:opacity-50"
          >
            {saving
              ? 'Processing...'
              : isPartial
                ? `Confirm Partial Close (${effectiveSellShares.toLocaleString()} sh)`
                : 'Confirm Close'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
