'use client'

// 「1 回のリスク」下段: 次に買う銘柄の検討中リスト（前日夜に計画する）。
//   寄りで買う前提。想定エントリー = 前日終値、損切り = 手入力の価格。
//   株数 = 許容損失 ÷（前日終値 − 損切り）を 100 株単位で切り捨て（lib/rStats#suggestShares）。
// 計画は Supabase の trade_plans に保存（全端末で共有、書き込みはログイン必須）。
// 株数は保存せず、現金・リスク % が変われば一覧の株数も計算し直す。
// 「新規トレードに入力」で新規トレード画面へ引き継ぎ、記録したら一覧から消える（app/journal/page.tsx）。
// 買付余力（現物のみ）= 口座総額（現金欄）− 保有中の取得額（エントリー × 株数）。
//   一覧は上から順に買う前提で、残り余力を超える行は買える株数（100 株単位）まで減らす。
// 並び順 = 優先順位（sort_order）。↑↓ で入れ替える。列が未作成なら作成順。

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { insertResilient, updateResilient } from '@/lib/resilientWrite'
import { suggestShares } from '@/lib/rStats'
import { formatYen, formatPct } from '@/lib/format'

export type TradePlan = {
  id: string
  ticker: string
  company_name: string | null
  prev_close: number
  stop_price: number
  memo: string | null
  created_at: string
  updated_at: string
  /** 優先順位（小さいほど先に買う）。列未作成・未設定は null */
  sort_order?: number | null
}

const SORT_SQL = 'supabase/migrations/20261113_trade_plans_sort_order.sql'
// RLS で書き込めない（この端末で未ログイン）と、エラーにならず 0 行更新で終わる
const NOT_WRITTEN = '保存されませんでした。この端末でログインしているか確認してください（ログインしていないと閲覧のみ）'

/** 優先順位順（sort_order 未設定は後ろ、同順位は作成順） */
function byPriority(a: TradePlan, b: TradePlan): number {
  const sa = a.sort_order ?? Number.MAX_SAFE_INTEGER
  const sb = b.sort_order ?? Number.MAX_SAFE_INTEGER
  return sa !== sb ? sa - sb : a.created_at.localeCompare(b.created_at)
}

export type PlanHandoff = {
  planId: string | null
  ticker: string
  company_name: string | null
  entry_price: number
  shares: number
  stop_price: number
  signal_price: number
  memo: string | null
}

type Props = {
  capital: number
  /** 保有中の取得額の合計（エントリー × 株数）。買付余力 = capital − これ */
  holdingsCost: number
  /** 減速ルール適用後のリスク % */
  riskPct: number
  onUseForTrade?: (v: PlanHandoff) => void
  /** 変わったら一覧を読み直す（新規トレード記録で計画が消えた後など） */
  reloadKey?: number
}

type Form = { id: string | null; code: string; name: string; prevClose: string; stop: string; memo: string }
const EMPTY: Form = { id: null, code: '', name: '', prevClose: '', stop: '', memo: '' }

const fieldBase =
  'border border-[var(--border-strong)] rounded-lg px-2.5 py-1.5 text-body bg-[var(--bg-card)] text-[var(--text-primary)]'
const field = `${fieldBase} w-full num`
const btnSmall =
  'px-2.5 py-1 rounded-lg text-small border-[0.5px] border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover,transparent)] transition-colors whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed'
const btnPrimary =
  'px-3 py-1.5 rounded-lg text-small font-medium text-white bg-[var(--sem-focus-fg)] hover:brightness-110 transition-colors min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap'

type Calc =
  | { kind: 'invalid' }
  | {
      kind: 'ok'; stopPct: number; perShare: number; sz: ReturnType<typeof suggestShares>; overRisk: boolean
      /** 残り余力で株数を減らした時: リスク計算の株数と、減らす前の残り余力 */
      capped?: { riskShares: number; remaining: number }
    }

function calc(entry: number, stop: number, capital: number, riskPct: number): Calc | null {
  if (!(entry > 0) || !(stop > 0)) return null
  if (stop >= entry) return { kind: 'invalid' }
  const perShare = entry - stop
  let sz = suggestShares({ capital, riskPct, entry, stop })
  // 損切り幅が広く許容損失では 100 株に届かない時も、最小単位の 100 株で計算する（警告は残す）
  const overRisk = sz != null && sz.shares === 0
  if (sz != null && overRisk) {
    sz = { shares: 100, riskYen: 100 * perShare, positionYen: 100 * entry, positionPct: 100 * entry / capital * 100 }
  }
  return { kind: 'ok', stopPct: perShare / entry * 100, perShare, sz, overRisk }
}

