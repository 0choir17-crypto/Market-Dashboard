'use client'

import { useState, useEffect, useMemo } from 'react'
import { insertResilient, updateResilient } from '@/lib/resilientWrite'
import { Trade } from '@/types/trades'
import { classifyResult } from '@/lib/tradeResult'
import { EXIT_REASONS } from '@/components/journal/CloseTradeModal'
import { fetchSectorNames33 } from '@/lib/sectorNames'
import Modal from '@/components/shared/Modal'

type Props = {
  open: boolean
  onClose: () => void
  onSaved: () => void
  initial?: Partial<Trade>
}

const today = () => new Date().toISOString().slice(0, 10)

// Screen 選択肢（表示名をそのまま screen_name に保存）。末尾に Other。
const SCREEN_OPTIONS = ['Coil Pullback', 'MA Pullback']

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
  const [targetPrice, setTargetPrice] = useState('')
  const [memo, setMemo] = useState('')
  // 任意のイグジット（売り）— 入力すると closed として保存し PnL を自動計算
  const [exitDate, setExitDate] = useState('')
  const [exitPrice, setExitPrice] = useState('')
  const [exitShares, setExitShares] = useState('')
  const [exitReason, setExitReason] = useState('利確')
  const [sectorOptions, setSectorOptions] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')

  const enp = parseFloat(entryPrice)

  // Entry 比の乖離率（ストップ・目標株価の自動計算表示）
  const stopPctFromEntry =
    !isNaN(enp) && enp > 0 && stopPrice !== '' && !isNaN(parseFloat(stopPrice))
      ? (parseFloat(stopPrice) - enp) / enp * 100
      : null
  const targetPctFromEntry =
    !isNaN(enp) && enp > 0 && targetPrice !== '' && !isNaN(parseFloat(targetPrice))
      ? (parseFloat(targetPrice) - enp) / enp * 100
      : null

  // イグジット価格を入れた時のリアルタイム損益プレビュー
  const exitPreview = useMemo(() => {
    if (exitPrice === '' || entryPrice === '') return null
    const xp = Number(exitPrice)
    const ep0 = Number(entryPrice)
    const sh = exitShares !== '' ? Number(exitShares) : Number(shares)
    if (isNaN(xp) || isNaN(ep0) || isNaN(sh) || ep0 <= 0) return null
    const pnl = (xp - ep0) * sh
    const pnlPct = ((xp - ep0) / ep0) * 100
    return { pnl, pnlPct, result: classifyResult(pnl) }
  }, [exitPrice, entryPrice, exitShares, shares])

  // 33業種プルダウン（最新営業日の sector_name_s33）
  useEffect(() => {
    if (!open || sectorOptions.length > 0) return
    let cancelled = false
    fetchSectorNames33().then(list => { if (!cancelled) setSectorOptions(list) })
    return () => { cancelled = true }
  }, [open, sectorOptions.length])

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
      setTargetPrice(initial?.target_price != null ? String(initial.target_price) : '')
      setMemo(initial?.memo ?? '')
      setExitDate(initial?.exit_date ?? '')
      setExitPrice(initial?.exit_price != null ? String(initial.exit_price) : '')
      setExitShares('')
      setExitReason(initial?.exit_reason ?? '利確')
      setError('')
      setWarning('')
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
    setWarning('')

    const ep2 = parseFloat(entryPrice)
    const sh2 = shares !== '' ? parseInt(shares) : 1
    const sp2 = stopPrice !== '' ? parseFloat(stopPrice) : null
    const tp2 = targetPrice !== '' ? parseFloat(targetPrice) : null
    const riskPct = sp2 != null && !isNaN(ep2) && ep2 > 0
      ? (ep2 - sp2) / ep2 * 100
      : null

    // イグジット入力時は closed として確定（PnL/結果/R を自動計算）
    const hasExit = exitPrice !== '' && !isNaN(Number(exitPrice))
    let exitFields: Record<string, unknown> = {}
    if (hasExit) {
      const xp = parseFloat(exitPrice)
      const exSh = exitShares !== '' ? parseInt(exitShares) : sh2
      const pnl = (xp - ep2) * exSh
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
      init_risk_pct: riskPct,
      target_price: tp2,
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

    const { error: err, stripped } = isEdit
      ? await updateResilient('trades', record, { id: initial!.id! })
      : await insertResilient('trades', record)

    setSaving(false)
    if (err) { setError(err.message); return }

    // 入力したのに DB に列が無く保存できなかった項目を可視化（例: target_price）。
    onSaved()
    if (stripped.length > 0) {
      setWarning(
        `保存しましたが、DB に列が無いため未保存の項目があります: ${stripped.join(', ')}。` +
        `supabase/trades_columns.sql を Supabase で実行すると保存されるようになります。`,
      )
      return // 警告を読めるようモーダルは閉じない
    }
    onClose()
  }

  const title = isEdit ? 'Edit Trade' : 'New Trade'

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="px-6 py-5 space-y-4">
        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
        )}
        {warning && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg">{warning}</p>
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

          {/* Sector (33業種プルダウン) */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Sector (33業種)</label>
            <select
              value={sector}
              onChange={e => setSector(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">-- Select --</option>
              {/* 既存値が一覧に無い場合も選択を保持 */}
              {sector && !sectorOptions.includes(sector) && (
                <option value={sector}>{sector}</option>
              )}
              {sectorOptions.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
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
              {/* 既存値が選択肢に無い場合も保持 */}
              {screenName && !SCREEN_OPTIONS.includes(screenName) && screenName !== 'Other' && (
                <option value={screenName}>{screenName}</option>
              )}
              {SCREEN_OPTIONS.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
              <option value="Other">Other</option>
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

          {/* Stop Price（Entry比%を自動表示） */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Stop Price
              {stopPctFromEntry != null && (
                <span className="ml-1 font-normal text-orange-600">
                  （Entry比 {stopPctFromEntry >= 0 ? '+' : ''}{stopPctFromEntry.toFixed(2)}%）
                </span>
              )}
            </label>
            <input
              type="number"
              inputMode="numeric"
              value={stopPrice}
              onChange={e => setStopPrice(e.target.value)}
              placeholder="例: 2350"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Target Price（Entry比%を自動表示） */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Target Price (目標株価)
              {targetPctFromEntry != null && (
                <span className="ml-1 font-normal text-emerald-600">
                  （Entry比 {targetPctFromEntry >= 0 ? '+' : ''}{targetPctFromEntry.toFixed(2)}%）
                </span>
              )}
            </label>
            <input
              type="number"
              inputMode="numeric"
              value={targetPrice}
              onChange={e => setTargetPrice(e.target.value)}
              placeholder="例: 2900"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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
            {/* Exit Shares */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Shares</label>
              <input
                type="number"
                inputMode="numeric"
                value={exitShares}
                onChange={e => setExitShares(e.target.value)}
                placeholder={shares !== '' ? `${shares}（全株）` : '例: 100'}
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
