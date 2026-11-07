'use client'

// 決済済みトレードの一覧表。
//
// 振り返りに使う情報は開かなくても一覧で読めるようにする:
//   決済日欄 … 決済日と保有期間（建日 → 決済日）
//   損益欄   … % と円、建値 → 決済価格 × 株数
//   買った日 / 売った日 … RS · RVOL · ADR（参考）
//   最大益・最大損・取り逃し・自動判定
// 行クリックで開くのはタグ（エントリー / イグジット）とメモだけ。
// タグはクリックした時点で、メモは入力欄を離れた時点で保存する（保存ボタンなし）。
// 表は枠内でスクロールし、列見出しは常に上に固定する。

import { Fragment, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Trade } from '@/types/trades'
import { effectiveResult } from '@/lib/tradeResult'
import { formatPct, formatYen, pnlColorClass } from '@/lib/format'
import { CATEGORY_LABELS, getTagById, ReviewTagCategory, tagsOf } from '@/lib/reviewTags'
import { R_UNIT, rOf, RBasis } from '@/lib/rStats'
import { mfeReliable, missedRate, tradeFlags } from '@/lib/tradeFlags'
import { tradingViewUrl } from '@/lib/tickerLinks'
import { toneStyle } from '@/types/semantic'

type Props = {
  trades: Trade[]
  basis: RBasis
  onEdit: (t: Trade) => void
  /** 外部（散布図など）から開く行。n は同じ行を再度開くためのカウンタ */
  focus?: { id: number; n: number } | null
}

const PAGE = 30
const COLS = 11

function holdDays(a: string | null, b: string | null): number | null {
  if (!a || !b) return null
  const ms = new Date(b).getTime() - new Date(a).getTime()
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 86400000)) : null
}

function Dash({ title }: { title?: string }) {
  return <span className="text-[var(--text-muted)]" title={title}>—</span>
}

function Pct({ v }: { v: number | null | undefined }) {
  if (v == null) return <Dash />
  return <span className={`num ${pnlColorClass(v)}`}>{formatPct(v, { digits: 1, sign: true })}</span>
}

function yen(v: number | null | undefined): string {
  return v == null ? '—' : `¥${v.toLocaleString('ja-JP')}`
}

/** RS · RVOL · ADR を 1 セルに。全部無ければ — */
function Metrics({ rs, rvol, adr }: { rs?: number | null; rvol?: number | null; adr?: number | null }) {
  if (rs == null && rvol == null && adr == null) return <Dash />
  return (
    <span className="num text-[var(--text-secondary)] whitespace-nowrap">
      {rs != null ? rs.toFixed(0) : '—'}
      <span className="text-[var(--text-muted)]"> · </span>
      <span className={rvol != null && rvol >= 2 ? 'text-[var(--positive)]' : undefined}>{rvol != null ? rvol.toFixed(1) : '—'}</span>
      <span className="text-[var(--text-muted)]"> · </span>
      {adr != null ? `${adr.toFixed(1)}%` : '—'}
    </span>
  )
}

type ResultFilter = 'all' | 'win' | 'loss'

