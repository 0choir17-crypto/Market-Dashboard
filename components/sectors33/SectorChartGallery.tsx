'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SectorSelectionRow, bySelfT63, fmtT, isNum } from '@/types/sectorSelection'
import {
  fetchAllSectorPriceHistory,
  OVERLAY_METRICS,
  VISIBLE_BARS,
  type OverlayMetricKey,
  type SectorChartEntry,
} from '@/lib/sectorPriceFetch'
import type { SectorIndexChangeEntry } from '@/lib/sectorIndexChangeFetch'
import type { SelfDiff } from '@/lib/sectorSelectionHistoryFetch'
import SectorCandleChart, { MaLegend, VolumeLegend } from './SectorCandleChart'
import { SectorChangeStrip } from './SectorChangeCells'
import { CautionMark, DiffArrow, TValue, CAUTION_NOTE } from './SelfStrength'
import Tooltip from '@/components/shared/Tooltip'

type Props = {
  rows: SectorSelectionRow[]
  /** sector_name_s33 → 1D / 1W / 1M / 6M / 1Y の騰落率（後着でもよい） */
  changes?: Record<string, SectorIndexChangeEntry>
  /** sector_name_s33 → self_t63 / self_t21 の 5 営業日前との差（履歴が後着でもよい） */
  diffs?: Record<string, SelfDiff>
}

type MetricSelection = OverlayMetricKey | 'none'

// 重ねる指標の縦軸。t 値なので 0 を中心に ±4 で固定し、業種間で高さを比べられるようにする
const METRIC_RANGE: [number, number] = [-4, 4]

// チャート下に並べる指標（一覧の列と同じ並び）
type CellKey = 'self_t63' | 'self_t21' | 'med_vs_idx_t21' | 'va_share21_z250'
const METRIC_CELLS: { key: CellKey; label: string; tooltip: string; overlay: boolean }[] = [
  { key: 'self_t63', label: 'Self t63', tooltip: `業種の自力の 63 日 t 値（主の列）。${CAUTION_NOTE}`, overlay: true },
  { key: 'self_t21', label: 'Self t21', tooltip: '業種の自力の 21 日 t 値。回復・失速の確認用', overlay: true },
  { key: 'med_vs_idx_t21', label: 'Med/Idx', tooltip: '中央値の銘柄 vs 業種指数の t 値（21 日）。+ 中小型が強い / − 大型主導。状況の説明用', overlay: false },
  { key: 'va_share21_z250', label: 'VA z', tooltip: '代金シェア（21 日）の普段（250 日）比 z 値。+1 以上 = 資金が集まっている。状況の説明用', overlay: false },
]

function MetricCell({
  label,
  tooltip,
  value,
  active,
}: {
  label: string
  tooltip: string
  value: number | null | undefined
  active: boolean
}) {
  return (
    <div
      className={`rounded-md border px-1.5 py-1 text-center transition-colors ${
        active ? 'border-[var(--accent)] bg-[var(--accent-bg)]' : 'border-[var(--border)] bg-[var(--bg-card)]'
      }`}
    >
      <Tooltip content={tooltip}>
        <p className="text-caption text-[var(--text-muted)] uppercase tracking-wide">{label}</p>
      </Tooltip>
      <p
        className="text-small font-mono font-medium tabular-nums"
        style={{ color: isNum(value) ? 'var(--text-primary)' : 'var(--sem-idle-fg)' }}
      >
        {fmtT(value)}
      </p>
    </div>
  )
}

