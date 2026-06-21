'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { insertResilient, updateResilient } from '@/lib/resilientWrite'
import { Trade } from '@/types/trades'
import Modal from '@/components/shared/Modal'

type Props = {
  open: boolean
  onClose: () => void
  onSaved: () => void
  initial?: Partial<Trade>
}

const today = () => new Date().toISOString().slice(0, 10)

export default function PositionModal({ open, onClose, onSaved, initial }: Props) {
  const isEdit = !!initial?.id

  const [ticker, setTicker] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [sector, setSector] = useState('')
  const [entryDate, setEntryDate] = useState(today())
  const [entryPrice, setEntryPrice] = useState('')
  const [shares, setShares] = useState('')
  const [costBasis, setCostBasis] = useState('')
  const [stopPrice, setStopPrice] = useState('')
  const [stop21l, setStop21l] = useState('')
  const [targetR, setTargetR] = useState('')
  const [memo, setMemo] = useState('')
  const [mcScore, setMcScore] = useState<number | null>(null)
  const [mcRegime, setMcRegime] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // entry_date 変更時に MC v4 Score を自動取得
  const fetchMcScore = useCallback(async (date: string) => {
    const { data } = await supabase
      .from('market_conditions')
      .select('mc_v4, mc_regime_v4, scorecard_regime')
      .lte('date', date)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data) {
      const d = data as Record<string, unknown>
      const v4 = d.mc_v4 as number | null | undefined
      const regimeMap: Record<string, string> = {
        strong_bull: 'Strong Bull', bull: 'Bull', neutral: 'Neutral',
        bear: 'Bear', strong_bear: 'Strong Bear',
      }
      const v4Regime = d.mc_regime_v4 as string | null | undefined
      const baseRegime = d.scorecard_regime as string | null | undefined
      const r = v4Regime ?? baseRegime ?? null
      const regimeLabel = r ? (regimeMap[r] ?? r) : null
      if (v4 != null) {
        setMcScore(v4)
        setMcRegime(regimeLabel)
      } else {
        setMcScore(null)
        setMcRegime(regimeLabel)
      }
    }
  }, [])

  // Derived: init_risk_pct
  const ep = parseFloat(entryPrice)
  const sp = parseFloat(stopPrice)
  const initRiskPct = !isNaN(ep) && !isNaN(sp) && ep > 0
    ? ((ep - sp) / ep * 100)
    : null

  useEffect(() => {
    if (open) {
      setTicker(initial?.ticker ?? '')
      setCompanyName(initial?.company_name ?? '')
      setSector(initial?.sector_s33 ?? '')
      setEntryDate(initial?.entry_date ?? today())
      setEntryPrice(initial?.entry_price != null ? String(initial.entry_price) : '')
      setShares(initial?.shares != null ? String(initial.shares) : '')
      setCostBasis(initial?.cost_basis != null ? String(initial.cost_basis) : '')
      setStopPrice(initial?.stop_price != null ? String(initial.stop_price) : '')
      setStop21l(initial?.stop_21l != null ? String(initial.stop_21l) : '')
      setTargetR(initial?.target_r != null ? String(initial.target_r) : '')
      setMemo(initial?.memo ?? '')
      // legacy v3 (0-21) は読み込み時点で 0-100 へ正規化。保存時は常に v4 として書き戻す。
      const rawScore = initial?.mc_score ?? null
      const wasV4 = (initial?.mc_score_version as 'v3' | 'v4' | undefined) === 'v4'
      setMcScore(rawScore == null ? null : wasV4 ? rawScore : (rawScore / 21) * 100)
      setMcRegime(initial?.mc_regime ?? null)
      setError('')
      // 新規作成時: entry_date の MC Score を自動取得
      if (!initial?.id) {
        const date = initial?.entry_date ?? today()
        fetchMcScore(date)
      }
    }
  }, [open, initial, fetchMcScore])

  async function handleSave() {
    if (!ticker.trim()) { setError('Ticker は必須です'); return }
    if (!entryDate) { setError('取得日は必須です'); return }
    if (entryPrice === '') { setError('Entry価格は必須です'); return }
    if (shares === '') { setError('株数は必須です'); return }

    setSaving(true)
    setError('')

    const ep2 = parseFloat(entryPrice)
    const sp2 = stopPrice !== '' ? parseFloat(stopPrice) : null
    const riskPct = sp2 != null && !isNaN(ep2) && ep2 > 0
      ? (ep2 - sp2) / ep2 * 100
      : null

    const record = {
      ticker: ticker.trim().toUpperCase(),
      company_name: companyName.trim() || null,
      sector_s33: sector.trim() || null,
      entry_date: entryDate || today(),
      entry_price: ep2,
      shares: shares !== '' ? parseInt(shares) : 1,
      cost_basis: costBasis !== '' ? parseFloat(costBasis) : null,
      stop_price: sp2,
      stop_21l: stop21l !== '' ? parseFloat(stop21l) : null,
      init_risk_pct: riskPct,
      target_r: targetR !== '' ? parseFloat(targetR) : null,
      memo: memo.trim() || null,
      mc_score: mcScore,
      mc_regime: mcRegime,
      mc_score_version: 'v4',
      status: 'open',
      updated_at: new Date().toISOString(),
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

  const title = isEdit ? 'Edit Position' : 'Add Position'

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

          {/* Entry Date */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Entry Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={entryDate}
              onChange={e => { setEntryDate(e.target.value); if (e.target.value) fetchMcScore(e.target.value) }}
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
