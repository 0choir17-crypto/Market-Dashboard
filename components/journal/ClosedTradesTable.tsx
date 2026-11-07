'use client'

// 決済済みトレードの一覧表。
//
// 旧カード表示は「レビュー」を開かないと MFE / MAE などが見えず、レビューも
// 1 件ずつ保存ボタンを押す必要があった。ここでは
//   - 振り返りに使う数字（R・MFE・MAE・取り逃し・自動判定）を列に出す
//   - 行クリックで詳細とタグを開く。タグはクリックした時点で保存、
//     メモは入力欄から離れた時点で自動保存（保存ボタンなし）
// とする。

import { Fragment, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Trade } from '@/types/trades'
import { effectiveResult } from '@/lib/tradeResult'
import { formatPct, formatYen, pnlColorClass } from '@/lib/format'
import { REVIEW_TAGS, getTagById } from '@/lib/reviewTags'
import { R_UNIT, rOf, RBasis } from '@/lib/rStats'
import { missedRate, tradeFlags } from '@/lib/tradeFlags'
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

function holdDays(a: string | null, b: string | null): number | null {
  if (!a || !b) return null
  const ms = new Date(b).getTime() - new Date(a).getTime()
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 86400000)) : null
}

function Dash() {
  return <span className="text-[var(--text-muted)]">—</span>
}

