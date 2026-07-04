'use client'

import { useMemo, useState } from 'react'
import type { VolumeIgnitionRow } from '@/types/volumeIgnition'
import { isFreshIgnition } from '@/types/volumeIgnition'
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

const SORTS: SortDef[] = [
  {
    // 初期ソート: days_since_entry 昇順 → 同値は vol_ratio 降順（新しい点火・大商い順）
    key: 'fresh',
    label: '鮮度（点火が新しい順）',
    compare: (a, b) => {
      const ad = isNum(a.days_since_entry) ? a.days_since_entry : Number.POSITIVE_INFINITY
      const bd = isNum(b.days_since_entry) ? b.days_since_entry : Number.POSITIVE_INFINITY
      if (ad !== bd) return ad - bd
      return descBy(r => r.vol_ratio)(a, b)
    },
  },
  { key: 'vol', label: '出来高比 大きい順', compare: descBy(r => r.vol_ratio) },
  { key: 'ret', label: '点火来 騰落率 高い順', compare: descBy(r => r.ret_since_entry_pct) },
  { key: 'rs', label: 'RS 高い順', compare: descBy(r => r.rs_topix_avg) },
  { key: 'turnover', label: '売買代金 多い順', compare: descBy(r => r.turnover_oku) },
]

export default function VolumeIgnitionSection({ rows, hotSectors, title, subtitle }: Props) {
  const [scale, setScale] = useState<string>('all')
  const [sector, setSector] = useState<string>('all')
  const [freshOnly, setFreshOnly] = useState(false)
  const [sortKey, setSortKey] = useState<string>(SORTS[0].key)

  const hotSet = useMemo(() => new Set(hotSectors), [hotSectors])

  const scaleOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of rows) {
      const k = r.scale_cat ?? '—'
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count }))
  }, [rows])

  const sectorOptions = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) if (r.sector_s33) set.add(r.sector_s33)
    return [...set].sort((a, b) => a.localeCompare(b, 'ja'))
  }, [rows])

  const freshCount = useMemo(() => rows.filter(isFreshIgnition).length, [rows])

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (scale !== 'all' && (r.scale_cat ?? '—') !== scale) return false
      if (sector !== 'all' && (r.sector_s33 ?? '') !== sector) return false
      if (freshOnly && !isFreshIgnition(r)) return false
      return true
    })
  }, [rows, scale, sector, freshOnly])

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
          {freshCount > 0 && <span className="ml-1 text-amber-600">（🔥当日 <span className="font-mono">{freshCount}</span>）</span>}
        </span>
      </div>
      <p className="text-xs text-[var(--text-secondary)] mb-2">{subtitle}</p>

      {/* 管理ルール注記（瞬発トレード用ウォッチ） */}
      <div className="mb-3 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[11px] leading-relaxed flex items-start gap-2">
        <span aria-hidden>⚡</span>
        <span>
          <strong>瞬発トレード用ウォッチ（push型シグナルではありません）。</strong>
          即利確（到達中央 ~10日）／ <strong>−15% ストップ</strong>／ 持ち切り厳禁（63日中央 −8%）。
          <span className="text-rose-900 font-semibold">⚠ ADR&gt;12（adr_extreme）は大負け多発帯＝減サイズ。</span>
        </span>
      </div>

      {/* フィルタ / ソート */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <FilterChip label="All" count={rows.length} active={scale === 'all'} onClick={() => setScale('all')} />
        {scaleOptions.map(opt => (
          <FilterChip
            key={opt.key}
            label={opt.key}
            count={opt.count}
            active={scale === opt.key}
            onClick={() => setScale(opt.key)}
          />
        ))}

        <span className="mx-1 h-4 w-px bg-gray-200" />

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

        <button
          onClick={() => setFreshOnly(v => !v)}
          className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
            freshOnly
              ? 'bg-amber-400 text-white border-amber-400'
              : 'bg-white text-amber-700 border-amber-200 hover:bg-amber-50'
          }`}
        >
          🔥 当日点火のみ
        </button>

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
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
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

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
        active
          ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
          : 'bg-white text-gray-700 border-[var(--border)] hover:bg-gray-50'
      }`}
    >
      <span className="uppercase tracking-wide">{label}</span>
      <span className={`ml-1.5 text-[10px] ${active ? 'opacity-90' : 'text-gray-400'}`}>{count}</span>
    </button>
  )
}
