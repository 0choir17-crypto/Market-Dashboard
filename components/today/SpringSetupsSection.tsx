'use client'

import { useMemo, useState } from 'react'
import type { SpringSetupRow, SpringType } from '@/types/springSetups'
import { SPRING_TYPE_META } from '@/types/springSetups'
import type { WatchlistItem } from '@/types/portfolio'
import type { Trade } from '@/types/trades'
import SpringSetupCard from './SpringSetupCard'
import WatchlistModal from '@/components/watchlist/WatchlistModal'
import PositionModal from '@/components/portfolio/PositionModal'

type Props = {
  rows: SpringSetupRow[]
  hotSectors: string[]
  title: string
  subtitle: string
}

function isNum(v: number | null | undefined): v is number {
  return v !== null && v !== undefined && Number.isFinite(v)
}

// 大きい値ほど先頭になる降順コンパレータ（null は末尾）
function descBy(value: (r: SpringSetupRow) => number | null) {
  return (a: SpringSetupRow, b: SpringSetupRow) => {
    const av = value(a)
    const bv = value(b)
    if (!isNum(av) && !isNum(bv)) return 0
    if (!isNum(av)) return 1
    if (!isNum(bv)) return -1
    return bv - av
  }
}

// 小さい値ほど先頭になる昇順コンパレータ（null は末尾）
function ascBy(value: (r: SpringSetupRow) => number | null) {
  return (a: SpringSetupRow, b: SpringSetupRow) => {
    const av = value(a)
    const bv = value(b)
    if (!isNum(av) && !isNum(bv)) return 0
    if (!isNum(av)) return 1
    if (!isNum(bv)) return -1
    return av - bv
  }
}

type SortDef = { key: string; label: string; compare: (a: SpringSetupRow, b: SpringSetupRow) => number }

// type の優先度（both を先頭に）。同 type 内は defended_pct 昇順（ライン際で死守=堅い）。
const TYPE_ORDER: Record<SpringType, number> = { both: 0, ignition_open: 1, swing_low: 2 }

const SORTS: SortDef[] = [
  {
    key: 'type',
    label: 'シグナル種別（両方→①→③）',
    compare: (a, b) => {
      const at = TYPE_ORDER[a.type] ?? 9
      const bt = TYPE_ORDER[b.type] ?? 9
      if (at !== bt) return at - bt
      return ascBy(r => r.defended_pct)(a, b)
    },
  },
  { key: 'defended', label: '防衛ライン際 死守順（近い順）', compare: ascBy(r => r.defended_pct) },
  { key: 'high', label: '52週高値に近い順', compare: descBy(r => r.dist_from_high_pct) },
  { key: 'm126', label: '126日モメンタム 高い順', compare: descBy(r => r.m126) },
  { key: 'adr', label: 'ADR 高い順', compare: descBy(r => r.adr_pct) },
]

export default function SpringSetupsSection({ rows, hotSectors, title, subtitle }: Props) {
  const [type, setType] = useState<'all' | SpringType>('all')
  const [sector, setSector] = useState<string>('all')
  const [freshOnly, setFreshOnly] = useState(false)
  const [sortKey, setSortKey] = useState<string>(SORTS[0].key)

  const hotSet = useMemo(() => new Set(hotSectors), [hotSectors])

  const typeOptions = useMemo(() => {
    const counts = new Map<SpringType, number>()
    for (const r of rows) counts.set(r.type, (counts.get(r.type) ?? 0) + 1)
    return (['both', 'ignition_open', 'swing_low'] as SpringType[])
      .filter(t => counts.has(t))
      .map(t => ({ key: t, count: counts.get(t) ?? 0 }))
  }, [rows])

  const sectorOptions = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) if (r.sector_s33) set.add(r.sector_s33)
    return [...set].sort((a, b) => a.localeCompare(b, 'ja'))
  }, [rows])

  const freshCount = useMemo(() => rows.filter(r => r.fresh === true).length, [rows])

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (type !== 'all' && r.type !== type) return false
      if (sector !== 'all' && (r.sector_s33 ?? '') !== sector) return false
      if (freshOnly && r.fresh !== true) return false
      return true
    })
  }, [rows, type, sector, freshOnly])

  const sorted = useMemo(() => {
    const def = SORTS.find(s => s.key === sortKey) ?? SORTS[0]
    const arr = [...filtered]
    arr.sort((a, b) => {
      // fresh を常に優先（強調）
      const af = a.fresh === true ? 0 : 1
      const bf = b.fresh === true ? 0 : 1
      if (af !== bf) return af - bf
      return def.compare(a, b)
    })
    return arr
  }, [filtered, sortKey])

  const [watchTarget, setWatchTarget] = useState<Partial<WatchlistItem> | null>(null)
  const [positionTarget, setPositionTarget] = useState<Partial<Trade> | null>(null)

  function toWatch(r: SpringSetupRow): Partial<WatchlistItem> {
    return {
      ticker: r.code,
      company_name: r.co_name ?? undefined,
      sector_s33: r.sector_s33 ?? undefined,
      screen_tag: 'Spring Setup',
      adr_pct: r.adr_pct ?? undefined,
      signal_price: r.close ?? undefined,
    }
  }

  function toPosition(r: SpringSetupRow): Partial<Trade> {
    return {
      ticker: r.code,
      company_name: r.co_name ?? undefined,
      sector_s33: r.sector_s33 ?? undefined,
      screen_name: 'Spring Setup',
    }
  }

  return (
    <section className="bg-white rounded-xl border border-[#e8eaed] shadow-sm p-4">
      <div className="flex items-baseline gap-2 flex-wrap mb-1">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
        <span className="text-xs text-[var(--text-muted)]">
          <span className="font-mono">{sorted.length} / {rows.length}</span> 件
          {freshCount > 0 && <span className="ml-1 text-amber-600">（★新規点灯 <span className="font-mono">{freshCount}</span>）</span>}
        </span>
      </div>
      <p className="text-xs text-[var(--text-secondary)] mb-2">{subtitle}</p>

      {/* 管理ルール注記（ウォッチリスト） */}
      <div className="mb-3 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] leading-relaxed flex items-start gap-2">
        <span aria-hidden>🪤</span>
        <span>
          <strong>押し目・踏ん張りタイミングのウォッチリスト（買い持ちシグナルではありません）。</strong>
          モメンタムリーダーが下側の基準線を防衛して踏ん張った局面。
          <strong>執行はストップ=ライン割れ＋段階利確が前提。</strong>
        </span>
      </div>

      {/* フィルタ / ソート */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <FilterChip label="All" count={rows.length} active={type === 'all'} onClick={() => setType('all')} />
        {typeOptions.map(opt => (
          <FilterChip
            key={opt.key}
            label={SPRING_TYPE_META[opt.key].label}
            count={opt.count}
            active={type === opt.key}
            onClick={() => setType(opt.key)}
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
          title="直近5営業日に本シグナルが無かった＝新規点灯のみ表示"
        >
          ★ 新規点灯のみ
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
          {rows.length === 0 ? '本日の押し目候補は 0 件です。' : '該当する候補がありません。'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {sorted.map((r, i) => (
            <SpringSetupCard
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
      <span className="tracking-wide">{label}</span>
      <span className={`ml-1.5 text-[10px] ${active ? 'opacity-90' : 'text-gray-400'}`}>{count}</span>
    </button>
  )
}
