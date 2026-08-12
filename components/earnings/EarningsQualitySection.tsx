'use client'

import { useMemo, useState } from 'react'
import type { EarningsQualityRow } from '@/types/earningsQuality'
import {
  PEAK_DAY_THRESHOLD,
  SCORE3_MAX,
  TOP_1PCT_THRESHOLD,
  classifyScoreData,
  isAfterClose,
  isLegacyScoreRow,
  maxScoreFor,
  pctColor,
  qGroupOf,
  score3Breakdown,
  score3Color,
} from '@/types/earningsQuality'
import type { EarningsQualitySnapshot } from '@/lib/earningsQualityFetch'
import { formatPct } from '@/lib/format'
import { shikihoUrl, tradingViewUrl } from '@/lib/tickerLinks'
import Tooltip from '@/components/shared/Tooltip'

type SortKey =
  | 'rank_in_day'
  | 'score3'
  | 'co_name'
  | 'sector_s33'
  | 'div_change_pct'
  | 'eps_yoy_pct'
  | 'sales_yoy_pct'
  | 'fop_rev_pct'
  | 'progress_excess_pct'
  | 'turnover_oku'
type SortDir = 'asc' | 'desc'

function isNum(v: number | null | undefined): v is number {
  return v != null && Number.isFinite(v)
}

// 符号付き % は lib/format.ts に委譲
function fmtPct(v: number | null | undefined, decimals = 1): string {
  return formatPct(v, { digits: decimals, sign: true })
}

function fmtNum(v: number | null | undefined, decimals = 1): string {
  return isNum(v) ? v.toFixed(decimals) : '—'
}

// ── Score3 バッジ ──────────────────────────────────────────────────────────
// title に 4 軸の内訳を出し、列を増やさずに s_guide まで根拠が読めるようにする。
function Score3Badge({ row }: { row: EarningsQualityRow }) {
  const { bg, text, border } = score3Color(row.score3, row.cur_per_type)
  const max = maxScoreFor(row.cur_per_type)
  const isPerfect = row.score3 >= max
  const isLegacy = isLegacyScoreRow(row)
  const headline = isPerfect
    ? max === SCORE3_MAX
      ? `パーフェクト (${SCORE3_MAX}/${SCORE3_MAX})`
      : `Q1 構造的最高 (${max}/${max})`
    : `${row.score3} / ${max}`
  const title = [
    headline,
    score3Breakdown(row),
    isLegacy ? '※ 旧スコア (0-7 / 予想軸なし) — 供給側の再計算前の行です' : null,
  ]
    .filter(Boolean)
    .join('\n')
  return (
    <span
      className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full font-mono text-xs font-bold tabular-nums"
      style={{ backgroundColor: bg, color: text, border: `1px solid ${border}` }}
      title={title}
    >
      {row.score3}
      <span className="text-[9px] opacity-60">/{max}</span>
      {isLegacy && <span className="text-[9px] font-normal opacity-70">旧</span>}
    </span>
  )
}

// ── 増配率セル (>=10 で「増配大」) ────────────────────────────────────────
function DivCell({ v }: { v: number | null | undefined }) {
  if (!isNum(v)) return <span className="text-gray-400">—</span>
  const color = pctColor(v)
  const isLarge = v >= 10
  return (
    <span className="font-mono tabular-nums text-xs" style={{ color, fontWeight: isLarge ? 700 : 500 }}>
      {v > 0 ? '+' : ''}
      {v.toFixed(1)}%
      {isLarge && <span className="ml-0.5 text-[9px]">★</span>}
    </span>
  )
}

