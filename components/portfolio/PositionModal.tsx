'use client'

import { useState, useEffect, useMemo } from 'react'
import { insertResilient, updateResilient } from '@/lib/resilientWrite'
import { supabase } from '@/lib/supabase'
import { suggestShares, computeRAtr } from '@/lib/rStats'
import { ENTRY_TYPES } from '@/lib/entryTypes'
import { Trade } from '@/types/trades'
import { classifyResult } from '@/lib/tradeResult'
import { EXIT_REASONS } from '@/components/journal/CloseTradeModal'
import { fetchSectorNames33 } from '@/lib/sectorNames'
import { todayJST } from '@/lib/dates'
import { formatYen, formatPct } from '@/lib/format'
import Modal from '@/components/shared/Modal'
import { btnPrimary, btnSecondary, fieldClass, labelClass, requiredClass } from '@/components/shared/form'

type Props = {
  open: boolean
  onClose: () => void
  onSaved: () => void
  initial?: Partial<Trade>
  /** 減速ルール発動中（連敗・月次 DD）。株数計算のリスク % を半分にする */
  slowdown?: boolean
  /** 口座資金・リスク % を既定値として保存した後 */
  onSettingsSaved?: () => void
}

// リスク % の既定値（risk_settings 未設定時）
const DEFAULT_RISK_PCT = '0.5'

const today = () => todayJST()

// Screen 選択肢（表示名をそのまま screen_name に保存）。末尾に Other。
// 2026-08-29 のスキャナー刷新で Coil / MA Pullback は廃止。過去トレードに残る旧名は
// 下の「initial の値が選択肢に無ければ 1 件だけ足す」分岐で選択状態を保てる。
const SCREEN_OPTIONS = ['EMA Setup', 'Structure Pivot']

