'use client'

import { useMemo, useState } from 'react'
import type { StructurePivotCardRow, StructurePivotSignal } from '@/types/structurePivotEvents'
import type { Trade } from '@/types/trades'
import StructurePivotCard from './StructurePivotCard'
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

// 日付文字列（YYYY-MM-DD）を新しい順に。null は末尾。
function dateDesc(value: (r: StructurePivotCardRow) => string | null) {
  return (a: StructurePivotCardRow, b: StructurePivotCardRow) => {
    const av = value(a)
    const bv = value(b)
    if (!av && !bv) return 0
    if (!av) return 1
    if (!bv) return -1
    return bv.localeCompare(av)
  }
}

type SortDef = { key: string; label: string; compare: (a: StructurePivotCardRow, b: StructurePivotCardRow) => number }

// 全件が本日ヒットなので既定は RS 高い順。「1st の直近が新しい順」は 2nd ブレイク直前に
// 1st を最近付けた（＝1st→2nd 進行中）銘柄を上位に出す補助ソート。
const SORTS: SortDef[] = [
  { key: 'rs', label: 'RS 高い順', compare: (a, b) => descBy(r => r.rs_topix_avg)(a, b) },
  { key: 'high', label: '52週高値に近い順', compare: descBy(r => r.dist_from_high_pct) },
  { key: 'turnover', label: '売買代金 大きい順', compare: descBy(r => r.turnover_oku) },
  {
    key: 'prog',
    label: '1st のヒット日が新しい順',
    compare: (a, b) => dateDesc(r => r.last_1st_date)(a, b) || descBy(r => r.rs_topix_avg)(a, b),
  },
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
      // signal フィルタは「本日ヒットしたシグナル」で判定（本日 1st / 本日 2nd）。
      if (signal === '1st' && !r.today_1st) return false
      if (signal === '2nd' && !r.today_2nd) return false
      return true
    })
  }, [rows, sector, signal])

  const sorted = useMemo(() => {
    const def = SORTS.find(s => s.key === sortKey) ?? SORTS[0]
    return [...filtered].sort((a, b) => def.compare(a, b))
  }, [filtered, sortKey])

  const [positionTarget, setPositionTarget] = useState<Partial<Trade> | null>(null)


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
          className="text-xs px-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] cursor-pointer"
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
          className="text-xs px-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] cursor-pointer"
        >
          <option value="all">本日 1st + 2nd</option>
          <option value="1st">本日 1st ヒット</option>
          <option value="2nd">本日 2nd ヒット</option>
        </select>

        <span className="ml-auto flex items-center gap-1.5">
          <span className="text-[11px] text-[var(--text-muted)]">並び:</span>
          <select
            value={sortKey}
            onChange={e => setSortKey(e.target.value)}
            className="text-xs px-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] cursor-pointer"
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
        <div
          className="grid gap-2.5"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}
        >
          {sorted.map((r, i) => (
            <StructurePivotCard
              key={`${r.code}-${i}`}
              row={r}
              hot={r.sector_s33 != null && hotSet.has(r.sector_s33)}
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