function SectorCard({
  row,
  entry,
  change,
  diff,
  metricKey,
  chartHeight = 260,
  onExpand,
}: {
  row: SectorSelectionRow
  entry: SectorChartEntry | undefined
  change: SectorIndexChangeEntry | undefined
  diff: number | undefined
  metricKey: MetricSelection
  chartHeight?: number
  /** 渡すとチャートのクリックで拡大表示を開く（拡大表示の中では渡さない） */
  onExpand?: () => void
}) {
  const isLow = row.confidence_low === 1

  const metric = useMemo(() => {
    if (metricKey === 'none' || !entry) return null
    const cfg = OVERLAY_METRICS[metricKey]
    const points = entry.metrics[metricKey]
    if (!points || points.length === 0) return null
    return { points, color: cfg.color, range: METRIC_RANGE }
  }, [entry, metricKey])

  // チャートはドラッグでスクロールできるので、押した位置から動いていない
  // クリックだけを「拡大」とみなす（ドラッグ終わりで開かないように）
  const pressRef = useRef<{ x: number; y: number } | null>(null)
  const expandHandlers = onExpand
    ? {
        onPointerDown: (e: React.PointerEvent) => {
          pressRef.current = { x: e.clientX, y: e.clientY }
        },
        onClick: (e: React.MouseEvent) => {
          const p = pressRef.current
          pressRef.current = null
          if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 5) return
          onExpand()
        },
      }
    : {}

  return (
    <div
      className={`bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-4 ${
        isLow ? 'opacity-70' : ''
      }`}
    >
      {/* ヘッダー: 業種名 / 注意の印 / self_t63 と 5 日差の矢印 */}
      <div className="flex items-center gap-2 mb-2">
        <span
          className="text-small font-medium text-[var(--text-primary)] truncate"
          title={row.sector_name_s33}
        >
          {row.sector_name_s33}
        </span>
        {isLow && (
          <span className="text-caption text-[var(--text-muted)]" title="信頼度低: 銘柄数が少ないためノイズ大">
            低
          </span>
        )}
        <span className="ml-auto shrink-0 inline-flex items-center gap-1.5 whitespace-nowrap">
          <CautionMark row={row} />
          <span className="text-caption text-[var(--text-muted)]">Self t63</span>
          <span className="text-small">
            <TValue v={row.self_t63} strong />
          </span>
          <span className="w-2.5 inline-block">
            <DiffArrow diff={diff} />
          </span>
        </span>
        {onExpand && (
          <button
            type="button"
            onClick={onExpand}
            title="拡大表示"
            aria-label={`${row.sector_name_s33} のチャートを拡大表示`}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]"
          >
            ⤢
          </button>
        )}
      </div>

      {/* 業種指数の騰落率: 1D / 1W / 1M / 6M / 1Y */}
      <div className="mb-2">
        <SectorChangeStrip entry={change} />
      </div>

      {/* チャート */}
      {entry && entry.bars.length > 0 ? (
        <div
          {...expandHandlers}
          className={onExpand ? 'cursor-zoom-in' : undefined}
          title={onExpand ? 'クリックで拡大' : undefined}
        >
          <SectorCandleChart
            bars={entry.bars}
            metric={metric}
            volumes={entry.volumes}
            volumeLabel="業種出来高"
            height={chartHeight}
            visibleBars={VISIBLE_BARS}
          />
        </div>
      ) : (
        <div
          className="flex items-center justify-center bg-[var(--bg-card-hover)] rounded-md text-caption text-[var(--text-muted)] text-center px-3"
          style={{ height: chartHeight }}
        >
          指数データがありません
        </div>
      )}

      {/* チャート下: Self t63 / Self t21 / Med/Idx / VA z / VA up / N */}
      <div className="grid grid-cols-6 gap-1.5 mt-3">
        {METRIC_CELLS.map((m) => (
          <MetricCell
            key={m.key}
            label={m.label}
            tooltip={m.tooltip}
            value={row[m.key]}
            active={metricKey === m.key}
          />
        ))}
        <div className="rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-1.5 py-1 text-center">
          <Tooltip content="対象銘柄（売買代金 1,000 位以内）のうち、21 日の平均代金が 63 日平均の 1.2 倍を超える割合。状況の説明用">
            <p className="text-caption text-[var(--text-muted)] tracking-wide">VA up</p>
          </Tooltip>
          <p className="text-small font-mono font-medium tabular-nums text-[var(--text-primary)]">
            {isNum(row.va21_vs63_up_pct) ? `${row.va21_vs63_up_pct.toFixed(0)}%` : '—'}
          </p>
        </div>
        <div className="rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-1.5 py-1 text-center">
          <Tooltip content="対象銘柄数（売買代金 1,000 位以内） / 業種の全銘柄数">
            <p className="text-caption text-[var(--text-muted)] tracking-wide">N</p>
          </Tooltip>
          <p className="text-small font-mono font-medium tabular-nums text-[var(--text-secondary)]">
            {isNum(row.n_stocks) ? row.n_stocks : '—'}
            <span className="text-[var(--text-muted)]">/{isNum(row.sector_stock_count_s33) ? row.sector_stock_count_s33 : '—'}</span>
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * 1 業種のチャートを画面いっぱいに拡大表示する。
 * ← / → で前後の業種（一覧と同じ並び）に移れる。Esc / 背景クリックで閉じる。
 */