export default function PositionModal({ open, onClose, onSaved, initial, slowdown = false, onSettingsSaved }: Props) {
  const isEdit = !!initial?.id

  const [ticker, setTicker] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [sector, setSector] = useState('')
  const [screenName, setScreenName] = useState('')
  const [entryType, setEntryType] = useState('')
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
  // 株数計算（1R = 口座資金 × リスク %）。既定値は risk_settings から読む
  const [capital, setCapital] = useState('')
  const [riskPct, setRiskPctInput] = useState(DEFAULT_RISK_PCT)
  const [riskSettingsId, setRiskSettingsId] = useState<string | null>(null)
  const [sizingMsg, setSizingMsg] = useState('')

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

  // 株数の提案。減速ルール中はリスク % を半分にして計算する
  const effRiskPct = (parseFloat(riskPct) || 0) * (slowdown ? 0.5 : 1)
  const sizing = useMemo(() => suggestShares({
    capital: parseFloat(capital),
    riskPct: effRiskPct,
    entry: parseFloat(entryPrice),
    stop: parseFloat(stopPrice),
  }), [capital, effRiskPct, entryPrice, stopPrice])

  // 損切り幅が ADR（平均日中値幅）より広い → 建玉が小さくなる。押し目で支持線の近くまで待つ合図
  const adr = initial?.adr_at_entry ?? null
  const stopWiderThanAdr = adr != null && stopPctFromEntry != null && Math.abs(stopPctFromEntry) > adr

  // 入力中の株数で実際に取っているリスク
  const currentRisk = (() => {
    const sh = parseInt(shares)
    const ep0 = parseFloat(entryPrice)
    const sp0 = parseFloat(stopPrice)
    const cap = parseFloat(capital)
    if (!(sh > 0) || !(ep0 > sp0) || !(sp0 > 0)) return null
    const yen = sh * (ep0 - sp0)
    return { yen, pct: cap > 0 ? yen / cap * 100 : null, posPct: cap > 0 ? sh * ep0 / cap * 100 : null }
  })()

  useEffect(() => {
    if (!open) return
    let cancelled = false
    supabase
      .from('risk_settings')
      .select('id, account_capital, risk_pct')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return
        setRiskSettingsId((data.id as string) ?? null)
        if (data.account_capital != null) setCapital(String(data.account_capital))
        if (data.risk_pct != null) setRiskPctInput(String(data.risk_pct))
      })
    return () => { cancelled = true }
  }, [open])

  async function saveSizingDefaults() {
    const cap = parseFloat(capital)
    const rp = parseFloat(riskPct)
    if (!(cap > 0) || !(rp > 0)) { setSizingMsg('口座資金とリスク % を正の数で入力してください'); return }
    const row = { account_capital: cap, risk_pct: rp, updated_at: new Date().toISOString() }
    const { error: err } = riskSettingsId
      ? await supabase.from('risk_settings').update(row).eq('id', riskSettingsId)
      : await supabase.from('risk_settings').insert(row)
    setSizingMsg(err ? `保存失敗: ${err.message}` : '既定値として保存しました')
    if (!err) onSettingsSaved?.()
  }

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
      setEntryType(initial?.entry_type ?? '')
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
      setSizingMsg('')
    }
  }, [open, initial])

  async function handleSave() {
    if (!ticker.trim()) { setError('Ticker は必須です'); return }
    if (!entryDate) { setError('取得日は必須です'); return }
    if (entryPrice === '' || isNaN(Number(entryPrice)) || Number(entryPrice) <= 0) { setError('Entry価格は正の数で入力してください'); return }
    if (shares === '' || !Number.isInteger(Number(shares)) || Number(shares) <= 0) { setError('株数は正の整数で入力してください'); return }
    if (exitPrice !== '' && (isNaN(Number(exitPrice)) || Number(exitPrice) <= 0)) { setError('Exit価格は正の数で入力してください'); return }

    const ep2 = parseFloat(entryPrice)
    const sh2 = shares !== '' ? parseInt(shares) : 1
    const sp2 = stopPrice !== '' ? parseFloat(stopPrice) : null
    const tp2 = targetPrice !== '' ? parseFloat(targetPrice) : null

    // 初期ストップは不変。編集で stop_price をトレールしても initial_stop /
    // init_risk_pct は上書きしない（R と初期リスクの基準が失われるため）。
    // 新規作成時、および initial_stop 未設定の旧データを編集した時のみ設定する。
    const initialStop = isEdit ? (initial?.initial_stop ?? sp2) : sp2
    const setInitialRisk = !isEdit || initial?.initial_stop == null
    const riskPct = setInitialRisk && initialStop != null && !isNaN(ep2) && ep2 > 0
      ? (ep2 - initialStop) / ep2 * 100
      : null

    // イグジット入力時は closed として確定（PnL/結果/R を自動計算）
    const hasExit = exitPrice !== '' && !isNaN(Number(exitPrice))
    let exitFields: Record<string, unknown> = {}
    if (hasExit) {
      const exSh = exitShares !== '' ? parseInt(exitShares) : sh2
      if (!Number.isFinite(exSh) || exSh <= 0) { setError('Exit株数が不正です'); return }
      // このフォームは全株決済のみ対応。部分決済をここで保存すると
      // レコード全体が closed になり残株が消えるため、専用の Close モーダル
      // （分割レコードを正しく作る）へ誘導する。
      if (exSh !== sh2) {
        setError(`Exit株数（${exSh}）が保有株数（${sh2}）と一致しません。部分決済はポジション一覧の Close ボタンから行ってください。`)
        return
      }
      const xp = parseFloat(exitPrice)
      const pnl = (xp - ep2) * exSh
      const pnlPct = ((xp - ep2) / ep2) * 100
      // R の分母は初期ストップ（トレール後の stop_price は使わない）
      const rMult = initialStop != null && ep2 !== initialStop
        ? (xp - ep2) / (ep2 - initialStop)
        : null
      exitFields = {
        exit_date: exitDate || today(),
        exit_price: xp,
        pnl,
        pnl_pct: pnlPct,
        result: classifyResult(pnl),
        r_multiple: rMult,
        exit_reason: exitReason,
        ...(initial?.atr_at_entry != null && initial.atr_at_entry > 0
          ? { r_atr: computeRAtr(ep2, xp, initial.atr_at_entry) }
          : {}),
      }
    }

    setSaving(true)
    setError('')
    setWarning('')

    const record = {
      ticker: ticker.trim().toUpperCase(),
      company_name: companyName.trim() || null,
      sector_s33: sector.trim() || null,
      screen_name: screenName || null,
      entry_type: entryType || null,
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
      // シグナルスナップショット（新規作成時のみ、Daily Watch のカードから渡された場合）
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
          <p className="text-small text-[var(--negative)] bg-[var(--sem-weak-bg)] px-3 py-2 rounded-lg">{error}</p>
        )}
        {warning && (
          <p className="text-small text-[var(--sem-watch-fg)] bg-[var(--sem-watch-bg)] border border-[var(--sem-watch-bd)] px-3 py-2 rounded-lg">{warning}</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Ticker */}
          <div>
            <label className={labelClass}>
              Ticker <span className={requiredClass}>*</span>
            </label>
            <input
              type="text"
              value={ticker}
              onChange={e => setTicker(e.target.value)}
              placeholder="例: 7203"
              className={fieldClass}
            />
          </div>

          {/* Company Name */}
          <div>
            <label className={labelClass}>Name</label>
            <input
              type="text"
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              placeholder="例: トヨタ自動車"
              className={fieldClass}
            />
          </div>

          {/* Sector (33業種プルダウン) */}
          <div>
            <label className={labelClass}>Sector (33業種)</label>
            <select
              value={sector}
              onChange={e => setSector(e.target.value)}
              className={fieldClass}
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
            <label className={labelClass}>Screen</label>
            <select
              value={screenName}
              onChange={e => setScreenName(e.target.value)}
              className={fieldClass}
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

          {/* Entry Type（押し目 / ブレイク — 切り口別の期待値に使う） */}
          <div>
            <label className={labelClass}>Entry Type</label>
            <select
              value={entryType}
              onChange={e => setEntryType(e.target.value)}
              className={fieldClass}
            >
              <option value="">-- Select --</option>
              {entryType && !(ENTRY_TYPES as readonly string[]).includes(entryType) && (
                <option value={entryType}>{entryType}</option>
              )}
              {ENTRY_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Entry Date */}
          <div>
            <label className={labelClass}>
              Entry Date <span className={requiredClass}>*</span>
            </label>
            <input
              type="date"
              value={entryDate}
              onChange={e => setEntryDate(e.target.value)}
              className={fieldClass}
            />
          </div>

          {/* Entry Price */}
          <div>
            <label className={labelClass}>
              Entry Price <span className={requiredClass}>*</span>
            </label>
            <input
              type="number"
              inputMode="numeric"
              value={entryPrice}
              onChange={e => setEntryPrice(e.target.value)}
              placeholder="例: 2500"
              className={fieldClass}
            />
          </div>

          {/* Shares */}
          <div>
            <label className={labelClass}>
              Shares <span className={requiredClass}>*</span>
            </label>
            <input
              type="number"
              inputMode="numeric"
              value={shares}
              onChange={e => setShares(e.target.value)}
              placeholder="例: 100"
              className={fieldClass}
            />
          </div>

          {/* Cost Basis */}
          <div>
            <label className={labelClass}>Cost Basis (incl. fees, optional)</label>
            <input
              type="number"
              inputMode="numeric"
              value={costBasis}
              onChange={e => setCostBasis(e.target.value)}
              placeholder="例: 250500"
              className={fieldClass}
            />
          </div>

          {/* Stop Price（Entry比%を自動表示） */}
          <div>
            <label className={labelClass}>
              Stop Price
              {stopPctFromEntry != null && (
                <span className="ml-1 font-normal num text-[var(--sem-watch-fg)]">
                  （Entry比 {formatPct(stopPctFromEntry, { sign: true })}）
                </span>
              )}
            </label>
            <input
              type="number"
              inputMode="numeric"
              value={stopPrice}
              onChange={e => setStopPrice(e.target.value)}
              placeholder="例: 2350"
              className={fieldClass}
            />
          </div>

          {/* Target Price（Entry比%を自動表示） */}
          <div>
            <label className={labelClass}>
              Target Price (目標株価)
              {targetPctFromEntry != null && (
                <span className="ml-1 font-normal num text-[var(--positive)]">
                  （Entry比 {formatPct(targetPctFromEntry, { sign: true })}）
                </span>
              )}
            </label>
            <input
              type="number"
              inputMode="numeric"
              value={targetPrice}
              onChange={e => setTargetPrice(e.target.value)}
              placeholder="例: 2900"
              className={fieldClass}
            />
          </div>
        </div>

        {/* 株数計算（1R ベース）: 損切り幅が狭いほど同じリスクで大きく建てられる */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-4 space-y-3">
          <p className="text-caption font-medium text-[var(--text-secondary)]">
            株数計算（1R = 口座資金 × リスク %）
            {slowdown && (
              <span className="ml-2 font-normal text-[var(--sem-watch-fg)]">⚠ 減速ルール中 — リスク % を半分で計算</span>
            )}
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>口座資金（円）</label>
              <input
                type="number"
                inputMode="numeric"
                value={capital}
                onChange={e => setCapital(e.target.value)}
                placeholder="例: 5000000"
                className={fieldClass}
              />
            </div>
            <div>
              <label className={labelClass}>リスク %（1 トレード）</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={riskPct}
                onChange={e => setRiskPctInput(e.target.value)}
                placeholder="0.3〜0.5"
                className={fieldClass}
              />
            </div>
          </div>
          {sizing ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-small">
              <span>
                推奨 <strong className="num text-[var(--text-primary)]">{sizing.shares.toLocaleString('ja-JP')}</strong> 株
              </span>
              <span className="num text-[var(--text-muted)]">
                建玉 {formatYen(sizing.positionYen)}（資金の {formatPct(sizing.positionPct, { digits: 1 })}）
              </span>
              <span className="num text-[var(--text-muted)]">1R = {formatYen(sizing.riskYen)}</span>
              {sizing.shares > 0 && String(sizing.shares) !== shares && (
                <button
                  type="button"
                  onClick={() => setShares(String(sizing.shares))}
                  className="px-2 py-1 text-caption rounded-lg bg-[var(--sem-focus-fg)] text-white hover:brightness-110"
                >
                  株数に反映
                </button>
              )}
              {sizing.shares === 0 && (
                <span className="text-caption text-[var(--sem-watch-fg)]">損切り幅に対しリスク額が小さく 100 株に届きません</span>
              )}
            </div>
          ) : (
            <p className="text-caption text-[var(--text-muted)]">Entry と Stop（Entry より下）を入れると推奨株数を計算します</p>
          )}
          {currentRisk && (
            <p className="text-caption num text-[var(--text-muted)]">
              入力中の株数のリスク: {formatYen(currentRisk.yen)}
              {currentRisk.pct != null && `（資金の ${formatPct(currentRisk.pct, { digits: 2 })}）`}
              {currentRisk.posPct != null && ` / 建玉 ${formatPct(currentRisk.posPct, { digits: 1 })}`}
            </p>
          )}
          {stopWiderThanAdr && (
            <p className="text-caption text-[var(--sem-watch-fg)]">
              損切り幅 {formatPct(Math.abs(stopPctFromEntry!), { digits: 1 })} が ADR {formatPct(adr!, { digits: 1 })} より広い —
              建玉が小さくなります。支持線（9/21EMA・VWAP）に近い位置まで引きつけると損切りを短くできます。
            </p>
          )}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={saveSizingDefaults}
              className="text-caption text-[var(--text-secondary)] underline hover:text-[var(--text-primary)]"
            >
              口座資金・リスク % を既定値として保存
            </button>
            {sizingMsg && <span className="text-caption text-[var(--text-muted)]">{sizingMsg}</span>}
          </div>
        </div>

        {/* Memo */}
        <div>
          <label className={labelClass}>Buy thesis</label>
          <textarea
            value={memo}
            onChange={e => setMemo(e.target.value)}
            rows={3}
            placeholder="エントリー理由・注意点など"
            className={`${fieldClass} resize-none`}
          />
        </div>

        {/* Exit（任意）: 入力すると closed として確定。空ければ open のまま */}
        <div className="border border-dashed border-[var(--border-strong)] rounded-lg p-4 space-y-3">
          <p className="text-caption font-medium text-[var(--text-secondary)]">
            イグジット（売り・任意）
            <span className="ml-1 font-normal text-[var(--text-muted)]">— 入力すると「確定（closed）」として保存し損益を自動計算</span>
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {/* Exit Date */}
            <div>
              <label className={labelClass}>Exit Date</label>
              <input
                type="date"
                value={exitDate}
                onChange={e => setExitDate(e.target.value)}
                className={fieldClass}
              />
            </div>
            {/* Exit Price */}
            <div>
              <label className={labelClass}>Exit Price</label>
              <input
                type="number"
                inputMode="numeric"
                value={exitPrice}
                onChange={e => setExitPrice(e.target.value)}
                placeholder="例: 4100"
                className={fieldClass}
              />
            </div>
            {/* Exit Shares */}
            <div>
              <label className={labelClass}>Shares</label>
              <input
                type="number"
                inputMode="numeric"
                value={exitShares}
                onChange={e => setExitShares(e.target.value)}
                placeholder={shares !== '' ? `${shares}（全株）` : '例: 100'}
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

          {exitPreview && (() => {
            const bg = exitPreview.result === 'WIN' ? 'bg-[var(--sem-ok-bg)]'
              : exitPreview.result === 'LOSS' ? 'bg-[var(--sem-weak-bg)]' : 'bg-[var(--bg-primary)]'
            const fgStrong = exitPreview.result === 'WIN' ? 'text-[var(--sem-strong-fg)]'
              : exitPreview.result === 'LOSS' ? 'text-[var(--sem-weak-fg)]' : 'text-[var(--text-primary)]'
            return (
              <div className={`rounded-lg px-4 py-2 text-center ${bg}`}>
                <span className={`text-lead font-medium num ${fgStrong}`}>
                  {formatYen(exitPreview.pnl, { sign: true })}
                  {' '}({formatPct(exitPreview.pnlPct, { sign: true })})
                </span>
                <span className={`ml-2 text-caption font-medium ${fgStrong}`}>{exitPreview.result}</span>
              </div>
            )
          })()}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className={btnSecondary}
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={btnPrimary}
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
