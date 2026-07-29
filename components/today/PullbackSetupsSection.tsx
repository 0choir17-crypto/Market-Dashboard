'use client'

import { useMemo, useState } from 'react'
import type { CoilPullbackRow, MaPullbackRow } from '@/types/pullbackSetups'
import { maGrade } from '@/types/pullbackSetups'
import type { WatchlistItem } from '@/types/portfolio'
import type { Trade } from '@/types/trades'
import PullbackSetupCard from './PullbackSetupCard'
import WatchlistModal from '@/components/watchlist/WatchlistModal'
import PositionModal from '@/components/portfolio/PositionModal'

type CommonProps = {
  title: string
  subtitle: string
  hotSectors: string[]
  // 複数スキャナー重複銘柄の code 集合（背景を黄色で強調）
  multiHitCodes: Set<string>
}

type Props =
  | ({ kind: 'coil'; rows: CoilPullbackRow[] } & CommonProps)
  | ({ kind: 'ma'; rows: MaPullbackRow[] } & CommonProps)

type AnyRow = CoilPullbackRow | MaPullbackRow

function isNum(v: number | null | undefined): v is number {
  return v !== null && v !== undefined && Number.isFinite(v)
}

// kind 別のソート定義（key, ラベル, セレクタ, 並び向き）
type SortDef = { key: string; label: string; value: (r: AnyRow) => number | null; dir: 'asc' | 'desc' }

// 既定は「52週高値に近い順」（全スキャナー共通）。
const COIL_SORTS: SortDef[] = [
  { key: 'high', label: '52週高値に近い順', value: r => r.dist_from_high_pct, dir: 'desc' },
  { key: 'tight', label: '収縮（タイト順）', value: r => (r as CoilPullbackRow).iqr5, dir: 'asc' },
  { key: 'rs', label: 'RS 高い順', value: r => (r as CoilPullbackRow).rs_topix_avg, dir: 'desc' },
]

const MA_SORTS: SortDef[] = [
  { key: 'high', label: '52週高値に近い順', value: r => r.dist_from_high_pct, dir: 'desc' },
  { key: 'grade', label: 'グレード（良い順）', value: r => maGrade(r as MaPullbackRow).score, dir: 'desc' },
  { key: 'rs', label: 'RS 高い順', value: r => (r as MaPullbackRow).rs, dir: 'desc' },
]

export default function PullbackSetupsSection(props: Props) {
  const { kind, rows, title, subtitle, hotSectors, multiHitCodes } = props
  const sorts = kind === 'coil' ? COIL_SORTS : MA_SORTS

  const [sector, setSector] = useState<string>('all')
  const [sortKey, setSortKey] = useState<string>(sorts[0].key)

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
    const def = sorts.find(s => s.key === sortKey) ?? sorts[0]
    const dir = def.dir === 'asc' ? 1 : -1
    const arr = [...filtered]
    arr.sort((a, b) => {
      const av = def.value(a)
      const bv = def.value(b)
      if (!isNum(av) && !isNum(bv)) return 0
      if (!isNum(av)) return 1
      if (!isNum(bv)) return -1
      if (av === bv) return 0
      return (av - bv) * dir
    })
    return arr
  }, [filtered, sortKey, sorts])

  const [watchTarget, setWatchTarget] = useState<Partial<WatchlistItem> | null>(null)
  const [positionTarget, setPositionTarget] = useState<Partial<Trade> | null>(null)

  function toWatch(r: AnyRow): Partial<WatchlistItem> {
    const rs = kind === 'coil' ? (r as CoilPullbackRow).rs_topix_avg : (r as MaPullbackRow).rs
    const rvol = kind === 'coil' ? (r as CoilPullbackRow).vol_ratio : (r as MaPullbackRow).volume_ratio
    return {
      ticker: r.code,
      company_name: r.co_name ?? undefined,
      sector_s33: r.sector_s33 ?? undefined,
      screen_tag: kind === 'coil' ? 'Coil Pullback' : 'MA Pullback',
      rs_composite: rs ?? undefined,
      rvol: rvol ?? undefined,
      adr_pct: r.adr_pct ?? undefined,
      signal_price: r.close ?? undefined,
    }
  }

  function toPosition(r: AnyRow): Partial<Trade> {
    const rs = kind === 'coil' ? (r as CoilPullbackRow).rs_topix_avg : (r as MaPullbackRow).rs
    return {
      ticker: r.code,
      company_name: r.co_name ?? undefined,
      sector_s33: r.sector_s33 ?? undefined,
      screen_name: kind === 'coil' ? 'Coil Pullback' : 'MA Pullback',
      rs_at_entry: rs ?? undefined,
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
      <p className="text-xs text-[var(--text-secondary)] mb-3">{subtitle}</p>

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
            {sorts.map(s => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </span>
      </div>

      {sorted.length === 0 ? (
        <div className="py-8 text-center text-sm text-[var(--text-muted)]">
          {rows.length === 0 ? '本日の候補は 0 件です。' : '該当する候補がありません。'}
        </div>
      ) : (
        <div
          className="grid gap-2.5"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}
        >
          {kind === 'coil'
            ? (sorted as CoilPullbackRow[]).map((r, i) => (
                <PullbackSetupCard
                  key={`${r.code}-${i}`}
                  kind="coil"
                  row={r}
                  hot={r.sector_s33 != null && hotSet.has(r.sector_s33)}
                  multiHit={multiHitCodes.has(r.code)}
                  onAddWatchlist={row => setWatchTarget(toWatch(row))}
                  onAddPosition={row => setPositionTarget(toPosition(row))}
                />
              ))
            : (sorted as MaPullbackRow[]).map((r, i) => (
                <PullbackSetupCard
                  key={`${r.code}-${i}`}
                  kind="ma"
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
