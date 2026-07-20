'use client'

import { useMemo, useState } from 'react'
import type { StructurePivotCardRow, StructurePivotSignal } from '@/types/structurePivotEvents'
import type { WatchlistItem } from '@/types/portfolio'
import type { Trade } from '@/types/trades'
import StructurePivotCard from './StructurePivotCard'
import WatchlistModal from '@/components/watchlist/WatchlistModal'
import PositionModal from '@/components/portfolio/PositionModal'

type Props = {
  rows: StructurePivotCardRow[]
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
function descBy(value: (r: StructurePivotCardRow) => number | null) {
  return (a: StructurePivotCardRow, b: StructurePivotCardRow) => {
    const av = value(a)
    const bv = value(b)
    if (!isNum(av) && !isNum(bv)) return 0
    if (!isNum(av)) return 1
    if (!isNum(bv)) return -1
    return bv - av
  }
}

// 小さい値ほど先頭になる昇順コンパレータ（null は末尾）
function ascBy(value: (r: StructurePivotCardRow) => number | null) {
  return (a: StructurePivotCardRow, b: StructurePivotCardRow) => {
    const av = value(a)
    const bv = value(b)
    if (!isNum(av) && !isNum(bv)) return 0
    if (!isNum(av)) return 1
    if (!isNum(bv)) return -1
    return av - bv
  }
}

type SortDef = { key: string; label: string; compare: (a: StructurePivotCardRow, b: StructurePivotCardRow) => number }

// 全件が本日ヒットなので、既定は RS 高い順。前回ヒットが近い順（1st→2nd 進行など）も用意。
const SORTS: SortDef[] = [
  { key: 'rs', label: 'RS 高い順', compare: (a, b) => descBy(r => r.rs_topix_avg)(a, b) },
  {
    key: 'prev',
    label: '前回ヒットが新しい順',
    compare: (a, b) => ascBy(r => r.prev_days_ago)(a, b) || descBy(r => r.rs_topix_avg)(a, b),
  },
  { key: 'high', label: '52週高値に近い順', compare: descBy(r => r.dist_from_high_pct) },
  { key: 'turnover', label: '売買代金 大きい順', compare: descBy(r => r.turnover_oku) },
]

// signal フィルタ（1st / 2nd / 全部）。両方を既定表示。
type SignalFilter = 'all' | StructurePivotSignal

export default function StructurePivotSection({ rows, hotSectors, title, subtitle, multiHitCodes }: Props) {
  const [sector, setSector] = useState<string>('all')
  const [signal, setSignal] = useState<SignalFilter>('all')
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
      // signal フィルタは「本日ヒットのシグナル」で判定。
      if (signal !== 'all' && r.today_signal !== signal) return false
      return true
    })
  }, [rows, sector, signal])

  const sorted = useMemo(() => {
    const def = SORTS.find(s => s.key === sortKey) ?? SORTS[0]
    return [...filtered].sort((a, b) => def.compare(a, b))
  }, [filtered, sortKey])

  const [watchTarget, setWatchTarget] = useState<Partial<WatchlistItem> | null>(null)
  const [positionTarget, setPositionTarget] = useState<Partial<Trade> | null>(null)

  function toWatch(r: StructurePivotCardRow): Partial<WatchlistItem> {
    return {
      ticker: r.code,
      company_name: r.co_name ?? undefined,
      sector_s33: r.sector_s33 ?? undefined,
      screen_tag: 'Structure Pivot',
      rs_composite: r.rs_topix_avg ?? undefined,
      adr_pct: r.adr_pct ?? undefined,
      // 建玉ライン（1st Pivot）をエントリー基準としてプリセット。無ければヒット日終値。
      signal_price: r.first_pivot ?? r.close ?? undefined,
    }
  }

  function toPosition(r: StructurePivotCardRow): Partial<Trade> {
    return {
      ticker: r.code,
      company_name: r.co_name ?? undefined,
      sector_s33: r.sector_s33 ?? undefined,
      screen_name: 'Structure Pivot',
      rs_at_entry: r.rs_topix_avg ?? undefined,
      signal_price: r.first_pivot ?? r.close ?? undefined,
    }
  }

  return (
    <section className="bg-white rounded-xl border border-[#e8eaed] shadow-sm p-4">
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
          className="text-xs px-2 py-1.5 rounded-lg border border-[var(--border)] bg-white text-gray-700 cursor-pointer"
        >
          <option value="all">全セクター</option>
          {sectorOptions.map(s => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          value={signal}
          onChange={e => setSignal(e.target.value as SignalFilter)}
          className="text-xs px-2 py-1.5 rounded-lg border border-[var(--border)] bg-white text-gray-700 cursor-pointer"
        >
          <option value="all">1st + 2nd</option>
          <option value="1st">1st のみ（建玉ライン）</option>
          <option value="2nd">2nd のみ（ブレイク進行）</option>
        </select>

        <span className="ml-auto flex items-center gap-1.5">
          <span className="text-[11px] text-[var(--text-muted)]">並び:</span>
          <select
            value={sortKey}
            onChange={e => setSortKey(e.target.value)}
            className="text-xs px-2 py-1.5 rounded-lg border border-[var(--border)] bg-white text-gray-700 cursor-pointer"
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
          {rows.length === 0
            ? '本日の Structure Pivot ヒットは 0 件です。'
            : '該当する銘柄がありません。'}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-2.5">
          {sorted.map((r, i) => (
            <StructurePivotCard
              key={`${r.code}-${i}`}
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