function ExpandedSectorView({
  index,
  count,
  onClose,
  onNavigate,
  children,
}: {
  index: number
  count: number
  onClose: () => void
  onNavigate: (dir: -1 | 1) => void
  children: React.ReactNode
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') onNavigate(-1)
      else if (e.key === 'ArrowRight') onNavigate(1)
    }
    window.addEventListener('keydown', onKey)
    // 背面スクロールを止める
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose, onNavigate])

  const navBtn =
    'px-3 py-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-card)] text-caption font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] disabled:opacity-40 disabled:cursor-not-allowed'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="業種指数チャート（拡大）"
        className="relative w-full max-w-[1600px] max-h-full overflow-y-auto rounded-xl bg-[var(--bg-primary)] shadow-xl p-3 sm:p-4"
      >
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <MaLegend />
          <VolumeLegend />
          <div className="ml-auto flex items-center gap-2">
            <button className={navBtn} onClick={() => onNavigate(-1)} disabled={index <= 0}>
              ← 前
            </button>
            <span className="text-caption font-mono tabular-nums text-[var(--text-muted)]">
              {index + 1} / {count}
            </span>
            <button className={navBtn} onClick={() => onNavigate(1)} disabled={index >= count - 1}>
              次 →
            </button>
            <button
              onClick={onClose}
              aria-label="閉じる"
              className="w-8 h-8 flex items-center justify-center rounded-md text-title leading-none font-light text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]"
            >
              ×
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}