// ── YoY/QoQ 2 値セル (上が YoY, 下が QoQ) ─────────────────────────────────
// YoY は「単Q の前年同期比」であって累計 (期初からの累計) 比ではない。
function YoyQoqCell({
  yoy,
  qoq,
  q1Note,
}: {
  yoy: number | null | undefined
  qoq: number | null | undefined
  q1Note?: boolean
}) {
  return (
    <div className="flex flex-col items-end leading-tight">
      <span
        className="font-mono tabular-nums text-xs"
        style={{ color: pctColor(yoy), fontWeight: isNum(yoy) && yoy > 0 ? 600 : 500 }}
      >
        {fmtPct(yoy)}
      </span>
      <span
        className="font-mono tabular-nums text-[10px]"
        style={{ color: pctColor(qoq) }}
      >
        {q1Note && !isNum(qoq) ? (
          <span className="text-gray-300" title="Q1 は QoQ 計算不能">
            Q1
          </span>
        ) : (
          fmtPct(qoq)
        )}
      </span>
    </div>
  )
}

// ── 進捗超過セル ───────────────────────────────────────────────────────────
function ProgressCell({ v }: { v: number | null | undefined }) {
  if (!isNum(v)) return <span className="text-gray-400">—</span>
  const color = pctColor(v)
  return (
    <span className="font-mono tabular-nums text-xs" style={{ color }}>
      {v > 0 ? `先行 +${v.toFixed(1)}pt` : v < 0 ? `遅延 ${v.toFixed(1)}pt` : '0pt'}
    </span>
  )
}

// ── 開示時刻セル (引け後は強調) ──────────────────────────────────────────
function DiscTimeCell({ t }: { t: string | null }) {
  if (!t) return <span className="text-gray-400 text-xs">—</span>
  const afterClose = isAfterClose(t)
  return (
    <span
      className={`font-mono text-xs ${afterClose ? 'font-bold text-amber-700' : 'text-gray-600'}`}
      title={afterClose ? '引け後開示 → 翌営業日 (D+1) 寄り対象' : undefined}
    >
      {t}
      {afterClose && <span className="ml-0.5 text-[9px]">⏰</span>}
    </span>
  )
}

