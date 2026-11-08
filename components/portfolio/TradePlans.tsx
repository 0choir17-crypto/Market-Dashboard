'use client'

// 「1 回のリスク」下段: 次に買う銘柄の検討中リスト（前日夜に計画する）。
//   寄りで買う前提。想定エントリー = 前日終値、損切り = 手入力の価格。
//   株数 = 許容損失 ÷（前日終値 − 損切り）を 100 株単位で切り捨て（lib/rStats#suggestShares）。
// 計画は Supabase の trade_plans に保存（全端末で共有、書き込みはログイン必須）。
// 株数は保存せず、現金・リスク % が変われば一覧の株数も計算し直す。
// 「新規トレードに入力」で新規トレード画面へ引き継ぎ、記録したら一覧から消える（app/journal/page.tsx）。

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { suggestShares } from '@/lib/rStats'
import { formatYen, formatPct } from '@/lib/format'

export type TradePlan = {
  id: string
  ticker: string
  prev_close: number
  stop_price: number
  memo: string | null
  created_at: string
  updated_at: string
}

export type PlanHandoff = {
  planId: string | null
  ticker: string
  entry_price: number
  shares: number
  stop_price: number
  signal_price: number
  memo: string | null
}

type Props = {
  capital: number
  /** 減速ルール適用後のリスク % */
  riskPct: number
  onUseForTrade?: (v: PlanHandoff) => void
  /** 変わったら一覧を読み直す（新規トレード記録で計画が消えた後など） */
  reloadKey?: number
}

type Form = { id: string | null; code: string; prevClose: string; stop: string; memo: string }
const EMPTY: Form = { id: null, code: '', prevClose: '', stop: '', memo: '' }

const fieldBase =
  'border border-[var(--border-strong)] rounded-lg px-2.5 py-1.5 text-body bg-[var(--bg-card)] text-[var(--text-primary)]'
const field = `${fieldBase} w-full num`
const btnSmall =
  'px-2.5 py-1 rounded-lg text-small border-[0.5px] border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover,transparent)] transition-colors whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed'
const btnPrimary =
  'px-3 py-1.5 rounded-lg text-small font-medium text-white bg-[var(--sem-focus-fg)] hover:brightness-110 transition-colors min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap'

type Calc =
  | { kind: 'invalid' }
  | { kind: 'ok'; stopPct: number; perShare: number; sz: ReturnType<typeof suggestShares> }

function calc(entry: number, stop: number, capital: number, riskPct: number): Calc | null {
  if (!(entry > 0) || !(stop > 0)) return null
  if (stop >= entry) return { kind: 'invalid' }
  return {
    kind: 'ok',
    stopPct: (entry - stop) / entry * 100,
    perShare: entry - stop,
    sz: suggestShares({ capital, riskPct, entry, stop }),
  }
}

/** テーブル未作成（SQL 未実行）を見分ける */
function isMissingTable(err: { code?: string; message: string }): boolean {
  return err.code === '42P01' || err.code === 'PGRST205' || (/trade_plans/.test(err.message) && /not find|does not exist/.test(err.message))
}

