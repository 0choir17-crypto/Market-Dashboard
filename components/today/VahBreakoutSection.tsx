'use client'

import { useMemo, useState } from 'react'
import type { VahBreakoutRow } from '@/types/vahBreakouts'
import type { Trade } from '@/types/trades'
import VahBreakoutCard from './VahBreakoutCard'
import PositionModal from '@/components/portfolio/PositionModal'

type Props = {
  rows: VahBreakoutRow[]
  title: string
  subtitle: string
  // vah_breakouts の DDL が未実行（テーブル未配備）。「0 件の日」と区別して案内する。
  tableMissing?: boolean
  // 複数スキャナー重複銘柄の code 集合（背景を黄色で強調）
  multiHitCodes: Set<string>
}

function isNum(v: number | null | undefined): v is number {
  return v !== null && v !== undefined && Number.isFinite(v)
}

// 大きい値ほど先頭になる降順コンパレータ（null は末尾）
function descBy(value: (r: VahBreakoutRow) => number | null) {
  return (a: VahBreakoutRow, b: VahBreakoutRow) => {
    const av = value(a)
    const bv = value(b)
    if (!isNum(av) && !isNum(bv)) return 0
    if (!isNum(av)) return 1
    if (!isNum(bv)) return -1
    return bv - av
  }
}

type SortDef = { key: string; label: string; compare: (a: VahBreakoutRow, b: VahBreakoutRow) => number }

// 並べ替えは「中立な事実」に限る。既定は売買代金の降順（他セクションと同じ）。
const SORTS: SortDef[] = [
  { key: 'turnover', label: '売買代金 大きい順', compare: descBy(r => r.turnover_oku) },
  { key: 'breakout', label: '上抜け% 大きい順', compare: descBy(r => r.breakout_pct) },
  { key: 'high', label: '52週高値に近い順', compare: descBy(r => r.dist_from_high_pct) },
  { key: 'adr', label: 'ADR% 大きい順', compare: descBy(r => r.adr_pct) },
  { key: 'code', label: 'コード順', compare: (a, b) => a.code.localeCompare(b.code) },
]

export default function VahBreakoutSection({
  rows,
  title,
  subtitle,
  tableMissing = false,
  multiHitCodes,
}: Props) {
  const [sector, setSector] = useState<string>('all')
  const [sortKey, setSortKey] = useState<string>(SORTS[0].key)

  const sectorOptions = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) if (r.sector_s33) set.add(r.sector_s33)
    return [...set].sort((a, b) => a.localeCompare(b, 'ja'))
  }, [rows])

  const sorted = useMemo(() => {
    const filtered = rows.filter(r => sector === 'all' || (r.sector_s33 ?? '') === sector)
    const def = SORTS.find(s => s.key === sortKey) ?? SORTS[0]
    return [...filtered].sort((a, b) => def.compare(a, b))
  }, [rows, sector, sortKey])

  const firstCount = useMemo(() => sorted.filter(r => r.cross_n === 1).length, [sorted])

  const [positionTarget, setPositionTarget] = useState<Partial<Trade> | null>(null)

  function toPosition(r: VahBreakoutRow): Partial<Trade> {
    return {
      ticker: r.code,
      company_name: r.co_name ?? undefined,
      sector_s33: r.sector_s33 ?? undefined,
      screen_name: 'VAH Breakout',
      signal_price: r.close ?? undefined,
    }
  }

  const selectClass =
    'text-caption px-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] cursor-pointer'

  return (
    <section className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-4">
      <div className="flex items-baseline gap-2 flex-wrap mb-1">
        <h2 className="text-title font-medium text-[var(--text-primary)]">{title}</h2>
        <span className="text-caption text-[var(--text-muted)]">
          <span className="font-mono">{sorted.length} / {rows.length}</span> 銘柄
          <span className="ml-1.5 font-mono" title="この期間で初めて VAH を上抜けた銘柄の数">
            （初回 {firstCount}）
          </span>
        </span>
      </div>
      <p className="text-caption text-[var(--text-secondary)] mb-3">{subtitle}</p>

      {/* フィルタ / ソート */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select value={sector} onChange={e => setSector(e.target.value)} className={selectClass}>
          <option value="all">全セクター</option>
          {sectorOptions.map(s => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <span className="ml-auto flex items-center gap-1.5">
          <span className="text-caption text-[var(--text-muted)]">並び:</span>
          <select value={sortKey} onChange={e => setSortKey(e.target.value)} className={selectClass}>
            {SORTS.map(s => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </span>
      </div>

      {tableMissing ? (
        <div className="py-8 text-center text-small text-[var(--text-muted)]">
          <p className="font-medium text-[var(--text-secondary)]">
            <code className="font-mono">vah_breakouts</code> テーブルがまだ Supabase にありません。
          </p>
          <p className="mt-1 text-caption">配信側（jquants-scanner）の DDL 実行待ちです。エラーではありません。</p>
        </div>
      ) : sorted.length === 0 ? (
        <div className="py-8 text-center text-small text-[var(--text-muted)]">
          {rows.length === 0 ? '本日は該当なし。' : '絞り込み条件に一致する銘柄がありません。'}
        </div>
      ) : (
        <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
          {sorted.map(r => (
            <VahBreakoutCard
              key={r.code}
              row={r}
              multiHit={multiHitCodes.has(r.code)}
              onAddPosition={row => setPositionTarget(toPosition(row))}
            />
          ))}
        </div>
      )}

      <PositionModal
        open={positionTarget !== null}
        onClose={() => setPositionTarget(null)}
        onSaved={() => setPositionTarget(null)}
        initial={positionTarget ?? undefined}
      />
    </section>
  )
}
