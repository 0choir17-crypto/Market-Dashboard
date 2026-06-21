'use client'

import { useState, useEffect, useMemo } from 'react'
import { insertResilient, updateResilient } from '@/lib/resilientWrite'
import { Trade } from '@/types/trades'
import { SCREEN_NAME_MAP } from '@/lib/screenNames'
import { classifyResult } from '@/lib/tradeResult'
import { EXIT_REASONS } from '@/components/journal/CloseTradeModal'
import Modal from '@/components/shared/Modal'

type Props = {
  open: boolean
  onClose: () => void
  onSaved: () => void
  initial?: Partial<Trade>
}

const today = () => new Date().toISOString().slice(0, 10)

const SCREEN_OPTIONS = Object.entries(SCREEN_NAME_MAP).map(([raw, display]) => ({
  value: raw,
  label: display,
}))

export default function PositionModal({ open, onClose, onSaved, initial }: Props) {
  const isEdit = !!initial?.id

  const [ticker, setTicker] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [sector, setSector] = useState('')
  const [screenName, setScreenName] = useState('')
  const [entryDate, setEntryDate] = useState(today())
  const [entryPrice, setEntryPrice] = useState('')
  const [shares, setShares] = useState('')
  const [costBasis, setCostBasis] = useState('')
  const [stopPrice, setStopPrice] = useState('')
  const [stop21l, setStop21l] = useState('')
  const [targetR, setTargetR] = useState('')
  const [memo, setMemo] = useState('')
  // 任意のイグジット（売り）— 入力すると closed として保存し PnL を自動計算
  const [exitDate, setExitDate] = useState('')
  const [exitPrice, setExitPrice] = useState('')
  const [exitReason, setExitReason] = useState('利確')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Derived: init_risk_pct
  const ep = parseFloat(entryPrice)
  const sp = parseFloat(stopPrice)
  const initRiskPct = !isNaN(ep) && !isNaN(sp) && ep > 0
    ? ((ep - sp) / ep * 100)
    : null

  // イグジット価格を入れた時のリアルタイム損益プレビュー
  const exitPreview = useMemo(() => {
    if (exitPrice === '' || entryPrice === '' || shares === '') return null
    const xp = Number(exitPrice)
    const enp = Number(entryPrice)
    const sh = Number(shares)
    if (isNaN(xp) || isNaN(enp) || isNaN(sh) || enp <= 0) return null
    const pnl = (xp - enp) * sh
    const pnlPct = ((xp - enp) / enp) * 100
    return { pnl, pnlPct, result: classifyResult(pnl) }
  }, [exitPrice, entryPrice, shares])

  useEffect(() => {
    if (open) {
      setTicker(initial?.ticker ?? '')
      setCompanyName(initial?.company_name ?? '')
      setSector(initial?.sector_s33 ?? '')
      setScreenName(initial?.screen_name ?? '')
      setEntryDate(initial?.entry_date ?? today())
      setEntryPrice(initial?.entry_price != null ? String(initial.entry_price) : '')
      setShares(initial?.shares != null ? String(initial.shares) : '')
      setCostBasis(initial?.cost_basis != null ? String(initial.cost_basis) : '')
      setStopPrice(initial?.stop_price != null ? String(initial.stop_price) : '')
      setStop21l(initial?.stop_21l != null ? String(initial.stop_21l) : '')
      setTargetR(initial?.target_r != null ? String(initial.target_r) : '')
      setMemo(initial?.memo ?? '')
      setExitDate(initial?.exit_date ?? '')
      setExitPrice(initial?.exit_price != null ? String(initial.exit_price) : '')
      setExitReason(initial?.exit_reason ?? '利確')
      setError('')
    }
  }, [open, initial])

  async function handleSave() {
    if (!ticker.trim()) { setError('Ticker は必須です'); return }
    if (!entryDate) { setError('取得日は必須です'); return }
    if (entryPrice === '') { setError('Entry価格は必須です'); return }
    if (shares === '') { setError('株数は必須です'); return }
    if (exitPrice !== '' && isNaN(Number(exitPrice))) { setError('Exit価格が不正です'); return }

    setSaving(true)
    setError('')

    const ep2 = parseFloat(entryPrice)
    const sh2 = shares !== '' ? parseInt(shares) : 1
    const sp2 = stopPrice !== '' ? parseFloat(stopPrice) : null
    const riskPct = sp2 != null && !isNaN(ep2) && ep2 > 0
      ? (ep2 - sp2) / ep2 * 100
      : null

    // イグジット入力時は closed として確定（PnL/結果/R を自動計算）
    const hasExit = exitPrice !== '' && !isNaN(Number(exitPrice))
    let exitFields: Record<string, unknown> = {}
    if (hasExit) {
      const xp = parseFloat(exitPrice)
      const pnl = (xp - ep2) * sh2
      const pnlPct = ((xp - ep2) / ep2) * 100
      const rMult = sp2 != null && ep2 !== sp2 ? (xp - ep2) / (ep2 - sp2) : null
      exitFields = {
        exit_date: exitDate || today(),
        exit_price: xp,
        pnl,
        pnl_pct: pnlPct,
        result: classifyResult(pnl),
        r_multiple: rMult,
        exit_reason: exitReason,
      }
    }

    const record = {
      ticker: ticker.trim().toUpperCase(),
      company_name: companyName.trim() || null,
      sector_s33: sector.trim() || null,
      screen_name: screenName || null,
      entry_date: entryDate || today(),
      entry_price: ep2,
      shares: sh2,
      cost_basis: costBasis !== '' ? parseFloat(costBasis) : null,
      stop_price: sp2,
      stop_21l: stop21l !== '' ? parseFloat(stop21l) : null,
      init_risk_pct: riskPct,
      target_r: targetR !== '' ? parseFloat(targetR) : null,
      memo: memo.trim() || null,
      status: hasExit ? 'closed' : 'open',
      updated_at: new Date().toISOString(),
      ...exitFields,
      // シグナルスナップショット（新規作成時のみ、Watchlist昇格等で渡された場合）
      ...(isEdit ? {} : {
        signal_price: initial?.signal_price ?? null,
        rs_at_entry: initial?.rs_at_entry ?? null,
        rvol_at_entry: initial?.rvol_at_entry ?? null,
        adr_at_entry: initial?.adr_at_entry ?? null,
        dist_ema21_at_entry: initial?.dist_ema21_at_entry ?? null,
        stop_pct_at_entry: initial?.stop_pct_at_entry ?? null,
        mc_met_at_entry: initial?.mc_met_at_entry ?? null,
        mc_condition_at_entry: initial?.mc_condition_at_entry ?? null,
      }),
    }

    const { error: err } = isEdit
      ? await updateResilient('trades', record, { id: initial!.id! })
      : await insertResilient('trades', record)

    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
    onClose()
  }

  const title = isEdit ? 'Edit Trade' : 'New Trade'

  return (
    <Modal open={open} onClose={onClose} title={title}>
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

          {/* Sector */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Sector</label>
            <input
              type="text"
              value={sector}
              onChange={e => setSector(e.target.value)}
              placeholder="例: 自動車・輸送機"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Screen */}
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
              placeholder="例: 2500"
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

          {/* Cost Basis */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Cost Basis (incl. fees, optional)</label>
            <input
              type="number"
              inputMode="numeric"
              value={costBasis}
              onChange={e => setCostBasis(e.target.value)}
              placeholder="例: 250500"
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

          {/* Stop 21L */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Stop(21L) (optional)</label>
            <input
              type="number"
              inputMode="numeric"
              value={stop21l}
              onChange={e => setStop21l(e.target.value)}
              placeholder="過去21日安値"
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

          {/* Init Risk% (calculated, read-only) */}
          {initRiskPct != null && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Init Risk% (auto)</label>
              <div className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2.5 text-base font-mono text-gray-700">
                {initRiskPct.toFixed(2)}%
              </div>
            </div>
          )}
        </div>

        {/* Memo */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Buy thesis</label>
          <textarea
            value={memo}
            onChange={e => setMemo(e.target.value)}
            rows={3}
            placeholder="エントリー理由・注意点など"
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        {/* Exit（任意）: 入力すると closed として確定。空ければ open のまま */}
        <div className="border border-dashed border-gray-300 rounded-lg p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500">
            イグジット（売り・任意）
            <span className="ml-1 font-normal text-gray-400">— 入力すると「確定（closed）」として保存し損益を自動計算</span>
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Exit Date */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Exit Date</label>
              <input
                type="date"
                value={exitDate}
                onChange={e => setExitDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {/* Exit Price */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Exit Price</label>
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

          {exitPreview && (() => {
            const bg = exitPreview.result === 'WIN' ? 'bg-emerald-50'
              : exitPreview.result === 'LOSS' ? 'bg-red-50' : 'bg-gray-100'
            const fgStrong = exitPreview.result === 'WIN' ? 'text-emerald-700'
              : exitPreview.result === 'LOSS' ? 'text-red-700' : 'text-gray-700'
            return (
              <div className={`rounded-lg px-4 py-2 text-center ${bg}`}>
                <span className={`text-base font-bold ${fgStrong}`}>
                  {exitPreview.pnl >= 0 ? '+' : ''}&yen;{exitPreview.pnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  {' '}({exitPreview.pnlPct >= 0 ? '+' : ''}{exitPreview.pnlPct.toFixed(2)}%)
                </span>
                <span className={`ml-2 text-xs font-semibold ${fgStrong}`}>{exitPreview.result}</span>
              </div>
            )
          })()}
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
