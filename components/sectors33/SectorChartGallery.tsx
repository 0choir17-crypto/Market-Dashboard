'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  SectorSelectionRow,
  COMPONENT_META,
  compositeColor,
  componentColor,
  MOMENTUM_CONFIG,
} from '@/types/sectorSelection'
import {
  fetchAllSectorPriceHistory,
  OVERLAY_METRICS,
  VISIBLE_BARS,
  type OverlayMetricKey,
  type SectorChartEntry,
} from '@/lib/sectorPriceFetch'
import type { SectorIndexChangeEntry } from '@/lib/sectorIndexChangeFetch'
import SectorCandleChart, { VolumeLegend } from './SectorCandleChart'
import { SectorChangeStrip } from './SectorChangeCells'
import { RankDeltaBadge, MoversOnlyToggle } from './SectorRankDelta'
import {
  isBigMove,
  BIG_MOVE_THRESHOLD,
  type RankDelta,
  type RankDeltaMap,
  type RankDeltaPeriodKey,
} from '@/lib/sectorRankDelta'
import Tooltip from '@/components/shared/Tooltip'
import Dot from '@/components/shared/Dot'

type Props = {
  rows: SectorSelectionRow[]
  /** sector_name_s33 → 1D / 1W / 1M / 6M / 1Y の騰落率（後着でもよい） */
  changes?: Record<string, SectorIndexChangeEntry>
  /** sector_name_s33 → 順位変動（履歴が後着でもよい） */
  rankDeltas?: RankDeltaMap
  deltaPeriod: RankDeltaPeriodKey
}

type MetricSelection = OverlayMetricKey | 'none'

function isNum(v: number | null | undefined): v is number {
  return v !== null && v !== undefined && Number.isFinite(v)
}

// チャート下に並べる指標（現行ランキングの列と同じ並び）
const METRIC_CELLS: { key: OverlayMetricKey; label: string; tooltip: string }[] = [
  { key: 'composite_score', label: 'Score', tooltip: 'composite_score 0-100（総合）' },
  ...COMPONENT_META.map((m) => ({
    key: m.key as OverlayMetricKey,
    label: m.label,
    tooltip: m.tooltip,
  })),
]

function MetricCell({
  label,
  tooltip,
  value,
  color,
  active,
}: {
  label: string
  tooltip: string
  value: number | null | undefined
  color: string
  active: boolean
}) {
  return (
    <div
      className={`rounded-md border px-1.5 py-1 text-center transition-colors ${
        active ? 'border-[var(--accent)] bg-[var(--accent-bg)]' : 'border-[var(--border)] bg-[var(--bg-card)]'
      }`}
    >
      <Tooltip content={tooltip}>
        <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">{label}</p>
      </Tooltip>
      <p className="text-sm font-mono font-bold tabular-nums" style={{ color }}>
        {isNum(value) ? value.toFixed(0) : '—'}
      </p>
    </div>
  )
}

function SectorCard({
  row,
  entry,
  change,
  delta,
  deltaPeriod,
  metricKey,
}: {
  row: SectorSelectionRow
  entry: SectorChartEntry | undefined
  change: SectorIndexChangeEntry | undefined
  delta: RankDelta | undefined
  deltaPeriod: RankDeltaPeriodKey
  metricKey: MetricSelection
}) {
  const { bg, text } = compositeColor(row.composite_score)
  const isLow = row.confidence_low === 1
  const momentum = row.sector_momentum_s33
  const momentumCfg = momentum ? MOMENTUM_CONFIG[momentum] : null

  // 大きく動いたカードは枠線を色付きにして一覧から拾えるようにする
  const bigMove = isBigMove(delta)
  const accent = !bigMove
    ? null
    : delta?.isNew
      ? 'var(--accent)'
      : (delta?.delta ?? 0) > 0
        ? 'var(--positive)'
        : 'var(--negative)'

  const metric = useMemo(() => {
    if (metricKey === 'none' || !entry) return null
    const cfg = OVERLAY_METRICS[metricKey]
    const points = entry.metrics[metricKey]
    if (!points || points.length === 0) return null
    return { points, color: cfg.color }
  }, [entry, metricKey])

  return (
    <div
      className={`bg-[var(--bg-card)] rounded-xl border shadow-sm p-4 ${
        isLow ? 'opacity-70' : ''
      } ${accent ? 'border-l-4' : 'border-[var(--border)]'}`}
      style={accent ? { borderColor: 'var(--border)', borderLeftColor: accent } : undefined}
    >
      {/* ヘッダー: ランク / 順位変動 / 業種名 / モメンタム / スコア */}
      <div className="flex items-center gap-2 mb-2">
        <span className="font-mono text-xs text-[var(--text-muted)] tabular-nums shrink-0">
          #{row.composite_score_rank ?? '—'}
        </span>
        <span className="shrink-0">
          <RankDeltaBadge delta={delta} period={deltaPeriod} size="md" />
        </span>
        <span
          className="text-sm font-semibold text-[var(--text-primary)] truncate"
          title={row.sector_name_s33}
        >
          {row.sector_name_s33}
        </span>
        {isLow && <span title="信頼度低: 銘柄数<10">⚠️</span>}
        {momentumCfg && (
          <span
            className="ml-auto shrink-0 inline-flex items-center gap-1.5 text-caption whitespace-nowrap text-[var(--text-secondary)]"
          >
            <Dot tone={momentumCfg.tone} /> {momentumCfg.label}
          </span>
        )}
        <span
          className={`shrink-0 px-2 py-1 rounded-md font-mono text-sm font-bold tabular-nums ${
            momentumCfg ? '' : 'ml-auto'
          }`}
          style={{ backgroundColor: bg, color: text }}
        >
          {isNum(row.composite_score) ? row.composite_score.toFixed(1) : '—'}
        </span>
      </div>

      {/* 業種指数の騰落率: 1D / 1W / 1M / 6M / 1Y */}
      <div className="mb-2">
        <SectorChangeStrip entry={change} />
      </div>

      {/* チャート */}
      {entry && entry.bars.length > 0 ? (
        <SectorCandleChart
          bars={entry.bars}
          metric={metric}
          volumes={entry.volumes}
          volumeLabel="業種出来高"
          height={260}
          visibleBars={VISIBLE_BARS}
        />
      ) : (
        <div
          className="flex items-center justify-center bg-[var(--bg-card-hover)] rounded-md text-xs text-[var(--text-muted)] text-center px-3"
          style={{ height: 260 }}
        >
          指数データがありません
        </div>
      )}

      {/* チャート下: Score / RS / Acc / Brd / Sht / N */}
      <div className="grid grid-cols-6 gap-1.5 mt-3">
        {METRIC_CELLS.map((m) => {
          const value = row[m.key]
          return (
            <MetricCell
              key={m.key}
              label={m.label}
              tooltip={m.tooltip}
              value={value}
              color={
                m.key === 'composite_score'
                  ? text
                  : isNum(value)
                    ? componentColor(value)
                    : '#9ca3af'
              }
              active={metricKey === m.key}
            />
          )
        })}
        <div className="rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-1.5 py-1 text-center">
          <Tooltip content="セクター内銘柄数">
            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">N</p>
          </Tooltip>
          <p className="text-sm font-mono font-bold tabular-nums text-[var(--text-secondary)]">
            {isNum(row.sector_stock_count_s33) ? row.sector_stock_count_s33.toFixed(0) : '—'}
          </p>
        </div>
      </div>
    </div>
  )
}