/** 残り余力で買える株数（100 株単位）まで減らす */
function capToPower(c: Calc | null, entry: number, remaining: number | null, capital: number): Calc | null {
  if (c?.kind !== 'ok' || c.sz == null || remaining == null) return c
  const affordable = Math.max(0, Math.floor(remaining / entry / 100) * 100)
  if (c.sz.shares <= affordable) return c
  const shares = affordable
  return {
    ...c,
    sz: { shares, riskYen: shares * c.perShare, positionYen: shares * entry, positionPct: capital > 0 ? shares * entry / capital * 100 : 0 },
    capped: { riskShares: c.sz.shares, remaining },
  }
}

/** テーブル未作成（SQL 未実行）を見分ける */
function isMissingTable(err: { code?: string; message: string }): boolean {
  return err.code === '42P01' || err.code === 'PGRST205' || (/trade_plans/.test(err.message) && /not find|does not exist/.test(err.message))
}

export default function TradePlans({ capital, holdingsCost, riskPct, onUseForTrade, reloadKey = 0 }: Props) {
  const [form, setForm] = useState<Form>(EMPTY)
  const [plans, setPlans] = useState<TradePlan[]>([])
  const [msg, setMsg] = useState('')
  const [saving, setSaving] = useState(false)
  const formRef = useRef<HTMLDivElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)

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
    setPlans([...((data ?? []) as TradePlan[])].sort(byPriority))
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
      company_name: form.name.trim() || null,
      prev_close: prevClose,
      stop_price: stop,
      memo: form.memo.trim() || null,
      updated_at: new Date().toISOString(),
      // 新規は一覧の最後（最も低い優先順位）に入れる
      ...(form.id ? {} : { sort_order: plans.reduce((m, p) => Math.max(m, p.sort_order ?? 0), 0) + 1 }),
    }
    // company_name 列が未作成でも保存は通す（列を除外して再試行）
    const { error, stripped, count } = form.id
      ? await updateResilient('trade_plans', row, { id: form.id })
      : await insertResilient('trade_plans', row)
    setSaving(false)
    if (error) {
      setMsg(isMissingTable(error)
        ? 'trade_plans テーブルがありません。supabase/migrations/20261110_trade_plans.sql を Supabase の SQL Editor で実行してください'
        : `保存に失敗しました（ログインが必要です）: ${error.message}`)
      return
    }
    if (form.id && count === 0) { setMsg(NOT_WRITTEN); return }
    setMsg(stripped.includes('company_name')
      ? '保存しました（銘柄名は未保存: supabase/migrations/20261112_trade_plans_company_name.sql を実行してください）'
      : form.id ? '更新しました' : '検討中に保存しました')
    setForm(EMPTY)
    load()
  }

  // 優先順位の入れ替え。画面は先に並べ替え、番号がずれた行だけ保存する
  async function move(index: number, dir: -1 | 1) {
    const j = index + dir
    if (j < 0 || j >= plans.length) return
    const next = [...plans]
    ;[next[index], next[j]] = [next[j], next[index]]
    const changed = next
      .map((p, k) => ({ p, order: k + 1 }))
      .filter(({ p, order }) => p.sort_order !== order)
    setPlans(next.map((p, k) => ({ ...p, sort_order: k + 1 })))
    const results = await Promise.all(changed.map(({ p, order }) =>
      updateResilient('trade_plans', { sort_order: order }, { id: p.id })))
    const failed = results.find(r => r.error)
    if (results.some(r => r.count === 0)) {
      setMsg(NOT_WRITTEN)
      load()
    } else if (results.some(r => r.stripped.includes('sort_order'))) {
      setMsg(`優先順位を保存するには ${SORT_SQL} を Supabase の SQL Editor で実行してください（今は画面上だけ並べ替えています）`)
    } else if (failed?.error) {
      setMsg(`優先順位の保存に失敗しました（ログインが必要です）: ${failed.error.message}`)
    } else {
      setMsg('')
    }
  }

  async function remove(p: TradePlan) {
    if (!window.confirm(`${p.ticker} の計画を削除しますか？`)) return
    const { error, count } = await supabase.from('trade_plans').delete({ count: 'exact' }).eq('id', p.id)
    if (error) { setMsg(`削除に失敗しました（ログインが必要です）: ${error.message}`); return }
    if (count === 0) { setMsg(NOT_WRITTEN); return }
    if (form.id === p.id) setForm(EMPTY)
    setMsg('')
    load()
  }

  function handoff(planId: string | null, ticker: string, name: string | null, entry: number, stopPx: number, memo: string | null, c: Calc | null) {
    if (!onUseForTrade || c?.kind !== 'ok' || c.sz == null || c.sz.shares <= 0) return
    onUseForTrade({ planId, ticker, company_name: name, entry_price: entry, shares: c.sz.shares, stop_price: stopPx, signal_price: entry, memo })
  }

  // 買付余力と、上から順に買った場合の累計建玉
  const buyingPower = capital > 0 ? capital - holdingsCost : null
  const rows = plans.reduce<{ p: TradePlan; c: Calc | null; pos: number; cum: number }[]>((acc, p) => {
    const before = acc.length ? acc[acc.length - 1].cum : 0
    const entry = Number(p.prev_close)
    const c = capToPower(
      calc(entry, Number(p.stop_price), capital, riskPct), entry,
      buyingPower != null ? buyingPower - before : null, capital,
    )
    const pos = c?.kind === 'ok' && c.sz != null ? c.sz.positionYen : 0
    return [...acc, { p, c, pos, cum: before + pos }]
  }, [])
  const plannedTotal = rows.length ? rows[rows.length - 1].cum : 0
  // 入力中の計画: 新規は一覧の最後に足す前提、編集中はその行より上の累計を差し引いた残り余力で判定
  const editingRow = form.id ? rows.find(r => r.p.id === form.id) : undefined
  const formRemaining = buyingPower == null ? null
    : buyingPower - (editingRow ? editingRow.cum - editingRow.pos : plannedTotal)
  const formCalcCapped = capToPower(formCalc, prevClose, formRemaining, capital)
  const formPos = formCalcCapped?.kind === 'ok' && formCalcCapped.sz != null && formCalcCapped.sz.shares > 0 ? formCalcCapped.sz.positionYen : null

  return (
    <div className="mt-3 pt-3 border-t-[0.5px] border-[var(--border)]">
      <div className="text-small text-[var(--text-muted)] mb-2">
        次に買う銘柄（寄りで買う前提・想定エントリー = 前日終値）
      </div>

      {/* 入力 */}
      {form.id && (
        <div className="mb-2 text-small font-medium text-[var(--sem-focus-fg)]">
          編集中: {form.code}（変更して「計画を更新」を押す）
        </div>
      )}
      <div ref={formRef} />
      <div className="grid grid-cols-2 sm:grid-cols-[7rem_10rem_8rem_8rem_minmax(0,1fr)] gap-3">
        <label className="block">
          <span className="block text-small text-[var(--text-muted)] mb-1">コード</span>
          <input type="text" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                 ref={codeRef} placeholder="7203" className={field} />
        </label>
        <label className="block">
          <span className="block text-small text-[var(--text-muted)] mb-1">銘柄名</span>
          <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                 placeholder="トヨタ自動車" className={`${fieldBase} w-full`} />
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
          <span className="inline-flex flex-wrap gap-x-4">
            {formCalcCapped && <CalcLine c={formCalcCapped} capital={capital} />}
            {formPos != null && formRemaining != null && (
              <span className="text-[var(--text-secondary)]">追加後の残り余力 {formatYen(formRemaining - formPos)}</span>
            )}
          </span>
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
            disabled={!(form.code.trim() !== '' && formPos != null)}
            onClick={() => handoff(form.id, form.code.trim().toUpperCase(), form.name.trim() || null, prevClose, stop, form.memo.trim() || null, formCalcCapped)}
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
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-1.5">
          <span className="text-small text-[var(--text-muted)]">
            検討中 {plans.length > 0 && <span className="num">（{plans.length}）</span>}
          </span>
          {buyingPower == null ? (
            <span className="text-small text-[var(--text-muted)]">現金を入れると買付余力が出ます</span>
          ) : (
            <span className="text-small num text-[var(--text-secondary)] flex flex-wrap gap-x-3">
              <span>買付余力 <strong className="text-[var(--text-primary)]">{formatYen(buyingPower)}</strong>
                <span className="text-[var(--text-muted)]">（総額 {formatYen(capital)} − 保有中 {formatYen(holdingsCost)}）</span></span>
              <span>検討中の合計 {formatYen(plannedTotal)}</span>
              <span>
                全部買った後の残り <strong>{formatYen(buyingPower - plannedTotal)}</strong>
              </span>
            </span>
          )}
        </div>
        {plans.length === 0 ? (
          <div className="text-small text-[var(--text-muted)]">まだありません</div>
        ) : (
          <ul className="divide-y-[0.5px] divide-[var(--border)]">
            {rows.map(({ p, c }, i) => {
              const usable = c?.kind === 'ok' && c.sz != null && c.sz.shares > 0
              return (
                <li key={p.id} className={`py-2 flex flex-wrap items-center gap-x-4 gap-y-1 ${form.id === p.id ? 'bg-[var(--sem-focus-bg,rgba(37,99,235,0.08))] rounded-lg -mx-2 px-2' : ''}`}>
                  <span className="flex items-center gap-1">
                    <span className="w-5 text-center text-small num font-medium text-[var(--text-muted)]">{i + 1}</span>
                    <span className="flex flex-col">
                      <button type="button" aria-label={`${p.ticker} の優先順位を上げる`} disabled={i === 0}
                              onClick={() => move(i, -1)}
                              className="px-1.5 leading-none text-small text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-25 disabled:cursor-not-allowed">▲</button>
                      <button type="button" aria-label={`${p.ticker} の優先順位を下げる`} disabled={i === rows.length - 1}
                              onClick={() => move(i, 1)}
                              className="px-1.5 leading-none text-small text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-25 disabled:cursor-not-allowed">▼</button>
                    </span>
                  </span>
                  <span className="min-w-[4rem]">
                    <strong className="text-body num text-[var(--text-primary)]">{p.ticker}</strong>
                    {p.company_name && <span className="ml-1.5 text-small text-[var(--text-secondary)]">{p.company_name}</span>}
                  </span>
                  <span className="text-body num text-[var(--text-secondary)]">
                    {Number(p.prev_close).toLocaleString('ja-JP')} → 損切り {Number(p.stop_price).toLocaleString('ja-JP')}
                  </span>
                  <span className="text-body num">{c && <CalcLine c={c} capital={capital} compact />}</span>
                  {p.memo && <span className="text-small text-[var(--text-muted)] basis-full sm:basis-auto">{p.memo}</span>}
                  <span className="ml-auto flex gap-1.5">
                    {onUseForTrade && (
                      <button type="button" className={btnSmall} disabled={!usable}
                              onClick={() => handoff(p.id, p.ticker, p.company_name, Number(p.prev_close), Number(p.stop_price), p.memo, c)}>
                        新規トレードに入力
                      </button>
                    )}
                    <button type="button" className={btnSmall} onClick={() => {
                      setForm({ id: p.id, code: p.ticker, name: p.company_name ?? '', prevClose: String(p.prev_close), stop: String(p.stop_price), memo: p.memo ?? '' })
                      setMsg('')
                      // 入力欄は一覧の上にあるため、スマホでは画面外になりやすい。見える位置まで戻す
                      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                      codeRef.current?.focus({ preventScroll: true })
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
            番号が優先順位です（▲▼ で入れ替え）。上から順に買付余力を割り当てます。新規トレードに記録すると一覧から消えます。寄り値は新規トレード画面で直してください（株数もそこで計算し直せます）。
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
  if (c.capped && c.sz.shares === 0) {
    return (
      <span className="inline-flex flex-wrap gap-x-4">
        {head}
        <span className="text-[var(--sem-watch-fg)]">
          余力不足で買えません（残り余力 {formatYen(Math.max(0, c.capped.remaining))}・リスク計算では {c.capped.riskShares.toLocaleString('ja-JP')} 株）
        </span>
      </span>
    )
  }
  return (
    <span className="inline-flex flex-wrap gap-x-4 gap-y-0.5">
      {head}
      <strong className="text-[var(--text-primary)]">{c.sz.shares.toLocaleString('ja-JP')} 株</strong>
      <span className="text-[var(--text-secondary)]">建玉 {formatYen(c.sz.positionYen)}（{c.sz.positionPct.toFixed(1)}%）</span>
      {c.capped && (
        <span className="text-[var(--sem-watch-fg)]">
          余力不足のため減額（リスク計算では {c.capped.riskShares.toLocaleString('ja-JP')} 株）
        </span>
      )}
      {c.overRisk ? (
        <span className="text-[var(--sem-watch-fg)]">
          ⚠ 許容損失超過: 100 株で損失 {formatYen(c.sz.riskYen)}{capital > 0 ? `（${(c.sz.riskYen / capital * 100).toFixed(2)}%）` : ''}
        </span>
      ) : !compact && (
        <span className="text-[var(--text-secondary)]">
          損失 {formatYen(c.sz.riskYen)}{capital > 0 ? `（${(c.sz.riskYen / capital * 100).toFixed(2)}%）` : ''}
        </span>
      )}
    </span>
  )
}
