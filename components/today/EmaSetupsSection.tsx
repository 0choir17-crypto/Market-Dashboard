'use client'

import { useMemo, useState } from 'react'
import type { EmaSetupCardRow, EmaPeriod, TouchType } from '@/types/emaSetups'
import { EMA_PERIODS, resolveTouchType } from '@/types/emaSetups'
import type { Trade } from '@/types/trades'
import EmaSetupCard from './EmaSetupCard'
import PositionModal from '@/components/portfolio/PositionModal'

type Props = {
  rows: EmaSetupCardRow[]
  hotSectors: string[]
  title: string
  subtitle: string
  // ema_setups の DDL が未実行（テーブル未配備）。「0 件の日」と区別して案内する。
  tableMissing?: boolean
  // 複数スキャナー重複銘柄の code 集合（背景を黄色で強調）
  multiHitCodes: Set<string>
}

function isNum(v: number | null | undefined): v is number {
  return v !== null && v !== undefined && Number.isFinite(v)
}

// 大きい値ほど先頭になる降順コンパレータ（null は末尾）
function descBy(value: (r: EmaSetupCardRow) => number | null) {
  return (a: EmaSetupCardRow, b: EmaSetupCardRow) => {
    const av = value(a)
    const bv = value(b)
    if (!isNum(av) && !isNum(bv)) return 0
    if (!isNum(av)) return 1
    if (!isNum(bv)) return -1
    return bv - av
  }
}

type SortDef = { key: string; label: string; compare: (a: EmaSetupCardRow, b: EmaSetupCardRow) => number }

// 並べ替えはいずれも「中立な事実」に限る。既定は売買代金の降順。
// 「耐えの深さ (low_atr)」を並べ替えキーに入れないのは意図的: 配信側の検証で
// 深さ・ヒゲ/実体・EMA の別・翌日寄りの上昇は勝ち負けについて AUC 0.50（＝情報ゼロ）と
// 出ており、「良い順」に並べられると無い情報があるように見えてしまうため。
const SORTS: SortDef[] = [
  { key: 'turnover', label: '売買代金 大きい順', compare: descBy(r => r.turnover_oku) },
  { key: 'rs', label: 'RS 高い順', compare: descBy(r => r.rs_topix_avg) },
  { key: 'high', label: '52週高値に近い順', compare: descBy(r => r.dist_from_high_pct) },
  { key: 'adr', label: 'ADR% 大きい順', compare: descBy(r => r.adr_pct) },
  { key: 'code', label: 'コード順', compare: (a, b) => a.code.localeCompare(b.code) },
]

type EmaFilter = 'all' | EmaPeriod
type TouchFilter = 'all' | TouchType

// RS 下限スライダーの刻み。0 = フィルタなし（既定）。
// 配信側は RS の下限を掛けずに全件出している（採否は保留中）ので、既定は必ず「なし」。
const RS_STEP = 5
const RS_MAX = 90

