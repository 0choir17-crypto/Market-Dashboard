'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { insertResilient } from '@/lib/resilientWrite'
import { Trade } from '@/types/trades'
import { classifyResult, nextLossStreak } from '@/lib/tradeResult'
import { calculateMfeMae, type MfeMaeResult } from '@/lib/mfeMae'
import { todayJST } from '@/lib/dates'
import { formatYen, formatR, pnlColorClass } from '@/lib/format'
import Modal from '@/components/shared/Modal'
import { btnSecondary, fieldClass, labelClass, requiredClass } from '@/components/shared/form'

type Props = {
  open: boolean
  onClose: () => void
  onSaved: () => void
  position: Trade | null
}

const today = () => todayJST()

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
  // R の分母は必ず初期リスク（initial_stop）。stop_price はトレールで動くため
  // 使わない（建値超えにトレールすると勝ちトレードの R が負になる）。
  // initial_stop 未設定の旧データのみ stop_price にフォールバック。
  const riskBase = position.initial_stop ?? position.stop_price
  const rMultiple =
    !isNaN(ep) && riskBase != null && position.entry_price !== riskBase
      ? (ep - position.entry_price) / (position.entry_price - riskBase)
      : null

  async function handleClose() {
    if (exitPrice === '' || isNaN(Number(exitPrice)) || Number(exitPrice) <= 0) { setError('売値は正の数で入力してください'); return }
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
    // WIN/LOSS/BREAKEVEN は classifyResult が単一の正。pnl=0 は BREAKEVEN であり
    // WIN ではない（Journal 側の CloseTradeModal と同一分類にする）。
    const result = classifyResult(pnl)
    const closeRiskBase = position.initial_stop ?? position.stop_price
    const rMult =
      closeRiskBase != null && position.entry_price !== closeRiskBase
        ? (ep2 - position.entry_price) / (position.entry_price - closeRiskBase)
        : null
    const pnlPct = position.entry_price > 0
      ? ((ep2 - position.entry_price) / position.entry_price) * 100
      : null

    // MFE/MAE（取得失敗してもクローズは成功扱い）
    let mfeMaeFields: Partial<MfeMaeResult> = {}
    try {
      const mfeMae = await calculateMfeMae(position.ticker, position.entry_date, exitDate, position.entry_price, ep2)
      if (mfeMae) mfeMaeFields = mfeMae
    } catch (e) {
      console.warn('MFE/MAE計算スキップ:', e)
    }

    if (isPartialClose) {
      // Partial close: reduce the shares on the original position first, then
      // insert a closed record for the sold portion. PostgREST では2リクエストを
      // トランザクションにできないため、順序と補償処理で被害を最小化する:
      //   - 先に insert する旧実装は、途中失敗→再実行で決済レコードが二重になり
      //     PnL が二重計上された（挿入は成功済みなので）
      //   - update 先行なら、insert 失敗時に株数を戻す補償を試み、それも失敗した
      //     場合は「何が起きたか」を明示してユーザーに委ねる
      const closedCostBasis = position.cost_basis != null
        ? position.cost_basis * (closeShares / position.shares)
        : null
      const remainingCostBasis = position.cost_basis != null
        ? position.cost_basis * (remainingShares / position.shares)
        : position.cost_basis

      const { error: updateErr } = await supabase
        .from('trades')
        .update({
          shares: remainingShares,
          cost_basis: remainingCostBasis,
          updated_at: new Date().toISOString(),
        })
        .eq('id', position.id)
      if (updateErr) { setSaving(false); setError(updateErr.message); return }

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
        result,
        memo: position.memo,
        status: 'closed',
        sector_s33: position.sector_s33,
        stop_price: position.stop_price,
        initial_stop: position.initial_stop ?? position.stop_price,
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
        ...mfeMaeFields,
        updated_at: new Date().toISOString(),
      }

      const { error: insertErr } = await insertResilient('trades', closedRecord)
      if (insertErr) {
        // 補償: 減らした株数を元に戻す（決済レコードは作られていない）
        const { error: rollbackErr } = await supabase
          .from('trades')
          .update({
            shares: position.shares,
            cost_basis: position.cost_basis,
            updated_at: new Date().toISOString(),
          })
          .eq('id', position.id)
        setSaving(false)
        setError(rollbackErr
          ? `決済レコードの作成に失敗し、株数の復元にも失敗しました。ポジションの株数が ${remainingShares} になっている可能性があります。手動で確認してください: ${insertErr.message}`
          : `決済レコードの作成に失敗しました（ポジションは変更されていません）: ${insertErr.message}`)
        return
      }
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
          result,
          status: 'closed',
          ...mfeMaeFields,
          updated_at: new Date().toISOString(),
        })
        .eq('id', position.id)
      if (updateErr) { setSaving(false); setError(updateErr.message); return }
    }

    // 3. Update consec_losses in risk_settings — 全株決済時のみ。
    // 分割決済のたびに数えると1銘柄の負けが複数連敗としてカウントされる。
    // 判定は pnl 由来の result（旧実装の「R<0」はストップ未設定の負けで
    // ストリークをリセットしてしまっていた）。
    if (!isPartialClose) {
      const { data: riskData } = await supabase
        .from('risk_settings')
        .select('id, consec_losses')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const prevLosses = riskData?.consec_losses ?? 0
      const newLosses = nextLossStreak(prevLosses, result)

      if (riskData?.id) {
        await supabase
          .from('risk_settings')
          .update({ consec_losses: newLosses, updated_at: new Date().toISOString() })
          .eq('id', riskData.id)
      } else {
        await supabase.from('risk_settings').insert({ consec_losses: newLosses })
      }
    }

    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={`Close: ${position.ticker}`}>
      <div className="px-6 py-5 space-y-4">
        {/* Position summary */}
        <div className="bg-[var(--bg-card-hover)] rounded-lg px-4 py-3 text-xs text-[var(--text-secondary)] grid grid-cols-3 gap-2">
          <div><span className="text-[var(--text-muted)] block">Entry Price</span><span className="font-mono">¥{position.entry_price.toLocaleString()}</span></div>
          <div><span className="text-[var(--text-muted)] block">Shares</span><span className="font-mono">{position.shares.toLocaleString()} sh</span></div>
          <div><span className="text-[var(--text-muted)] block">Stop</span><span className="font-mono">{position.stop_price != null ? `¥${position.stop_price.toLocaleString()}` : '—'}</span></div>
        </div>

        {error && (
          <p className="text-sm text-[var(--negative)] bg-[var(--sem-weak-bg)] px-3 py-2 rounded-lg">{error}</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Exit Price */}
          <div>
            <label className={labelClass}>
              Exit Price <span className={requiredClass}>*</span>
            </label>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={exitPrice}
              onChange={e => setExitPrice(e.target.value)}
              placeholder="例: 2800"
              className={fieldClass}
              autoFocus
            />
          </div>

          {/* Sell Shares (100株単位、部分売却対応) */}
          <div>
            <label className={labelClass}>
              売却株数 <span className={requiredClass}>*</span>
              <span className="ml-1 text-[10px] text-[var(--text-muted)]">（{SHARE_LOT}株単位）</span>
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
              className={fieldClass}
            />
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">
              保有: {position.shares.toLocaleString()} sh
              {isPartial && effectiveSellShares > 0 && (
                <span className="ml-2 text-[var(--sem-watch-fg)] font-semibold">
                  部分売却 → 残 {(position.shares - effectiveSellShares).toLocaleString()} sh
                </span>
              )}
            </p>
          </div>

          {/* Exit Date */}
          <div>
            <label className={labelClass}>
              Exit Date <span className={requiredClass}>*</span>
            </label>
            <input
              type="date"
              value={exitDate}
              onChange={e => setExitDate(e.target.value)}
              className={fieldClass}
            />
          </div>

          {/* Exit Reason */}
          <div>
            <label className={labelClass}>Exit Reason</label>
            <select
              value={exitReason}
              onChange={e => setExitReason(e.target.value)}
              className={fieldClass}
            >
              {EXIT_REASONS.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Calculated P&L preview */}
        {realizedPnl != null && (
          <div className="bg-[var(--bg-card-hover)] rounded-lg px-4 py-3 grid grid-cols-2 gap-4">
            <div>
              <span className="text-xs text-[var(--text-muted)] block mb-0.5">Realized PnL</span>
              <span
                className={`text-lg font-bold font-mono ${pnlColorClass(realizedPnl)}`}
              >
                {formatYen(realizedPnl, { sign: true })}
              </span>
            </div>
            {rMultiple != null && (
              <div>
                <span className="text-xs text-[var(--text-muted)] block mb-0.5">R Multiple</span>
                <span
                  className={`text-lg font-bold font-mono ${pnlColorClass(rMultiple)}`}
                >
                  {formatR(rMultiple)}
                </span>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className={btnSecondary}
          >
            キャンセル
          </button>
          <button
            onClick={handleClose}
            disabled={saving}
            className="px-5 py-2 text-small font-medium text-white bg-[var(--sem-watch-fg)] rounded-lg hover:brightness-110 min-h-[44px] disabled:opacity-50"
          >
            {saving
              ? '処理中…'
              : isPartial
                ? `部分決済を確定（${effectiveSellShares.toLocaleString()} 株）`
                : '決済を確定'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
