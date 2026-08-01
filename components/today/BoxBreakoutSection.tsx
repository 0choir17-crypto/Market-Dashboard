'use client'

import { useMemo, useState } from 'react'
import type { BoxBreakoutRow } from '@/types/boxBreakout'
import type { WatchlistItem } from '@/types/portfolio'
import type { Trade } from '@/types/trades'
import BoxBreakoutCard from './BoxBreakoutCard'
import WatchlistModal from '@/components/watchlist/WatchlistModal'
import PositionModal from '@/components/portfolio/PositionModal'

type Props = {
  rows: BoxBreakoutRow[]
  hotSectors: string[]
  title: string
  subtitle: string
  // 複数スキャナー重複銘柄の code 集合（背景を黄色で強調）
  multiHitCodes: Set<string>
}

function isNum(v: number | null | undefined): v is number {
  return v !== null && v !== undefined && Number.isFinite(v)
}

// 大きい値ほど先頭になる降順コンパレータ（null は末尾）
function descBy(value: (r: BoxBreakoutRow) => number | null) {
  return (a: BoxBreakoutRow, b: BoxBreakoutRow) => {
    const av = value(a)
    const bv = value(b)
    if (!isNum(av) && !isNum(bv)) return 0
    if (!isNum(av)) return 1
    if (!isNum(bv)) return -1
    return bv - av
  }
}

// 仮ブレイク日（YYYY-MM-DD 文字列）の降順。新しいブレイクほど先頭。
function dateDesc(a: BoxBreakoutRow, b: BoxBreakoutRow): number {
  return (b.date ?? '').localeCompare(a.date ?? '')
}

type SortDef = { key: string; label: string; compare: (a: BoxBreakoutRow, b: BoxBreakoutRow) => number }

// PENDING のみ表示するため、既定は「上抜けが新しい順」→ 売買代金 降順。
const SORTS: SortDef[] = [
  { key: 'date', label: '上抜けが新しい順', compare: (a, b) => dateDesc(a, b) || descBy(r => r.turnover_oku)(a, b) },
  { key: 'turnover', label: '売買代金 大きい順', compare: descBy(r => r.turnover_oku) },
  { key: 'high', label: '52週高値に近い順', compare: descBy(r => r.dist_from_high_pct) },
  { key: 'rs', label: 'RS 高い順', compare: descBy(r => r.rs_topix_avg) },
  { key: 'height', label: '箱が浅い順（実効高さ）', compare: (a, b) => -descBy(r => r.eff_height_pct)(a, b) },
]

export default function BoxBreakoutSection({ rows, hotSectors, title, subtitle, multiHitCodes }: Props) {
  const [sector, setSector] = useState<string>('all')
  const [sortKey, setSortKey] = useState<string>(SORTS[0].key)

  const hotSet = useMemo(() => new Set(hotSectors), [hotSectors])

  const sectorOptions = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) if (r.sector_s33) set.add(r.sector_s33)
    return [...set].sort((a, b) => a.localeCompare(b, 'ja'))
  }, [rows])

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (sector !== 'all' && (r.sector_s33 ?? '') !== sector) return false
      return true
    })
  }, [rows, sector])

  const sorted = useMemo(() => {
    const def = SORTS.find(s => s.key === sortKey) ?? SORTS[0]
    return [...filtered].sort((a, b) => def.compare(a, b))
  }, [filtered, sortKey])

  const [watchTarget, setWatchTarget] = useState<Partial<WatchlistItem> | null>(null)
  const [positionTarget, setPositionTarget] = useState<Partial<Trade> | null>(null)

  function toWatch(r: BoxBreakoutRow): Partial<WatchlistItem> {
    return {
      ticker: r.code,
      company_name: r.co_name ?? undefined,
      sector_s33: r.sector_s33 ?? undefined,
      screen_tag: 'Box Breakout',
      rs_composite: r.rs_topix_avg ?? undefined,
      adr_pct: r.adr_pct ?? undefined,
      signal_price: r.close_break ?? undefined,
    }
  }

  function toPosition(r: BoxBreakoutRow): Partial<Trade> {
    return {
      ticker: r.code,
      company_name: r.co_name ?? undefined,
      sector_s33: r.sector_s33 ?? undefined,
      screen_name: 'Box Breakout',
      rs_at_entry: r.rs_topix_avg ?? undefined,
    }
  }

  return (
    <section className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-4">
      <div className="flex items-baseline gap-2 flex-wrap mb-1">
        <h2 className="text-lg font-bold text-[var(--text-primary)]">{title}</h2>
        <span className="text-xs text-[var(--text-muted)]">
          <span className="font-mono">{sorted.length} / {rows.length}</span> 件
        </span>
      </div>
      <p className="text-xs text-[var(--text-secondary)] mb-2">{subtitle}</p>

      {/* フィルタ / ソート */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select
          value={sector}
          onChange={e => setSector(e.target.value)}
          className="text-xs px-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-gray-700 cursor-pointer"
        >
          <option value="all">全セクター</option>
          {sectorOptions.map(s => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <span className="ml-auto flex items-center gap-1.5">
          <span className="text-[11px] text-[var(--text-muted)]">並び:</span>
          <select
            value={sortKey}
            onChange={e => setSortKey(e.target.value)}
            className="text-xs px-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-gray-700 cursor-pointer"
          >
            {SORTS.map(s => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </span>
      </div>

      {sorted.length === 0 ? (
        <div className="py-8 text-center text-sm text-[var(--text-muted)]">
          {rows.length === 0 ? '直近のベース上抜け候補は 0 件です。' : '該当する候補がありません。'}
        </div>
      ) : (
        <div
          className="grid gap-2.5"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}
        >
          {sorted.map((r, i) => (
            <BoxBreakoutCard
              key={`${r.code}-${r.date}-${i}`}
              row={r}
              hot={r.sector_s33 != null && hotSet.has(r.sector_s33)}
              multiHit={multiHitCodes.has(r.code)}
              onAddWatchlist={row => setWatchTarget(toWatch(row))}
              onAddPosition={row => setPositionTarget(toPosition(row))}
            />
          ))}
        </div>
      )}

      <WatchlistModal
        open={watchTarget !== null}
        onClose={() => setWatchTarget(null)}
        onSaved={() => setWatchTarget(null)}
        initial={watchTarget ?? undefined}
      />
      <PositionModal
        open={positionTarget !== null}
        onClose={() => setPositionTarget(null)}
        onSaved={() => setPositionTarget(null)}
        initial={positionTarget ?? undefined}
      />
    </section>
  )
}