export default function TradePlans({ capital, riskPct, onUseForTrade, reloadKey = 0 }: Props) {
  const [form, setForm] = useState<Form>(EMPTY)
  const [plans, setPlans] = useState<TradePlan[]>([])
  const [msg, setMsg] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('trade_plans')
      .select('*')
      .order('created_at', { ascending: true })
    if (error) {
      setMsg(isMissingTable(error)
        ? 'trade_plans テーブルがありません。supabase/migrations/20261110_trade_plans.sql を Supabase の SQL Editor で実行してください'
        : `検討中の読み込みに失敗: ${error.message}`)
      return
    }
    setPlans((data ?? []) as TradePlan[])
  }, [])

  useEffect(() => { load() }, [load, reloadKey])

  const prevClose = parseFloat(form.prevClose)
  const stop = parseFloat(form.stop)
  const formCalc = calc(prevClose, stop, capital, riskPct)
  const canSave = form.code.trim() !== '' && formCalc?.kind === 'ok' && !saving

  async function save() {
    if (!canSave) return
    setSaving(true)
    const row = {
      ticker: form.code.trim().toUpperCase(),
      prev_close: prevClose,
      stop_price: stop,
      memo: form.memo.trim() || null,
      updated_at: new Date().toISOString(),
    }
    const { error } = form.id
      ? await supabase.from('trade_plans').update(row).eq('id', form.id)
      : await supabase.from('trade_plans').insert(row)
    setSaving(false)
    if (error) {
      setMsg(isMissingTable(error)
        ? 'trade_plans テーブルがありません。supabase/migrations/20261110_trade_plans.sql を Supabase の SQL Editor で実行してください'
        : `保存に失敗しました（ログインが必要です）: ${error.message}`)
      return
    }
    setMsg(form.id ? '更新しました' : '検討中に保存しました')
    setForm(EMPTY)
    load()
  }

  async function remove(p: TradePlan) {
    if (!window.confirm(`${p.ticker} の計画を削除しますか？`)) return
    const { error } = await supabase.from('trade_plans').delete().eq('id', p.id)
    if (error) { setMsg(`削除に失敗しました（ログインが必要です）: ${error.message}`); return }
    if (form.id === p.id) setForm(EMPTY)
    setMsg('')
    load()
  }

  function handoff(planId: string | null, ticker: string, entry: number, stopPx: number, memo: string | null, c: Calc | null) {
    if (!onUseForTrade || c?.kind !== 'ok' || c.sz == null || c.sz.shares <= 0) return
    onUseForTrade({ planId, ticker, entry_price: entry, shares: c.sz.shares, stop_price: stopPx, signal_price: entry, memo })
  }

  return (
    <div className="mt-3 pt-3 border-t-[0.5px] border-[var(--border)]">
      <div className="text-small text-[var(--text-muted)] mb-2">
        次に買う銘柄（寄りで買う前提・想定エントリー = 前日終値）
      </div>

      {/* 入力 */}
      <div className="grid grid-cols-2 sm:grid-cols-[8rem_9rem_9rem_minmax(0,1fr)] gap-3">
        <label className="block">
          <span className="block text-small text-[var(--text-muted)] mb-1">コード</span>
          <input type="text" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                 placeholder="7203" className={field} />
        </label>
        <label className="block">
          <span className="block text-small text-[var(--text-muted)] mb-1">前日終値</span>
          <input type="number" inputMode="decimal" value={form.prevClose}
                 onChange={e => setForm(f => ({ ...f, prevClose: e.target.value }))} placeholder="2500" className={field} />
        </label>
        <label className="block">
          <span className="block text-small text-[var(--text-muted)] mb-1">損切り価格</span>
          <input type="number" inputMode="decimal" value={form.stop}
                 onChange={e => setForm(f => ({ ...f, stop: e.target.value }))} placeholder="2400" className={field} />
        </label>
        <label className="block col-span-2 sm:col-span-1">
          <span className="block text-small text-[var(--text-muted)] mb-1">メモ（条件など）</span>
          <input type="text" value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
                 placeholder="例: 前日高値を超えて寄ったら" className={`${fieldBase} w-full`} />
        </label>
      </div>

      <div className="mt-2 text-body num">
        {formCalc == null ? (
          <span className="text-small text-[var(--text-muted)]">前日終値と損切り価格を入れると損切り幅と株数が出ます</span>
        ) : (
          <CalcLine c={formCalc} capital={capital} />
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={save} disabled={!canSave} className={btnPrimary}>
          {form.id ? '計画を更新' : '検討中に保存'}
        </button>
        {onUseForTrade && (
          <button
            type="button"
            className={btnSmall}
            disabled={!(form.code.trim() !== '' && formCalc?.kind === 'ok' && formCalc.sz != null && formCalc.sz.shares > 0)}
            onClick={() => handoff(form.id, form.code.trim().toUpperCase(), prevClose, stop, form.memo.trim() || null, formCalc)}
          >
            新規トレードに入力 →
          </button>
        )}
        {form.id && (
          <button type="button" className={btnSmall} onClick={() => setForm(EMPTY)}>編集をやめる</button>
        )}
        {msg && <span className="text-small text-[var(--text-muted)]">{msg}</span>}
      </div>

      {/* 検討中 */}
      <div className="mt-4">
        <div className="text-small text-[var(--text-muted)] mb-1.5">
          検討中 {plans.length > 0 && <span className="num">（{plans.length}）</span>}
        </div>
        {plans.length === 0 ? (
          <div className="text-small text-[var(--text-muted)]">まだありません</div>
        ) : (
          <ul className="divide-y-[0.5px] divide-[var(--border)]">
            {plans.map(p => {
              const c = calc(p.prev_close, p.stop_price, capital, riskPct)
              const usable = c?.kind === 'ok' && c.sz != null && c.sz.shares > 0
              return (
                <li key={p.id} className="py-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <strong className="text-body num text-[var(--text-primary)] min-w-[4rem]">{p.ticker}</strong>
                  <span className="text-body num text-[var(--text-secondary)]">
                    {Number(p.prev_close).toLocaleString('ja-JP')} → 損切り {Number(p.stop_price).toLocaleString('ja-JP')}
                  </span>
                  <span className="text-body num">{c && <CalcLine c={c} capital={capital} compact />}</span>
                  {p.memo && <span className="text-small text-[var(--text-muted)] basis-full sm:basis-auto">{p.memo}</span>}
                  <span className="ml-auto flex gap-1.5">
                    {onUseForTrade && (
                      <button type="button" className={btnSmall} disabled={!usable}
                              onClick={() => handoff(p.id, p.ticker, Number(p.prev_close), Number(p.stop_price), p.memo, c)}>
                        新規トレードに入力
                      </button>
                    )}
                    <button type="button" className={btnSmall} onClick={() => {
                      setForm({ id: p.id, code: p.ticker, prevClose: String(p.prev_close), stop: String(p.stop_price), memo: p.memo ?? '' })
                      setMsg('')
                    }}>編集</button>
                    <button type="button" className={btnSmall} onClick={() => remove(p)}>削除</button>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
        {plans.length > 0 && (
          <div className="text-caption text-[var(--text-muted)] mt-1">
            新規トレードに記録すると一覧から消えます。寄り値は新規トレード画面で直してください（株数もそこで計算し直せます）。
          </div>
        )}
      </div>
    </div>
  )
}

function CalcLine({ c, capital, compact = false }: { c: Calc; capital: number; compact?: boolean }) {
  if (c.kind === 'invalid') {
    return <span className="text-small text-[var(--sem-watch-fg)]">損切り価格が前日終値以上です</span>
  }
  const head = (
    <span className="text-[var(--text-secondary)]">
      損切り幅 −{formatPct(c.stopPct)}
      {!compact && <>（{c.perShare.toLocaleString('ja-JP', { maximumFractionDigits: 1 })} 円/株）</>}
    </span>
  )
  if (c.sz == null) {
    return <span className="inline-flex flex-wrap gap-x-4">{head}<span className="text-small text-[var(--text-muted)]">現金とリスク % を入れると株数が出ます</span></span>
  }
  if (c.sz.shares === 0) {
    return <span className="inline-flex flex-wrap gap-x-4">{head}<span className="text-small text-[var(--sem-watch-fg)]">損切り幅が広く 100 株に届きません</span></span>
  }
  return (
    <span className="inline-flex flex-wrap gap-x-4 gap-y-0.5">
      {head}
      <strong className="text-[var(--text-primary)]">{c.sz.shares.toLocaleString('ja-JP')} 株</strong>
      <span className="text-[var(--text-secondary)]">建玉 {formatYen(c.sz.positionYen)}（{c.sz.positionPct.toFixed(1)}%）</span>
      {!compact && (
        <span className="text-[var(--text-secondary)]">
          損失 {formatYen(c.sz.riskYen)}{capital > 0 ? `（${(c.sz.riskYen / capital * 100).toFixed(2)}%）` : ''}
        </span>
      )}
    </span>
  )
}
