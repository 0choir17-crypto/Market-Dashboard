'use client'

import { useMemo, useState } from 'react'
import {
  SectorSelectionRow,
  COMPONENT_META,
  COMPONENT_WEIGHTS,
  ComponentKey,
  MOMENTUM_CONFIG,
  compositeColor,
  componentColor,
  SectorMomentum,
} from '@/types/sectorSelection'
import Tooltip from '@/components/shared/Tooltip'
import { SectorChangeInline } from './SectorChangeCells'
import type { SectorIndexChangeEntry } from '@/lib/sectorIndexChangeFetch'
import { RankDeltaBadge, MoversOnlyToggle } from './SectorRankDelta'
import {
  isBigMove,
  BIG_MOVE_THRESHOLD,
  type RankDeltaMap,
  type RankDeltaPeriodKey,
} from '@/lib/sectorRankDelta'
import Dot from '@/components/shared/Dot'
import DataTable, { type Column } from '@/components/shared/DataTable'


function isNum(v: number | null | undefined): v is number {
  return v !== null && v !== undefined && Number.isFinite(v)
}

function fmt(v: number | null | undefined, decimals = 1): string {
  return isNum(v) ? v.toFixed(decimals) : '—'
}

// リターン/超過は DB が倍率−1（0.067 = +6.7%）なので ×100 で%化。
function fmtSignedPct(v: number | null | undefined, decimals = 1): string {
  if (!isNum(v)) return '—'
  const p = v * 100
  return `${p >= 0 ? '+' : ''}${p.toFixed(decimals)}%`
}

// 空売り比率は 0〜1 の割合なので ×100 で%化（符号なし）。
function fmtRatioPct(v: number | null | undefined, decimals = 1): string {
  return isNum(v) ? `${(v * 100).toFixed(decimals)}%` : '—'
}

// 売り代金（円）を億円で読みやすく。
function fmtOku(v: number | null | undefined): string {
  if (!isNum(v)) return '—'
  return `${(v / 1e8).toLocaleString('ja-JP', { maximumFractionDigits: 1 })}億`
}

function pctColor(v: number | null | undefined): string {
  if (!isNum(v) || v === 0) return 'var(--text-muted)'
  return v > 0 ? 'var(--positive)' : 'var(--negative)'
}

// 4期間（5/21/63/126d）× リターン/TOPIX超過 のミニ表
function ReturnsBlock({ row }: { row: SectorSelectionRow }) {
  const periods: {
    label: string
    ret: number | null | undefined
    exc: number | null | undefined
  }[] = [
    { label: '5d', ret: row.sector_index_ret_5d_s33, exc: row.sector_index_excess_5d_s33 },
    { label: '21d', ret: row.sector_index_ret_21d_s33, exc: row.sector_index_excess_21d_s33 },
    { label: '63d', ret: row.sector_index_ret_63d_s33, exc: row.sector_index_excess_63d_s33 },
    { label: '126d', ret: row.sector_index_ret_126d_s33, exc: row.sector_index_excess_126d_s33 },
  ]
  return (
    <div className="grid grid-cols-4 gap-2">
      {periods.map((p) => (
        <div
          key={p.label}
          className="rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1.5 text-center"
        >
          <p className="text-[10px] text-[var(--text-muted)] font-mono">{p.label}</p>
          <p className="text-sm font-mono font-semibold tabular-nums" style={{ color: pctColor(p.ret) }}>
            {fmtSignedPct(p.ret)}
          </p>
          <p className="text-[10px] font-mono tabular-nums" style={{ color: pctColor(p.exc) }}>
            <span className="text-gray-400">vs TPX </span>
            {fmtSignedPct(p.exc)}
          </p>
        </div>
      ))}
    </div>
  )
}

function MiniBar({ value }: { value: number | null | undefined }) {
  const safe = isNum(value) ? Math.max(0, Math.min(100, value)) : 0
  const color = componentColor(value)
  const label = isNum(value) ? value.toFixed(0) : '—'
  return (
    <div className="flex items-center gap-1.5 w-full">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden min-w-[24px]">
        <div className="h-full rounded-full" style={{ width: `${safe}%`, backgroundColor: color }} />
      </div>
      <span
        className="font-mono text-[10px] tabular-nums w-6 text-right"
        style={{ color: isNum(value) ? 'var(--text-primary)' : 'var(--sem-idle-fg)' }}
      >
        {label}
      </span>
    </div>
  )
}