// ── ソート可能ヘッダ ───────────────────────────────────────────────────────
function SortTh({
  label,
  tooltip,
  sortKey,
  currentKey,
  currentDir,
  onSort,
  align = 'right',
  className = '',
}: {
  label: string
  tooltip?: string
  sortKey: SortKey
  currentKey: SortKey
  currentDir: SortDir
  onSort: (k: SortKey) => void
  align?: 'left' | 'right' | 'center'
  className?: string
}) {
  const active = currentKey === sortKey
  const indicator = active ? (currentDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'
  const alignClass =
    align === 'left' ? 'text-left' : align === 'center' ? 'text-center' : 'text-right'
  const inner = tooltip ? <Tooltip content={tooltip}>{label}</Tooltip> : <>{label}</>
  return (
    <th
      onClick={() => onSort(sortKey)}
      aria-sort={active ? (currentDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`px-2 py-2.5 text-xs font-medium uppercase tracking-wide whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 transition-colors ${alignClass} ${
        active ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'
      } ${className}`}
    >
      {inner}
      <span className="text-[10px] opacity-50">{indicator}</span>
    </th>
  )
}

// ── 行 (1 銘柄) ───────────────────────────────────────────────────────────
function Row({ row }: { row: EarningsQualityRow }) {
  const isQ1 = row.cur_per_type === '1Q'
  const max = maxScoreFor(row.cur_per_type)
  const isPerfect = row.score3 >= max
  const isTop1pct = isNum(row.pct_rank_in_day) && row.pct_rank_in_day <= TOP_1PCT_THRESHOLD
  const qGroup = qGroupOf(row.cur_per_type)
  // s_guide >= 1 → 通期予想修正がスコアに効いている行。根拠列 (通期 OP) を強調。
  const guideScored = isNum(row.s_guide) && row.s_guide >= 1

  return (
    <tr
      className={`border-b border-[var(--border-subtle)] transition-colors hover:bg-[var(--bg-card-hover)] ${
        isPerfect ? 'bg-emerald-50/60' : 'bg-[var(--bg-card)]'
      }`}
    >
      <td
        className="px-2 py-2 text-center font-mono text-xs text-gray-500 tabular-nums"
        title={`当日の ${qGroup} グループ内での順位 (1Q / 2Q3Q は別ランキング)`}
      >
        <div className="flex flex-col items-center leading-tight">
          <span>
            {row.rank_in_day ?? '—'}
            {isTop1pct && (
              <span
                title="当日 Q別 Top 1% (検証 end_per_risk 1.131 / +20%到達 28.9%)"
                className="ml-0.5 text-amber-500"
              >
                ⭐
              </span>
            )}
          </span>
          <span className="text-[9px] text-gray-400">{qGroup}</span>
        </div>
      </td>
      <td className="px-2 py-2 text-center whitespace-nowrap">
        <Score3Badge row={row} />
      </td>
      <td className="px-2 py-2 whitespace-nowrap text-[11px] text-gray-700">
        {row.verdict ?? <span className="text-gray-400">—</span>}
      </td>
      <td className="px-2 py-2 whitespace-nowrap">
        <a
          href={tradingViewUrl(row.code)}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-xs text-[var(--accent)] hover:underline"
        >
          {row.code}
        </a>
      </td>
      <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-800 max-w-[200px] truncate">
        <a
          href={shikihoUrl(row.code)}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
          title={row.co_name ?? undefined}
        >
          {row.co_name ?? '—'}
        </a>
      </td>
      <td className="px-2 py-2 whitespace-nowrap text-[11px] text-gray-600">
        {row.sector_s33 ?? <span className="text-gray-400">—</span>}
      </td>
      <td className="px-2 py-2 text-right">
        <YoyQoqCell yoy={row.sales_yoy_pct} qoq={row.sales_qoq_pct} q1Note={isQ1} />
      </td>
      <td className="px-2 py-2 text-right">
        <YoyQoqCell yoy={row.eps_yoy_pct} qoq={row.eps_qoq_pct} q1Note={isQ1} />
      </td>
      <td className="px-2 py-2 text-right whitespace-nowrap">
        <DivCell v={row.div_change_pct} />
      </td>
      <td className="px-2 py-2 text-right whitespace-nowrap">
        <span
          className="font-mono tabular-nums text-xs"
          style={{ color: pctColor(row.fop_rev_pct), fontWeight: guideScored ? 700 : 500 }}
          title={guideScored ? `通期予想修正でスコア +${row.s_guide} (s_guide)` : undefined}
        >
          {fmtPct(row.fop_rev_pct)}
          {guideScored && <span className="ml-0.5 text-[9px] text-emerald-600">+{row.s_guide}</span>}
        </span>
      </td>
      <td className="px-2 py-2 text-right whitespace-nowrap">
        <ProgressCell v={row.progress_excess_pct} />
      </td>
      <td className="px-2 py-2 text-right font-mono text-xs text-gray-700 tabular-nums">
        {fmtNum(row.close, 0)}
      </td>
      <td className="px-2 py-2 text-right font-mono text-xs text-gray-700 tabular-nums">
        {isNum(row.turnover_oku) ? `${row.turnover_oku.toFixed(1)}億` : '—'}
      </td>
      <td className="px-2 py-2 text-center text-xs">
        {row.above_sma200 === true ? (
          <span className="text-[var(--positive)]" title=">200日SMA">
            ✓
          </span>
        ) : row.above_sma200 === false ? (
          <span className="text-[var(--negative)]" title="<200日SMA">
            ✗
          </span>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
      <td className="px-2 py-2 text-center">
        <DiscTimeCell t={row.disc_time} />
      </td>
      <td className="px-2 py-2 text-center">
        <span
          className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold ${
            isQ1
              ? 'bg-blue-50 text-blue-700'
              : row.cur_per_type === '2Q'
                ? 'bg-purple-50 text-purple-700'
                : 'bg-orange-50 text-orange-700'
          }`}
        >
          {row.cur_per_type}
        </span>
      </td>
    </tr>
  )
}

// ── マルチセレクトチップ ───────────────────────────────────────────────────
function ChipFilter({
  label,
  selected,
  onToggle,
}: {
  label: string
  selected: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className={`text-[11px] px-2 py-1 rounded border transition-colors ${
        selected
          ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
          : 'bg-[var(--bg-card)] text-gray-600 border-gray-200 hover:bg-[var(--bg-card-hover)]'
      }`}
    >
      {label}
    </button>
  )
}

// ── メインセクション ───────────────────────────────────────────────────────
export default function EarningsQualitySection({
  snapshot,
}: {
  snapshot: EarningsQualitySnapshot
}) {
  const { rows, latestDate, eventsInDay } = snapshot
  const isPeakDay = eventsInDay >= PEAK_DAY_THRESHOLD
  const scoreData = useMemo(() => classifyScoreData(rows), [rows])

  // ── フィルタ state（セクターのみ）──
  const [sectorSelected, setSectorSelected] = useState<Set<string>>(new Set())
  const [sortKey, setSortKey] = useState<SortKey>('score3')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  function toggleSet<T>(s: Set<T>, v: T): Set<T> {
    const ns = new Set(s)
    if (ns.has(v)) ns.delete(v)
    else ns.add(v)
    return ns
  }

  function handleSort(k: SortKey) {
    if (sortKey === k) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(k)
      setSortDir(k === 'rank_in_day' || k === 'co_name' || k === 'sector_s33' ? 'asc' : 'desc')
    }
  }

  const sectorOptions = useMemo(
    () =>
      Array.from(
        new Set(rows.map(r => r.sector_s33).filter((s): s is string => !!s)),
      ).sort((a, b) => a.localeCompare(b, 'ja')),
    [rows],
  )

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (sectorSelected.size > 0 && (!r.sector_s33 || !sectorSelected.has(r.sector_s33))) {
        return false
      }
      return true
    })
  }, [rows, sectorSelected])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      let av: number | string
      let bv: number | string
      if (sortKey === 'rank_in_day') {
        av = a.rank_in_day ?? Number.POSITIVE_INFINITY
        bv = b.rank_in_day ?? Number.POSITIVE_INFINITY
      } else if (sortKey === 'co_name') {
        const cmp = (a.co_name ?? '').localeCompare(b.co_name ?? '', 'ja')
        return sortDir === 'asc' ? cmp : -cmp
      } else if (sortKey === 'sector_s33') {
        const cmp = (a.sector_s33 ?? '').localeCompare(b.sector_s33 ?? '', 'ja')
        return sortDir === 'asc' ? cmp : -cmp
      } else {
        const aRaw = a[sortKey] as number | null | undefined
        const bRaw = b[sortKey] as number | null | undefined
        av = isNum(aRaw) ? aRaw : Number.NEGATIVE_INFINITY
        bv = isNum(bRaw) ? bRaw : Number.NEGATIVE_INFINITY
      }
      if (av === bv) {
        // tie-break: rank_in_day asc → score3 desc → code asc
        // rank_in_day は Q グループ別なので同値が並ぶ (同じ日に 1 位が 2 行)。
        // score3 と code まで見て順序を決定的にする。
        const ar = a.rank_in_day ?? Number.POSITIVE_INFINITY
        const br = b.rank_in_day ?? Number.POSITIVE_INFINITY
        if (ar !== br) return ar - br
        if (a.score3 !== b.score3) return b.score3 - a.score3
        return a.code.localeCompare(b.code)
      }
      return sortDir === 'asc' ? (av > bv ? 1 : -1) : av < bv ? 1 : -1
    })
    return arr
  }, [filtered, sortKey, sortDir])

  const sp = { currentKey: sortKey, currentDir: sortDir, onSort: handleSort }

  return (
    <>
      {/* ── サマリ カード（開示件数のみ）───────────────────────────── */}
      <section className="mb-5 max-w-[200px]">
        <StatCard label="開示件数" value={`${eventsInDay}`} sub={latestDate ?? ''} />
      </section>

      {/* ── 旧スコア (v2 バックフィル前) の注意 ─────────────────────── */}
      {scoreData.state !== 'ok' && (
        <div className="mb-5 px-4 py-2.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-sm flex items-start gap-2">
          <span className="text-base leading-tight">⚠️</span>
          <div>
            {scoreData.state === 'column-missing' ? (
              <>
                <p className="font-semibold">スコアの内訳 (s_guide) が取得できません</p>
                <p className="text-xs text-amber-800 mt-0.5">
                  Supabase の <code className="font-mono">earnings_quality</code> に{' '}
                  <code className="font-mono">s_guide</code> 列がありません。
                  表示中のスコアは旧 0-7 スケールの可能性があります
                  (<code className="font-mono">ALTER TABLE earnings_quality ADD COLUMN IF NOT EXISTS s_guide INTEGER;</code>)。
                </p>
              </>
            ) : scoreData.state === 'legacy' ? (
              <>
                <p className="font-semibold">この日は旧スコア (0-7 / 3軸) のままです</p>
                <p className="text-xs text-amber-800 mt-0.5">
                  通期予想修正軸 (s_guide) が未計算のため、満点・色の判定は 0-9 スケールでは正しく出ません。
                  供給側スキャナーを再実行するとこの日が新スコアに置き換わります。
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold">
                  新旧スコアが混在しています — {rows.length} 件中 {scoreData.legacyCount} 件が旧スコア (0-7 / 3軸)
                </p>
                <p className="text-xs text-amber-800 mt-0.5">
                  「旧」印の付いた行は通期予想修正軸 (s_guide) が未計算のため、他行と同じ土俵で比較できません。
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {isPeakDay && (
        <div className="mb-5 px-4 py-2.5 rounded-lg bg-purple-50 border border-purple-200 text-purple-800 text-sm flex items-center gap-2">
          <span className="text-base">🔥</span>
          <span className="font-semibold">集中日 (ピーク)</span>
          <span className="text-xs text-purple-700">
            開示 {eventsInDay} 件 ≥ {PEAK_DAY_THRESHOLD} — 検証で Top の質が高い日
          </span>
        </div>
      )}

      {/* ── フィルタ UI（セクターのみ）──────────────────────────── */}
      {sectorOptions.length > 0 && (
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-4 mb-5">
          <div className="flex flex-wrap items-start gap-2">
            <span className="text-[11px] font-semibold text-gray-500 uppercase w-14 shrink-0 mt-1">
              セクター
            </span>
            <div className="flex flex-wrap gap-1.5 flex-1">
              {sectorOptions.map(s => (
                <ChipFilter
                  key={s}
                  label={s}
                  selected={sectorSelected.has(s)}
                  onToggle={() => setSectorSelected(toggleSet(sectorSelected, s))}
                />
              ))}
              {sectorSelected.size > 0 && (
                <button
                  onClick={() => setSectorSelected(new Set())}
                  className="text-[10px] text-gray-400 hover:text-gray-600"
                >
                  クリア
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── テーブル ────────────────────────────────────────────── */}
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm overflow-x-auto">
        <div className="flex items-center gap-3 px-4 pt-4 pb-3">
          <p className="text-sm font-semibold text-[var(--text-primary)]">品質スコア ランキング</p>
          <span className="ml-auto text-xs text-[var(--text-muted)]">
            <span className="font-mono">{sorted.length} / {rows.length}</span> 件表示
          </span>
        </div>

        <table className="w-full min-w-[1500px] text-sm">
          <thead>
            <tr className="bg-[var(--bg-card-hover)] border-y border-[var(--border)]">
              <SortTh label="順位" tooltip="rank_in_day — 当日の 1Q / 2Q3Q それぞれの中での score3 降順順位 (1=トップ)。同じ日に 1 位が 2 行出ます" sortKey="rank_in_day" {...sp} align="center" className="w-16" />
              <SortTh label="Score" tooltip="score3 = s_div + s_eps + s_sales + s_guide (0-9, Q1 は QoQ 2軸が構造的に無く最大 7)" sortKey="score3" {...sp} align="center" className="w-20" />
              <th className="px-2 py-2.5 text-xs font-medium uppercase tracking-wide text-left text-[var(--text-secondary)]">Verdict</th>
              <th className="px-2 py-2.5 text-xs font-medium uppercase tracking-wide text-left text-[var(--text-secondary)] w-20">Code</th>
              <SortTh label="銘柄名" sortKey="co_name" {...sp} align="left" className="min-w-[180px]" />
              <SortTh label="セクター" sortKey="sector_s33" {...sp} align="left" className="min-w-[110px]" />
              <SortTh label="売上 YoY/QoQ" tooltip="上: sales_yoy_pct (単Q 前年同期比 %) / 下: sales_qoq_pct (前期単Q比 %)" sortKey="sales_yoy_pct" {...sp} />
              <SortTh label="EPS YoY/QoQ" tooltip="上: eps_yoy_pct (単Q 前年同期比 %) / 下: eps_qoq_pct (前期単Q比 %。Q1 は QoQ なし)" sortKey="eps_yoy_pct" {...sp} />
              <SortTh label="増配率" tooltip="div_change_pct — 同 FY 前回 FDivAnn からの増配率 % (>=10 で「大」★)" sortKey="div_change_pct" {...sp} />
              <SortTh label="通期 OP" tooltip="fop_rev_pct — 通期予想 OP 上方修正率 % (同 FY 前回 FOP 比)。s_guide 軸の根拠 — 加点された行は太字＋加点数を表示" sortKey="fop_rev_pct" {...sp} />
              <SortTh label="進捗超過" tooltip="progress_excess_pct — 実進捗 − 期待ペース (pt)" sortKey="progress_excess_pct" {...sp} />
              <th className="px-2 py-2.5 text-xs font-medium uppercase tracking-wide text-right text-[var(--text-secondary)]">終値</th>
              <SortTh label="売買代金" tooltip="turnover_oku — 20 日平均売買代金 (億円)" sortKey="turnover_oku" {...sp} />
              <th className="px-2 py-2.5 text-xs font-medium uppercase tracking-wide text-center text-[var(--text-secondary)]">SMA200</th>
              <th className="px-2 py-2.5 text-xs font-medium uppercase tracking-wide text-center text-[var(--text-secondary)]">開示時刻</th>
              <th className="px-2 py-2.5 text-xs font-medium uppercase tracking-wide text-center text-[var(--text-secondary)]">Q</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(row => (
              <Row key={`${row.code}-${row.cur_per_type}`} row={row} />
            ))}
          </tbody>
        </table>

        {sorted.length === 0 && (
          <div className="py-10 text-center text-[var(--text-muted)] text-sm">
            条件に合う銘柄はありません — フィルタを緩めてください
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 py-3 text-[11px] border-t border-[var(--border-subtle)] flex-wrap">
          <span className="text-[var(--text-secondary)]">Score:</span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded" style={{ backgroundColor: '#86efac' }} />
            <span style={{ color: 'var(--text-secondary)' }}>満点</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded" style={{ backgroundColor: '#dcfce7' }} />
            <span style={{ color: 'var(--text-secondary)' }}>強 7-8</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded" style={{ backgroundColor: '#fef3c7' }} />
            <span style={{ color: 'var(--text-secondary)' }}>中 4-6</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded" style={{ backgroundColor: '#f3f4f6' }} />
            <span style={{ color: 'var(--text-secondary)' }}>弱 0-3</span>
          </span>
          <span className="text-gray-300">|</span>
          <span className="flex items-center gap-1 text-gray-600">
            <span className="text-amber-500">⭐</span> 当日 Q別 Top 1%
          </span>
          <span className="text-gray-300">|</span>
          <span className="flex items-center gap-1 text-amber-700">
            <span>⏰</span> 引け後開示 (D+1 寄り対象)
          </span>
        </div>
      </div>
    </>
  )
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent?: 'green' | 'blue' | 'amber'
}) {
  const accentColor =
    accent === 'green'
      ? 'text-[var(--positive)]'
      : accent === 'blue'
        ? 'text-[var(--accent)]'
        : accent === 'amber'
          ? 'text-[var(--neutral-color)]'
          : 'text-[var(--text-primary)]'
  return (
    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-3">
      <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wide font-medium">{label}</p>
      <p className={`text-2xl font-bold font-mono tabular-nums mt-1 ${accentColor}`}>{value}</p>
      {sub && <p className="text-[10px] text-[var(--text-muted)] mt-0.5 truncate" title={sub}>{sub}</p>}
    </div>
  )
}
