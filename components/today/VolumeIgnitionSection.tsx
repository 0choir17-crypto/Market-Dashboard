'use client'

import { useMemo, useState } from 'react'
import type { VolumeIgnitionRow } from '@/types/volumeIgnition'
import type { WatchlistItem } from '@/types/portfolio'
import type { Trade } from '@/types/trades'
import VolumeIgnitionCard from './VolumeIgnitionCard'
import WatchlistModal from '@/components/watchlist/WatchlistModal'
import PositionModal from '@/components/portfolio/PositionModal'

type Props = {
  rows: VolumeIgnitionRow[]
  hotSectors: string[]
  title: string
  subtitle: string
}

function isNum(v: number | null | undefined): v is number {
  return v !== null && v !== undefined && Number.isFinite(v)
}

// 大きい値ほど先頭になる降順コンパレータ（null は末尾）
function descBy(value: (r: VolumeIgnitionRow) => number | null) {
  return (a: VolumeIgnitionRow, b: VolumeIgnitionRow) => {
    const av = value(a)
    const bv = value(b)
    if (!isNum(av) && !isNum(bv)) return 0
    if (!isNum(av)) return 1
    if (!isNum(bv)) return -1
    return bv - av
  }
}

type SortDef = { key: string; label: string; compare: (a: VolumeIgnitionRow, b: VolumeIgnitionRow) => number }

// 既定は「52週高値に近い順」（全スキャナー共通）。
const SORTS: SortDef[] = [
  { key: 'high', label: '52週高値に近い順', compare: descBy(r => r.dist_from_high_pct) },
  { key: 'vol', label: '出来高比 大きい順', compare: descBy(r => r.vol_ratio) },
  { key: 'rs', label: 'RS 高い順', compare: descBy(r => r.rs_topix_avg) },
]

export default function VolumeIgnitionSection({ rows, hotSectors, title, subtitle }: Props) {
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
    return [...filtered].sort(def.compare)
  }, [filtered, sortKey])

  const [watchTarget, setWatchTarget] = useState<Partial<WatchlistItem> | null>(null)
  const [positionTarget, setPositionTarget] = useState<Partial<Trade> | null>(null)

  function toWatch(r: VolumeIgnitionRow): Partial<WatchlistItem> {
    return {
      ticker: r.code,
      company_name: r.co_name ?? undefined,
      sector_s33: r.sector_s33 ?? undefined,
      screen_tag: 'Volume Ignition',
      rs_composite: r.rs_topix_avg ?? undefined,
      rvol: r.vol_ratio ?? undefined,
      adr_pct: r.adr_pct ?? undefined,
      signal_price: r.close ?? undefined,
    }
  }

  function toPosition(r: VolumeIgnitionRow): Partial<Trade> {
    return {
      ticker: r.code,
      company_name: r.co_name ?? undefined,
      sector_s33: r.sector_s33 ?? undefined,
      screen_name: 'Volume Ignition',
      rs_at_entry: r.rs_topix_avg ?? undefined,
    }
  }

  return (
    <section className="bg-white rounded-xl border border-[#e8eaed] shadow-sm p-4">
      <div className="flex items-baseline gap-2 flex-wrap mb-1">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
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
          {rows.length === 0 ? '本日の点火銘柄は 0 件です。' : '該当する銘柄がありません。'}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-2.5">
          {sorted.map((r, i) => (
            <VolumeIgnitionCard
              key={`${r.code}-${i}`}
              row={r}
              hot={r.sector_s33 != null && hotSet.has(r.sector_s33)}
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