function MomentumBadge({ m }: { m: SectorMomentum | null }) {
  if (!m || !MOMENTUM_CONFIG[m]) {
    return <span className="text-xs text-[var(--text-muted)]">—</span>
  }
  const cfg = MOMENTUM_CONFIG[m]
  return (
    <span
      className="inline-flex items-center gap-1.5 text-caption whitespace-nowrap text-[var(--text-secondary)]"
    >
      <Dot tone={cfg.tone} /> {cfg.label}
    </span>
  )
}

function CompositeCell({ score }: { score: number | null | undefined }) {
  const { bg, text } = compositeColor(score)
  const v = isNum(score) ? score.toFixed(1) : '—'
  return (
    <span
      className="inline-block min-w-[52px] text-center px-2 py-1 rounded-md font-mono text-sm font-bold tabular-nums"
      style={{ backgroundColor: bg, color: text }}
    >
      {v}
    </span>
  )
}


// ── Drilldown: 5 horizontal bars with weight annotation ─────────────────────
// 行を開いたときの中身。表の骨格（tr / td / colSpan）は DataTable が持つ。
function DrilldownBody({ row }: { row: SectorSelectionRow }) {
  const total = isNum(row.composite_score) ? row.composite_score.toFixed(2) : '—'
  return (
    <>
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
          {/* Left: 5 component bars */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-600">
                スコア内訳 — {row.sector_name_s33}
                {row.sector_code_s33 && (
                  <span className="ml-2 text-gray-400 font-mono">[{row.sector_code_s33}]</span>
                )}
              </p>
              <p className="text-xs text-gray-500">
                合計 <span className="font-mono font-bold text-gray-700">{total}</span>
              </p>
            </div>
            <div className="space-y-2">
              {COMPONENT_META.map(meta => {
                const value = row[meta.key]
                const weight = COMPONENT_WEIGHTS[meta.key]
                const safe = isNum(value) ? Math.max(0, Math.min(100, value)) : 0
                const color = componentColor(value)
                return (
                  <div key={meta.key} className="flex items-center gap-3 text-xs">
                    <div className="w-32 flex items-center gap-1 shrink-0">
                      <Tooltip content={meta.tooltip}>
                        <span className="font-semibold text-gray-700">{meta.label}</span>
                      </Tooltip>
                      <span className="text-gray-400 font-mono">(×{weight.toFixed(2)})</span>
                    </div>
                    <div className="flex-1 h-3 bg-gray-100 rounded overflow-hidden">
                      <div
                        className="h-full rounded"
                        style={{ width: `${safe}%`, backgroundColor: color }}
                      />
                    </div>
                    <span
                      className="font-mono tabular-nums w-10 text-right text-gray-700"
                      style={{ color: isNum(value) ? 'var(--text-primary)' : 'var(--sem-idle-fg)' }}
                    >
                      {isNum(value) ? value.toFixed(0) : '—'}
                    </span>
                    <span className="font-mono tabular-nums w-14 text-right text-gray-500">
                      {isNum(value) ? `→ ${(value * weight).toFixed(2)}` : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Right: contextual stats */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <Stat label="RS 21d" value={fmt(row.sector_rs_21d_s33, 1)} />
            <Stat label="RS 63d" value={fmt(row.sector_rs_63d_s33, 1)} />
            <Stat label="RS加速" value={fmt(row.sector_rs_acc_s33, 2)} />
            <Stat label="ER 21d" value={fmt(row.sector_er_21d_s33, 4)} />
            <Stat label=">50MA %" value={fmt(row.sector_pct_above_50ma_s33, 1)} />
            <Stat label=">200MA %" value={fmt(row.sector_pct_above_200ma_s33, 1)} />
            <Stat label="52w高値圏 %" value={fmt(row.sector_pct_near_52w_high_s33, 1)} />
            <Stat label="MAスタック %" value={fmt(row.sector_pct_ma_stack_s33, 1)} />
            <Stat label="VCS≥80 %" value={fmt(row.sector_pct_vcs80_s33, 1)} />
            <Stat label="VCS中央" value={fmt(row.sector_vcs_median_s33, 1)} />
            <Stat label="空売り比率 5d" value={fmt(row.sector_short_va_ratio_5d_s33, 3)} />
            <Stat label="銘柄数" value={fmt(row.sector_stock_count_s33, 0)} />
          </div>
        </div>

        {/* 期間リターン / TOPIX超過 */}
        <div className="mt-5">
          <p className="text-xs font-semibold text-gray-600 mb-2">
            期間リターン / TOPIX超過
          </p>
          <ReturnsBlock row={row} />
        </div>

        {/* 空売り内訳（当日） */}
        <div className="mt-5">
          <div className="flex items-baseline gap-3 mb-2">
            <p className="text-xs font-semibold text-gray-600">空売り内訳（当日）</p>
            <p className="text-xs text-gray-500">
              比率{' '}
              <span className="font-mono font-bold text-gray-700">
                {fmtRatioPct(row.sector_short_va_ratio_s33)}
              </span>
              <span className="ml-2 text-gray-400">
                （5日平均 {fmtRatioPct(row.sector_short_va_ratio_5d_s33)}）
              </span>
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <Stat label="空売り以外(円)" value={fmtOku(row.sector_sell_ex_short_va_s33)} />
            <Stat label="規制有 空売り(円)" value={fmtOku(row.sector_shrt_with_res_va_s33)} />
            <Stat label="規制無 空売り(円)" value={fmtOku(row.sector_shrt_no_res_va_s33)} />
          </div>
        </div>
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-dashed border-[var(--border)] py-0.5">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span className="font-mono tabular-nums text-[var(--text-primary)]">{value}</span>
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────
export default function SectorSelectionTable({
  rows,
  changes = {},
  rankDeltas = {},
  deltaPeriod,
}: {
  rows: SectorSelectionRow[]
  /** sector_name_s33 → 1D / 1W / 1M / 6M / 1Y の騰落率（後着でもよい） */
  changes?: Record<string, SectorIndexChangeEntry>
  /** sector_name_s33 → 順位変動（履歴が後着でもよい） */
  rankDeltas?: RankDeltaMap
  deltaPeriod: RankDeltaPeriodKey
}) {
  // 既定で信頼度低 (銘柄数<10) を除外する
  const [hideLowConf, setHideLowConf] = useState(true)
  const [moversOnly, setMoversOnly] = useState(false)

  const filtered = useMemo(() => {
    let arr = hideLowConf ? rows.filter(r => r.confidence_low !== 1) : rows
    if (moversOnly) arr = arr.filter(r => isBigMove(rankDeltas[r.sector_name_s33]))
    return arr
  }, [rows, hideLowConf, moversOnly, rankDeltas])

  const lowConfCount = rows.filter(r => r.confidence_low === 1).length
  const moverCount = useMemo(
    () => rows.filter(r => isBigMove(rankDeltas[r.sector_name_s33])).length,
    [rows, rankDeltas],
  )
  // 列定義。5 つの内訳バーはスコアの構成要素で横断比較に使うので一覧に残す。
  const columns: Column<SectorSelectionRow>[] = useMemo(
    () => [
      {
        key: 'rank',
        label: '#',
        tooltip: `composite_score_rank — 当日ランク (1=トップ)。右の ▲▼ は ${deltaPeriod.toUpperCase()} 前からの順位変動`,
        align: 'center' as const,
        value: (r: SectorSelectionRow) => r.composite_score_rank,
        defaultDir: 'asc' as const,
        className: 'w-24',
        render: (r: SectorSelectionRow) => (
          <span className="inline-flex items-center gap-1.5 num text-[var(--text-secondary)]">
            <span>{r.composite_score_rank ?? '—'}</span>
            <RankDeltaBadge delta={rankDeltas[r.sector_name_s33]} period={deltaPeriod} />
          </span>
        ),
      },
      {
        key: 'sector_name_s33',
        label: 'Sector',
        tooltip: 'TOPIX-33 業種名。行をクリックすると内訳が開く',
        align: 'left' as const,
        value: (r: SectorSelectionRow) => r.sector_name_s33,
        defaultDir: 'asc' as const,
        render: (r: SectorSelectionRow) => (
          <div className="flex items-center gap-4 whitespace-nowrap">
            <span className="text-[var(--text-primary)]">
              {r.sector_name_s33}
              {r.confidence_low === 1 && (
                <span
                  className="ml-1.5 text-caption text-[var(--sem-watch-fg)]"
                  title="信頼度低: 銘柄数が少ないためノイズ大"
                >
                  低
                </span>
              )}
            </span>
            <span className="ml-auto">
              <SectorChangeInline entry={changes[r.sector_name_s33]} />
            </span>
          </div>
        ),
      },
      {
        key: 'composite_score',
        label: 'Score',
        tooltip: 'composite_score 0-100',
        align: 'center' as const,
        value: (r: SectorSelectionRow) => r.composite_score,
        render: (r: SectorSelectionRow) => <CompositeCell score={r.composite_score} />,
      },
      {
        key: 'sector_momentum_s33',
        label: 'Trend',
        align: 'left' as const,
        render: (r: SectorSelectionRow) => <MomentumBadge m={r.sector_momentum_s33} />,
      },
      ...COMPONENT_META.map(m => ({
        key: m.key,
        label: m.label,
        tooltip: `${m.tooltip} — 重み ×${COMPONENT_WEIGHTS[m.key].toFixed(2)}`,
        value: (r: SectorSelectionRow) => r[m.key],
        className: 'w-[110px]',
        render: (r: SectorSelectionRow) => <MiniBar value={r[m.key]} />,
      })),
      {
        key: 'sector_stock_count_s33',
        label: 'N',
        tooltip: 'セクター内銘柄数',
        value: (r: SectorSelectionRow) => r.sector_stock_count_s33,
        className: 'w-14',
        render: (r: SectorSelectionRow) => (
          <span className="num text-[var(--text-secondary)]">{r.sector_stock_count_s33 ?? '—'}</span>
        ),
      },
    ],
    [changes, rankDeltas, deltaPeriod],
  )

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 flex-wrap">
        <p className="text-sm font-semibold text-[var(--text-primary)]">セクター選別ランキング</p>
        <span className="ml-auto">
          <MoversOnlyToggle
            checked={moversOnly}
            onChange={setMoversOnly}
            count={moverCount}
          />
        </span>
        <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={hideLowConf}
            onChange={e => setHideLowConf(e.target.checked)}
            className="accent-[var(--accent)]"
          />
          信頼度低 (銘柄数&lt;10) を除外
          {lowConfCount > 0 && (
            <span className="text-[var(--text-muted)]">（<span className="font-mono">{lowConfCount}</span> 件）</span>
          )}
        </label>
        <span className="text-caption text-[var(--text-muted)]">
          <span className="num">{filtered.length}</span> セクター
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-[var(--bg-card)] rounded-xl border-[0.5px] border-[var(--border)] py-10 text-center text-[var(--text-muted)] text-small">
          {moversOnly
            ? `${deltaPeriod.toUpperCase()} で ±${BIG_MOVE_THRESHOLD}位以上動いたセクターはありません`
            : 'データがありません'}
        </div>
      ) : (
        <DataTable
          rows={filtered}
          columns={columns}
          rowKey={r => r.sector_name_s33}
          defaultSort={{ key: 'rank', dir: 'asc' }}
          // 行のどこを押しても内訳が開く（専用ボタンは置かない）
          expandOnRowClick
          renderDetail={row => <DrilldownBody row={row} />}
          // 大きく動いた行は左端に色帯を立てる（上昇=緑 / 下落=赤 / 新規=注目色）
          rail={row => {
            const d = rankDeltas[row.sector_name_s33]
            if (!isBigMove(d)) return null
            if (d?.isNew) return 'var(--sem-focus-fg)'
            return (d?.delta ?? 0) > 0 ? 'var(--positive)' : 'var(--negative)'
          }}
          // 信頼度低（銘柄数が少なくノイズが大きい）は減光して沈める
          rowClassName={row => (row.confidence_low === 1 ? 'opacity-60' : '')}
          fullMinWidth={1100}
          summaryToggle={false}
        />
      )}

      {/* Legend */}
      <div className="flex items-center justify-center gap-5 py-3 text-[11px] border-t border-[var(--border-subtle)] flex-wrap">
        <span className="text-[var(--text-secondary)]">Score:</span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded" style={{ backgroundColor: 'var(--sem-strong-bg)' }} />
          <span style={{ color: 'var(--text-secondary)' }}>強 ≥60</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded" style={{ backgroundColor: 'var(--sem-ok-bg)' }} />
          <span style={{ color: 'var(--text-secondary)' }}>中 30-60</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded" style={{ backgroundColor: 'var(--sem-weak-bg)' }} />
          <span style={{ color: 'var(--text-secondary)' }}>弱 &lt;30</span>
        </span>
        <span className="text-gray-300">|</span>
        <span className="text-[var(--text-secondary)]">
          <span className="font-mono" style={{ color: 'var(--positive)' }}>▲</span>
          <span className="font-mono" style={{ color: 'var(--negative)' }}>▼</span>
          {` ${deltaPeriod.toUpperCase()} 前からの順位変動（±${BIG_MOVE_THRESHOLD}以上は色付き＋左端の帯）`}
        </span>
        <span className="text-gray-300">|</span>
        <span className="text-[var(--text-secondary)]">⚠️ confidence_low = 銘柄数&lt;10</span>
      </div>
    </div>
  )
}