export default function EmaSetupsSection({
  rows,
  hotSectors,
  title,
  subtitle,
  tableMissing = false,
  multiHitCodes,
}: Props) {
  const [sector, setSector] = useState<string>('all')
  const [ema, setEma] = useState<EmaFilter>('all')
  const [touch, setTouch] = useState<TouchFilter>('all')
  const [freshOnly, setFreshOnly] = useState(false)
  const [rsMin, setRsMin] = useState(0)
  const [sortKey, setSortKey] = useState<string>(SORTS[0].key)

  const hotSet = useMemo(() => new Set(hotSectors), [hotSectors])

  const sectorOptions = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) if (r.sector_s33) set.add(r.sector_s33)
    return [...set].sort((a, b) => a.localeCompare(b, 'ja'))
  }, [rows])

  // 1銘柄は最大3タッチを束ねているので、EMA / ヒゲ実体 / fresh は
  // 「その条件に当てはまるタッチを1つでも持つか」で判定する。
  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (sector !== 'all' && (r.sector_s33 ?? '') !== sector) return false
      if (ema !== 'all' && !r.touches.some(t => t.ema === ema)) return false
      if (touch !== 'all' && !r.touches.some(t => resolveTouchType(t) === touch)) return false
      if (freshOnly && !r.touches.some(t => t.fresh)) return false
      if (rsMin > 0 && !(isNum(r.rs_topix_avg) && r.rs_topix_avg >= rsMin)) return false
      return true
    })
  }, [rows, sector, ema, touch, freshOnly, rsMin])

  const sorted = useMemo(() => {
    const def = SORTS.find(s => s.key === sortKey) ?? SORTS[0]
    return [...filtered].sort((a, b) => def.compare(a, b))
  }, [filtered, sortKey])

  // タッチ総数（＝ DB の行数）。銘柄数と食い違うのが正常なので併記して誤解を防ぐ。
  const touchCount = useMemo(
    () => filtered.reduce((n, r) => n + r.touches.length, 0),
    [filtered],
  )

  const [positionTarget, setPositionTarget] = useState<Partial<Trade> | null>(null)


  function toPosition(r: EmaSetupCardRow): Partial<Trade> {
    return {
      ticker: r.code,
      company_name: r.co_name ?? undefined,
      sector_s33: r.sector_s33 ?? undefined,
      screen_name: 'EMA Setup',
      rs_at_entry: r.rs_topix_avg ?? undefined,
      signal_price: r.close ?? undefined,
    }
  }

  const selectClass =
    'text-xs px-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-gray-700 cursor-pointer'

  return (
    <section className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-4">
      <div className="flex items-baseline gap-2 flex-wrap mb-1">
        <h2 className="text-lg font-bold text-[var(--text-primary)]">{title}</h2>
        <span className="text-xs text-[var(--text-muted)]">
          <span className="font-mono">{sorted.length} / {rows.length}</span> 銘柄
          <span className="ml-1.5 font-mono" title="DB 上の行数（1タッチ=1行）。同じ銘柄が複数 EMA にタッチすると銘柄数より多くなる">
            （{touchCount} タッチ）
          </span>
        </span>
      </div>
      <p className="text-xs text-[var(--text-secondary)] mb-3">{subtitle}</p>

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

        <select
          value={String(ema)}
          onChange={e => setEma(e.target.value === 'all' ? 'all' : (Number(e.target.value) as EmaPeriod))}
          className={selectClass}
        >
          <option value="all">全 EMA</option>
          {EMA_PERIODS.map(p => (
            <option key={p} value={p}>
              EMA{p}
            </option>
          ))}
        </select>

        <select
          value={touch}
          onChange={e => setTouch(e.target.value as TouchFilter)}
          className={selectClass}
        >
          <option value="all">ヒゲ + 実体</option>
          <option value="WICK">ヒゲのみ</option>
          <option value="BODY">実体のみ</option>
        </select>

        <button
          onClick={() => setFreshOnly(v => !v)}
          className={`text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${
            freshOnly
              ? 'bg-amber-500 text-white border-amber-500'
              : 'bg-[var(--bg-card)] text-amber-700 border-amber-200 hover:bg-amber-50'
          }`}
          title="直近10営業日に同じ EMA へのタッチが無い＝初回のタッチを含む銘柄だけ表示"
        >
          初回のみ
        </button>

        <label
          className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]"
          title="対TOPIX RS の下限。配信側は下限を掛けずに全件出しているので既定は「なし」。EMA50 のタッチは深く押した銘柄が多く、RS 下限を上げると大きく削れる"
        >
          <span className="whitespace-nowrap">RS ≥</span>
          <input
            type="range"
            min={0}
            max={RS_MAX}
            step={RS_STEP}
            value={rsMin}
            onChange={e => setRsMin(Number(e.target.value))}
            className="w-24 cursor-pointer"
            aria-label="RS 下限"
          />
          <span className="font-mono w-8 tabular-nums">{rsMin === 0 ? 'なし' : rsMin}</span>
        </label>

        <span className="ml-auto flex items-center gap-1.5">
          <span className="text-[11px] text-[var(--text-muted)]">並び:</span>
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
        <div className="py-8 text-center text-sm text-[var(--text-muted)]">
          <p className="font-medium text-[var(--text-secondary)]">
            <code className="font-mono">ema_setups</code> テーブルがまだ Supabase にありません。
          </p>
          <p className="mt-1 text-xs">
            配信側（jquants-scanner）の DDL 実行待ちです。エラーではありません。
          </p>
        </div>
      ) : sorted.length === 0 ? (
        <div className="py-8 text-center text-sm text-[var(--text-muted)]">
          {rows.length === 0
            ? '本日は該当なし。'
            : '絞り込み条件に一致する銘柄がありません。'}
        </div>
      ) : (
        <div
          className="grid gap-2.5"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}
        >
          {sorted.map(r => (
            <EmaSetupCard
              key={r.code}
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