function Pct({ v, signColor = true }: { v: number | null | undefined; signColor?: boolean }) {
  if (v == null) return <Dash />
  return <span className={`num ${signColor ? pnlColorClass(v) : ''}`}>{formatPct(v, { digits: 1, sign: true })}</span>
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
  const selectClass = 'text-caption px-2 py-1 rounded-md border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)]'

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <h3 className="text-small font-medium text-[var(--text-primary)] mr-auto">
          決済済み <span className="num text-[var(--text-muted)]">{rows.length}</span>
        </h3>
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
      {saveError && <p className="text-caption text-[var(--negative)] mb-2">{saveError}</p>}

      <div className="bg-[var(--bg-card)] rounded-xl border-[0.5px] border-[var(--border)] overflow-x-auto">
        <table className="w-full text-small">
          <thead className="border-b-[0.5px] border-[var(--border)] text-caption text-[var(--text-muted)]">
            <tr>
              <th className="text-left font-medium px-2.5 py-2">決済日</th>
              <th className="text-left font-medium px-2.5 py-2">銘柄</th>
              <th className="text-right font-medium px-2.5 py-2">日数</th>
              <th className="text-right font-medium px-2.5 py-2">損益</th>
              <th className="text-right font-medium px-2.5 py-2 hidden sm:table-cell">損益 ¥</th>
              <th className="text-right font-medium px-2.5 py-2" title={basis === 'atr' ? '決済 − 建値 を買う前日の ATR14 で割った値' : '損切り基準の R'}>{u}</th>
              <th className="text-right font-medium px-2.5 py-2 hidden md:table-cell" title="保有中の最大含み益（MFE）">最大益</th>
              <th className="text-right font-medium px-2.5 py-2 hidden md:table-cell" title="保有中の最大含み損（MAE）">最大損</th>
              <th className="text-right font-medium px-2.5 py-2 hidden md:table-cell" title="勝ちトレードのみ: (最大益 − 実際の損益) ÷ 最大益">取り逃し</th>
              <th className="text-left font-medium px-2.5 py-2">判定・タグ</th>
              <th className="px-2.5 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map(t => {
              const open = openId === t.id
              const r = rOf(t, basis)
              const missed = missedRate(t)
              const flags = tradeFlags(t)
              const tags = t.review_tags ?? []
              return (
                <Fragment key={t.id}>
                  <tr
                    id={`trade-${t.id}`}
                    onClick={() => setOpenId(open ? null : t.id)}
                    className={`border-t-[0.5px] border-[var(--border)] cursor-pointer ${open ? 'bg-[var(--bg-card-hover)]' : 'hover:bg-[var(--bg-card-hover)]'}`}
                  >
                    <td className="px-2.5 py-1.5 whitespace-nowrap font-mono text-caption text-[var(--text-secondary)]">{t.exit_date}</td>
                    <td className="px-2.5 py-1.5 whitespace-nowrap">
                      <a href={tradingViewUrl(t.ticker)} target="_blank" rel="noopener noreferrer"
                         onClick={e => e.stopPropagation()}
                         className="font-mono font-medium text-[var(--sem-focus-fg)] hover:underline">{t.ticker}</a>
                      <span className="ml-1.5 text-caption text-[var(--text-secondary)] hidden lg:inline">{t.company_name}</span>
                    </td>
                    <td className="px-2.5 py-1.5 text-right num text-[var(--text-secondary)]">{holdDays(t.entry_date, t.exit_date) ?? '—'}</td>
                    <td className="px-2.5 py-1.5 text-right whitespace-nowrap"><Pct v={t.pnl_pct} /></td>
                    <td className="px-2.5 py-1.5 text-right whitespace-nowrap hidden sm:table-cell">
                      {t.pnl != null ? <span className={`num ${pnlColorClass(t.pnl)}`}>{formatYen(t.pnl, { sign: true })}</span> : <Dash />}
                    </td>
                    <td className="px-2.5 py-1.5 text-right whitespace-nowrap">
                      {r != null ? <span className={`num font-medium ${pnlColorClass(r)}`}>{r > 0 ? '+' : ''}{r.toFixed(2)}</span> : <Dash />}
                    </td>
                    <td className="px-2.5 py-1.5 text-right whitespace-nowrap hidden md:table-cell"><Pct v={t.mfe_pct} /></td>
                    <td className="px-2.5 py-1.5 text-right whitespace-nowrap hidden md:table-cell"><Pct v={t.mae_pct} /></td>
                    <td className="px-2.5 py-1.5 text-right whitespace-nowrap hidden md:table-cell">
                      {missed != null ? <span className="num text-[var(--text-secondary)]">{missed.toFixed(0)}%</span> : <Dash />}
                    </td>
                    <td className="px-2.5 py-1.5">
                      <div className="flex flex-wrap gap-1">
                        {flags.map(f => (
                          <span key={f.id} style={toneStyle(f.tone)} title={f.title} className="px-1.5 py-0.5 rounded text-caption whitespace-nowrap">{f.label}</span>
                        ))}
                        {tags.map(id => {
                          const tag = getTagById(id)
                          return tag ? (
                            <span key={id} title={tag.description}
                                  className="px-1.5 py-0.5 rounded text-caption whitespace-nowrap border border-[var(--border)] text-[var(--text-secondary)]">
                              {tag.label}
                            </span>
                          ) : null
                        })}
                      </div>
                    </td>
                    <td className="px-2.5 py-1.5 text-right whitespace-nowrap">
                      <span className="text-caption text-[var(--text-muted)]">{open ? '▲' : '▼'}</span>
                    </td>
                  </tr>
                  {open && (
                    <tr className="border-t-[0.5px] border-[var(--border)] bg-[var(--bg-primary)]">
                      <td colSpan={11} className="px-3 py-3">
                        <TradeDetail t={t} onToggleTag={id => toggleTag(t, id)} onSave={patch => save(t, patch)} onEdit={() => onEdit(t)} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="py-8 text-center text-small text-[var(--text-muted)]">該当するトレードがありません</p>}
      </div>
      {rows.length > limit && (
        <div className="text-center mt-2">
          <button onClick={() => setLimit(l => l + PAGE)} className="text-caption text-[var(--sem-focus-fg)] hover:underline">
            さらに表示（残り {rows.length - limit} 件）
          </button>
        </div>
      )}
    </div>
  )
}

function TradeDetail({
  t, onToggleTag, onSave, onEdit,
}: {
  t: Trade
  onToggleTag: (id: string) => void
  onSave: (patch: Partial<Trade>) => void
  onEdit: () => void
}) {
  const [lesson, setLesson] = useState(t.lesson_learned ?? '')
  const tags = t.review_tags ?? []
  const facts: [string, string | null][] = [
    ['建値 → 決済', `¥${t.entry_price.toLocaleString()} → ¥${t.exit_price?.toLocaleString() ?? '—'}（${t.shares.toLocaleString()} 株）`],
    ['期間', `${t.entry_date} → ${t.exit_date ?? '—'}`],
    ['種別', [t.entry_type, t.screen_name].filter(Boolean).join(' / ') || null],
    ['決済理由', t.exit_reason],
    ['買った日', [
      t.rs_at_entry != null ? `RS ${t.rs_at_entry.toFixed(1)}` : null,
      t.rvol_at_entry != null ? `RVOL ${t.rvol_at_entry.toFixed(2)}` : null,
      t.adr_at_entry != null ? `ADR ${t.adr_at_entry.toFixed(1)}%` : null,
      t.atr_at_entry != null ? `ATR ${t.atr_at_entry.toFixed(1)}` : null,
      t.mc_condition_at_entry ? `MC ${t.mc_condition_at_entry}${t.mc_met_at_entry ? ' ✓' : ''}` : null,
    ].filter(Boolean).join(' · ') || null],
    ['買いメモ', t.memo || t.entry_reason || null],
  ]
  return (
    <div className="grid gap-4 lg:grid-cols-2 text-small">
      <div className="min-w-0">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {facts.filter(([, v]) => v).map(([k, v]) => (
            <Fragment key={k}>
              <dt className="text-caption text-[var(--text-muted)]">{k}</dt>
              <dd className="text-caption text-[var(--text-primary)] num">{v}</dd>
            </Fragment>
          ))}
        </dl>
      </div>
      <div className="space-y-3 min-w-0">

        <div>
          <p className="text-caption text-[var(--text-muted)] mb-1">タグ（クリックで保存）</p>
          <div className="flex flex-wrap gap-1">
            {REVIEW_TAGS.map(tag => {
              const on = tags.includes(tag.id)
              return (
                <button
                  key={tag.id}
                  type="button"
                  title={tag.description}
                  onClick={() => onToggleTag(tag.id)}
                  aria-pressed={on}
                  style={on ? toneStyle('focus') : undefined}
                  className={`px-2 py-0.5 rounded text-caption border ${on ? '' : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'}`}
                >
                  {tag.label}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label className="block text-caption text-[var(--text-muted)] mb-1">学んだこと（入力欄を離れると保存）</label>
          <textarea
            value={lesson}
            onChange={e => setLesson(e.target.value)}
            onBlur={() => { if (lesson.trim() !== (t.lesson_learned ?? '')) onSave({ lesson_learned: lesson.trim() || null }) }}
            rows={2}
            className="w-full border border-[var(--border-strong)] rounded-lg px-2.5 py-1.5 text-small resize-none bg-[var(--bg-card)]"
          />
        </div>

        <div className="text-right">
          <button onClick={onEdit} className="text-caption text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline">
            記録を編集
          </button>
        </div>
      </div>
    </div>
  )
}