export default function ClosedTradesTable({ trades, basis, onEdit, focus }: Props) {
  const [year, setYear] = useState<string>('all')
  const [result, setResult] = useState<ResultFilter>('all')
  const [limit, setLimit] = useState(PAGE)
  const [openId, setOpenId] = useState<number | null>(null)
  // 保存済みの変更を手元に持つ（全体を再取得しない）
  const [local, setLocal] = useState<Record<number, Partial<Trade>>>({})
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    if (!focus) return
    setYear('all'); setResult('all'); setOpenId(focus.id); setLimit(l => Math.max(l, trades.length))
    requestAnimationFrame(() => {
      document.getElementById(`trade-${focus.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }, [focus, trades.length])

  const merged = useMemo(
    () => trades.map(t => (local[t.id] ? { ...t, ...local[t.id] } : t)),
    [trades, local],
  )
  const years = useMemo(
    () => [...new Set(merged.map(t => (t.exit_date ?? '').slice(0, 4)).filter(Boolean))].sort().reverse(),
    [merged],
  )
  const rows = useMemo(() => merged
    .filter(t => year === 'all' || (t.exit_date ?? '').startsWith(year))
    .filter(t => {
      if (result === 'all') return true
      const r = effectiveResult(t)
      return result === 'win' ? r === 'WIN' : r === 'LOSS'
    })
    .sort((a, b) => (b.exit_date ?? '').localeCompare(a.exit_date ?? '') || b.id - a.id),
  [merged, year, result])

  async function save(t: Trade, patch: Partial<Trade>) {
    const full = { ...patch, reviewed_at: new Date().toISOString() }
    setLocal(prev => ({ ...prev, [t.id]: { ...prev[t.id], ...full } }))
    const { error } = await supabase.from('trades').update(full).eq('id', t.id)
    setSaveError(error ? `保存できませんでした（${t.ticker}）: ${error.message}` : '')
  }

  function toggleTag(t: Trade, id: string) {
    const cur = t.review_tags ?? []
    save(t, { review_tags: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] })
  }

  const u = R_UNIT[basis]
  const selectClass = 'text-small px-2 py-1 rounded-md border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)]'
  const th = 'font-medium px-3 py-2 whitespace-nowrap bg-[var(--bg-card)]'

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <h2 className="text-title font-medium text-[var(--text-primary)] mr-auto">
          決済済み <span className="text-lead num text-[var(--text-muted)]">{rows.length}</span>
        </h2>
        <select value={year} onChange={e => setYear(e.target.value)} className={selectClass} aria-label="年">
          <option value="all">全期間</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={result} onChange={e => setResult(e.target.value as ResultFilter)} className={selectClass} aria-label="結果">
          <option value="all">勝ち負けすべて</option>
          <option value="win">勝ちのみ</option>
          <option value="loss">負けのみ</option>
        </select>
      </div>
      {saveError && <p className="text-small text-[var(--negative)] mb-2">{saveError}</p>}

      {/* 枠内スクロール + 見出し固定（overflow を持つ親の中では、ページのスクロールに sticky が効かないため） */}
      <div className="bg-[var(--bg-card)] rounded-xl border-[0.5px] border-[var(--border)] overflow-auto max-h-[calc(100vh-160px)]">
        <table className="w-full text-body">
          <thead className="sticky top-0 z-[1] text-small text-[var(--text-muted)] shadow-[0_0.5px_0_var(--border)]">
            <tr>
              <th className={`${th} text-left`}>決済日 / 期間</th>
              <th className={`${th} text-left`}>銘柄</th>
              <th className={`${th} text-left`}>損益 / 建値 → 決済</th>
              <th className={`${th} text-right`} title={basis === 'atr' ? '(決済 − 建値) ÷ 買う前日の ATR14' : '損切り基準の R'}>{u}</th>
              <th className={`${th} text-right`} title="保有中の最大含み益（MFE）。同日決済は買う前の高値と区別できないため出さない">最大益</th>
              <th className={`${th} text-right`} title="保有中の最大含み損（MAE）。同日決済は出さない">最大損</th>
              <th className={`${th} text-right`} title="勝ちトレードのみ: (最大益 − 実際の損益) ÷ 最大益">取り逃し</th>
              <th className={`${th} text-left`} title="RS · RVOL · ADR%">買った日</th>
              <th className={`${th} text-left`} title="RS · RVOL · ADR%">売った日</th>
              <th className={`${th} text-left`}>判定・タグ</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map(t => {
              const open = openId === t.id
              const r = rOf(t, basis)
              const reliable = mfeReliable(t)
              const missed = missedRate(t)
              const flags = tradeFlags(t)
              const tags = t.review_tags ?? []
              const days = holdDays(t.entry_date, t.exit_date)
              return (
                <Fragment key={t.id}>
                  <tr
                    id={`trade-${t.id}`}
                    onClick={() => setOpenId(open ? null : t.id)}
                    className={`border-t-[0.5px] border-[var(--border)] cursor-pointer align-top ${open ? 'bg-[var(--bg-card-hover)]' : 'hover:bg-[var(--bg-card-hover)]'}`}
                  >
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="font-mono text-[var(--text-primary)]">{t.exit_date}</div>
                      <div className="text-small font-mono text-[var(--text-muted)]">
                        {t.entry_date.slice(5)} から {days ?? '—'} 日
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <a href={tradingViewUrl(t.ticker)} target="_blank" rel="noopener noreferrer"
                         onClick={e => e.stopPropagation()}
                         className="font-mono font-medium text-[var(--sem-focus-fg)] hover:underline">{t.ticker}</a>
                      <div className="text-small text-[var(--text-secondary)] max-w-[11rem] truncate" title={t.company_name ?? ''}>{t.company_name}</div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div>
                        <Pct v={t.pnl_pct} />
                        {t.pnl != null && <span className={`num ml-2 ${pnlColorClass(t.pnl)}`}>{formatYen(t.pnl, { sign: true })}</span>}
                      </div>
                      <div className="text-small num text-[var(--text-muted)]">
                        {yen(t.entry_price)} → {yen(t.exit_price)} × {t.shares.toLocaleString('ja-JP')}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {r != null ? <span className={`num font-medium ${pnlColorClass(r)}`}>{r > 0 ? '+' : ''}{r.toFixed(2)}</span> : <Dash />}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {reliable ? <Pct v={t.mfe_pct} /> : <Dash title="同日決済は出さない" />}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {reliable ? <Pct v={t.mae_pct} /> : <Dash title="同日決済は出さない" />}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {missed != null ? <span className="num text-[var(--text-secondary)]">{missed.toFixed(0)}%</span> : <Dash />}
                    </td>
                    <td className="px-3 py-2"><Metrics rs={t.rs_at_entry} rvol={t.rvol_at_entry} adr={t.adr_at_entry} /></td>
                    <td className="px-3 py-2"><Metrics rs={t.rs_at_exit} rvol={t.rvol_at_exit} adr={t.adr_at_exit} /></td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1 min-w-[6rem]">
                        {flags.map(f => (
                          <span key={f.id} style={toneStyle(f.tone)} title={f.title} className="px-1.5 py-0.5 rounded text-small whitespace-nowrap">{f.label}</span>
                        ))}
                        {tags.map(id => {
                          const tag = getTagById(id)
                          return tag ? (
                            <span key={id} title={tag.description}
                                  className="px-1.5 py-0.5 rounded text-small whitespace-nowrap border border-[var(--border)] text-[var(--text-secondary)]">
                              {tag.label}
                            </span>
                          ) : null
                        })}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <span className="text-small text-[var(--text-muted)]">{open ? '▲' : '▼'}</span>
                    </td>
                  </tr>
                  {open && (
                    <tr className="border-t-[0.5px] border-[var(--border)] bg-[var(--bg-primary)]">
                      <td colSpan={COLS} className="px-3 py-3">
                        <TradeReview t={t} onToggleTag={id => toggleTag(t, id)} onSave={patch => save(t, patch)} onEdit={() => onEdit(t)} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="py-8 text-center text-body text-[var(--text-muted)]">該当するトレードがありません</p>}
      </div>
      {rows.length > limit && (
        <div className="text-center mt-2">
          <button onClick={() => setLimit(l => l + PAGE)} className="text-small text-[var(--sem-focus-fg)] hover:underline">
            さらに表示（残り {rows.length - limit} 件）
          </button>
        </div>
      )}
    </div>
  )
}

/** 行を開いた中身: タグ（エントリー / イグジットのタブ）とメモ */
function TradeReview({
  t, onToggleTag, onSave, onEdit,
}: {
  t: Trade
  onToggleTag: (id: string) => void
  onSave: (patch: Partial<Trade>) => void
  onEdit: () => void
}) {
  const [tab, setTab] = useState<ReviewTagCategory>('entry')
  const [lesson, setLesson] = useState(t.lesson_learned ?? '')
  const tags = t.review_tags ?? []
  const count = (c: ReviewTagCategory) => tagsOf(c).filter(x => tags.includes(x.id)).length
  const memo = t.memo || t.entry_reason

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="min-w-0">
        <div className="flex gap-1 border-b border-[var(--border)] mb-2" role="tablist">
          {(['entry', 'exit'] as ReviewTagCategory[]).map(c => (
            <button
              key={c}
              role="tab"
              aria-selected={tab === c}
              onClick={() => setTab(c)}
              className={`px-3 py-1.5 text-body -mb-px border-b-2 ${
                tab === c
                  ? 'border-[var(--sem-focus-fg)] text-[var(--text-primary)] font-medium'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {CATEGORY_LABELS[c]}{count(c) > 0 && <span className="ml-1 num text-[var(--sem-focus-fg)]">{count(c)}</span>}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {tagsOf(tab).map(tag => {
            const on = tags.includes(tag.id)
            return (
              <button
                key={tag.id}
                type="button"
                title={tag.description}
                onClick={() => onToggleTag(tag.id)}
                aria-pressed={on}
                style={on ? toneStyle('focus') : undefined}
                className={`px-2.5 py-1 rounded-md text-body border ${on ? '' : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'}`}
              >
                {tag.label}
              </button>
            )
          })}
        </div>
        <p className="text-small text-[var(--text-muted)] mt-1.5">クリックで保存（複数選択可）</p>
      </div>

      <div className="min-w-0 space-y-2">
        {memo && (
          <p className="text-body text-[var(--text-secondary)]">
            <span className="text-small text-[var(--text-muted)] mr-2">買いメモ</span>{memo}
          </p>
        )}
        <label className="block text-small text-[var(--text-muted)]">学んだこと（入力欄を離れると保存）</label>
        <textarea
          value={lesson}
          onChange={e => setLesson(e.target.value)}
          onBlur={() => { if (lesson.trim() !== (t.lesson_learned ?? '')) onSave({ lesson_learned: lesson.trim() || null }) }}
          rows={2}
          className="w-full border border-[var(--border-strong)] rounded-lg px-2.5 py-1.5 text-body resize-none bg-[var(--bg-card)]"
        />
        <div className="text-right">
          <button onClick={onEdit} className="text-small text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline">
            記録を編集
          </button>
        </div>
      </div>
    </div>
  )
}