/** 拡大表示のチャート高さ。ヘッダー・騰落率・指標セルのぶんを画面高から引く */
function useExpandedChartHeight(active: boolean) {
  const [h, setH] = useState(560)
  useEffect(() => {
    if (!active) return
    const update = () => setH(Math.max(320, Math.round(window.innerHeight - 300)))
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [active])
  return h
}

export default function SectorChartGallery({
  rows,
  changes = {},
  diffs = {},
}: Props) {
  const [bySector, setBySector] = useState<Record<string, SectorChartEntry>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [metricKey, setMetricKey] = useState<MetricSelection>('self_t63')
  // 既定で信頼度低を除外する
  const [hideLowConf, setHideLowConf] = useState(true)
  // 拡大表示中の業種（null なら閉じている）
  const [expanded, setExpanded] = useState<string | null>(null)

  // 境界日の算出に使う代表業種（どの業種も 1 日 1 行なのでどれでもよい）
  const referenceSector = rows[0]?.sector_name_s33

  useEffect(() => {
    if (!referenceSector) return
    let cancelled = false
    fetchAllSectorPriceHistory(undefined, referenceSector).then((res) => {
      if (cancelled) return
      setBySector(res.bySector)
      setError(res.error)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [referenceSector])

  // self_t63 の高い順（欠損は末尾）
  const sorted = useMemo(() => {
    const arr = hideLowConf ? rows.filter((r) => r.confidence_low !== 1) : [...rows]
    return [...arr].sort(bySelfT63)
  }, [rows, hideLowConf])

  // フィルタで一覧から外れた業種は拡大表示の対象にしない
  const expandedIndex = expanded
    ? sorted.findIndex((r) => r.sector_name_s33 === expanded)
    : -1
  const expandedRow = expandedIndex >= 0 ? sorted[expandedIndex] : null
  const expandedChartHeight = useExpandedChartHeight(expandedRow !== null)

  const closeExpanded = useCallback(() => setExpanded(null), [])
  const navigateExpanded = useCallback(
    (dir: -1 | 1) => {
      const next = sorted[expandedIndex + dir]
      if (next) setExpanded(next.sector_name_s33)
    },
    [sorted, expandedIndex],
  )

  const lowConfCount = rows.filter((r) => r.confidence_low === 1).length

  return (
    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-5">
      {/* ツールバー */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4">
        <p className="text-small font-medium text-[var(--text-primary)]">
          業種指数チャート
          <span className="ml-2 font-normal text-[var(--text-muted)]">
            — self_t63 の高い順・ローソク足 + EMA + 業種出来高
          </span>
        </p>

        {/* 出来高バーは平常比で色分けする（生の株数は低位株1銘柄に支配されるため、
            業種間の勢い比較はバーの高さではなく色で読む） */}
        <VolumeLegend />

        <div className="flex items-center gap-1 text-caption">
          <span className="text-[var(--text-muted)]">重ねる指標:</span>
          {(
            [
              { k: 'none' as const, label: 'なし' },
              ...(Object.keys(OVERLAY_METRICS) as OverlayMetricKey[]).map((k) => ({
                k: k as MetricSelection,
                label: OVERLAY_METRICS[k].label,
              })),
            ]
          ).map((o) => (
            <button
              key={o.k}
              onClick={() => setMetricKey(o.k)}
              className={`px-2 py-0.5 rounded border text-caption ${
                metricKey === o.k
                  ? 'bg-[var(--accent-bg)] border-[var(--accent)] text-[var(--accent)] font-medium'
                  : 'bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-caption text-[var(--text-secondary)] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={hideLowConf}
            onChange={(e) => setHideLowConf(e.target.checked)}
            className="accent-[var(--accent)]"
          />
          信頼度低を除外
          {lowConfCount > 0 && (
            <span className="text-[var(--text-muted)]">
              （<span className="font-mono">{lowConfCount}</span> 件）
            </span>
          )}
        </label>

        <span className="ml-auto text-caption text-[var(--text-muted)]">
          <span className="font-mono">{sorted.length}</span> セクター
        </span>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-md bg-[var(--sem-weak-bg)] text-small text-[var(--sem-weak-fg)]">
          指数チャート取得エラー: {error}
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-small text-[var(--text-muted)]">
          チャート読み込み中…
        </div>
      ) : (
        /* 横2列 */
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {sorted.map((row) => (
            <SectorCard
              key={row.sector_name_s33}
              row={row}
              entry={bySector[row.sector_name_s33]}
              change={changes[row.sector_name_s33]}
              diff={diffs[row.sector_name_s33]?.t63}
              metricKey={metricKey}
              onExpand={() => setExpanded(row.sector_name_s33)}
            />
          ))}
        </div>
      )}

      {expandedRow && (
        <ExpandedSectorView
          index={expandedIndex}
          count={sorted.length}
          onClose={closeExpanded}
          onNavigate={navigateExpanded}
        >
          <SectorCard
            row={expandedRow}
            entry={bySector[expandedRow.sector_name_s33]}
            change={changes[expandedRow.sector_name_s33]}
            diff={diffs[expandedRow.sector_name_s33]?.t63}
            metricKey={metricKey}
            chartHeight={expandedChartHeight}
          />
        </ExpandedSectorView>
      )}

      {!loading && sorted.length === 0 && (
        <div className="py-10 text-center text-[var(--text-muted)] text-small">
          データがありません
        </div>
      )}
    </div>
  )
}