export default function SectorChartGallery({
  rows,
  changes = {},
  rankDeltas = {},
  deltaPeriod,
}: Props) {
  const [bySector, setBySector] = useState<Record<string, SectorChartEntry>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [metricKey, setMetricKey] = useState<MetricSelection>('composite_score')
  // 既定で信頼度低 (銘柄数<10) を除外する
  const [hideLowConf, setHideLowConf] = useState(true)
  const [moversOnly, setMoversOnly] = useState(false)

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

  // スコア降順に並べる（欠損は末尾）
  const sorted = useMemo(() => {
    let arr = hideLowConf ? rows.filter((r) => r.confidence_low !== 1) : [...rows]
    if (moversOnly) arr = arr.filter((r) => isBigMove(rankDeltas[r.sector_name_s33]))
    return [...arr].sort(
      (a, b) => (b.composite_score ?? -Infinity) - (a.composite_score ?? -Infinity),
    )
  }, [rows, hideLowConf, moversOnly, rankDeltas])

  const lowConfCount = rows.filter((r) => r.confidence_low === 1).length
  const moverCount = useMemo(
    () => rows.filter((r) => isBigMove(rankDeltas[r.sector_name_s33])).length,
    [rows, rankDeltas],
  )

  return (
    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-5">
      {/* ツールバー */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4">
        <p className="text-sm font-semibold text-[var(--text-primary)]">
          業種指数チャート
          <span className="ml-2 font-normal text-[var(--text-muted)]">
            — スコア順・ローソク足 + EMA + 業種出来高
          </span>
        </p>

        {/* 出来高バーは平常比で色分けする（生の株数は低位株1銘柄に支配されるため、
            業種間の勢い比較はバーの高さではなく色で読む） */}
        <VolumeLegend />

        <div className="flex items-center gap-1 text-xs">
          <span className="text-[var(--text-muted)]">重ねる指標:</span>
          {(
            [
              { k: 'none' as const, label: 'なし' },
              ...METRIC_CELLS.map((m) => ({ k: m.key as MetricSelection, label: m.label })),
            ]
          ).map((o) => (
            <button
              key={o.k}
              onClick={() => setMetricKey(o.k)}
              className={`px-2 py-0.5 rounded border text-xs ${
                metricKey === o.k
                  ? 'bg-[var(--accent-bg)] border-[var(--accent)] text-[var(--accent)] font-semibold'
                  : 'bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={hideLowConf}
            onChange={(e) => setHideLowConf(e.target.checked)}
            className="accent-[var(--accent)]"
          />
          信頼度低 (銘柄数&lt;10) を除外
          {lowConfCount > 0 && (
            <span className="text-[var(--text-muted)]">
              （<span className="font-mono">{lowConfCount}</span> 件）
            </span>
          )}
        </label>

        <MoversOnlyToggle
          checked={moversOnly}
          onChange={setMoversOnly}
          count={moverCount}
        />

        <span className="ml-auto text-xs text-[var(--text-muted)]">
          <span className="font-mono">{sorted.length}</span> セクター
        </span>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-md bg-[var(--sem-weak-bg)] text-sm text-[var(--sem-weak-fg)]">
          指数チャート取得エラー: {error}
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-sm text-[var(--text-muted)]">
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
              delta={rankDeltas[row.sector_name_s33]}
              deltaPeriod={deltaPeriod}
              metricKey={metricKey}
            />
          ))}
        </div>
      )}

      {!loading && sorted.length === 0 && (
        <div className="py-10 text-center text-[var(--text-muted)] text-sm">
          {moversOnly
            ? `${deltaPeriod.toUpperCase()} で ±${BIG_MOVE_THRESHOLD}位以上動いたセクターはありません`
            : 'データがありません'}
        </div>
      )}
    </div>
  )
}
