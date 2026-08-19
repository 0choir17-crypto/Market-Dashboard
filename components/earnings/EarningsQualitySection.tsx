'use client'

import { useMemo, useState } from 'react'
import type { CurPerType, EarningsQualityRow } from '@/types/earningsQuality'
import {
  CUR_PER_TYPES,
  PEAK_DAY_THRESHOLD,
  SCORE3_MAX,
  TOP_1PCT_THRESHOLD,
  classifyScoreData,
  hasGuideAxis,
  hasQoq,
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
      : `${row.cur_per_type} 構造的最高 (${max}/${max})`
    : `${row.score3} / ${max}`
  const capNote = hasGuideAxis(row.cur_per_type)
    ? hasQoq(row.cur_per_type)
      ? null
      : '※ 1Q は QoQ 2軸が計算不能なため上限 7 (2Q/3Q は 9)'
    : '※ FY は修正対象の通期予想が無く s_guide が常に 0 → 上限 7'
  const title = [
    headline,
    score3Breakdown(row),
    capNote,
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

// ── 配当セル (>=10 で「大」★) ─────────────────────────────────────────────
// s_div の根拠は 1Q-3Q / FY で同じ div_change_pct 列だが意味が違う:
//   1Q-3Q … 年間配当「予想」の増減率 (= 増配)
//   FY    … 実績年間配当 vs 同 FY 直近予想 (= 期末の配当上積み)
// FY は素の前期比 (div_yoy_pct) も併記しないと「上積み 0% = 減配」と誤読されるため
// 2 段表示にする。上段が常にスコア根拠、下段は FY のみの参考値。
function DivCell({ row }: { row: EarningsQualityRow }) {
  const isFy = row.cur_per_type === 'FY'
  const v = row.div_change_pct
  const scoreLabel = isFy
    ? '配当上積み (実績年間配当 vs 同FY直近予想) — s_div の根拠'
    : '年間配当予想の増減率 — s_div の根拠'
  const main = !isNum(v) ? (
    <span className="text-gray-400 text-xs" title={scoreLabel}>
      —
    </span>
  ) : (
    <span
      className="font-mono tabular-nums text-xs"
      style={{ color: pctColor(v), fontWeight: v >= 10 ? 700 : 500 }}
      title={scoreLabel}
    >
      {v > 0 ? '+' : ''}
      {v.toFixed(1)}%
      {v >= 10 && <span className="ml-0.5 text-[9px]">★</span>}
    </span>
  )

  if (!isFy) return main

  return (
    <div className="flex flex-col items-end leading-tight">
      {main}
      <span
        className="font-mono tabular-nums text-[10px]"
        style={{ color: pctColor(row.div_yoy_pct) }}
        title="div_yoy_pct — 実績年間配当の前期比 % (FY 専用・スコア非対象)"
      >
        {isNum(row.div_yoy_pct) ? `前期比 ${fmtPct(row.div_yoy_pct)}` : '前期比 —'}
      </span>
    </div>
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
          <span className="text-gray-300" title="1Q は前 Q 同 FY が無く QoQ 計算不能">
            n/a
          </span>
        ) : (
          fmtPct(qoq)
        )}
      </span>
    </div>
  )
}

// ── 通期 OP セル ───────────────────────────────────────────────────────────
// 1Q-3Q … fop_rev_pct (通期 OP 予想の修正率) = s_guide の根拠。加点分を併記。
// FY    … 修正すべき通期予想が無く fop_rev_pct は常に NULL。代わりに着地 beat
//         (op_beat_pct) を出す。翌期 OP 予想の伸び (nx_op_growth_pct) は供給側の
//         検証でエッジ無しと判定されスコア非対象なので、列は増やさず title に出す。
function OpCell({ row }: { row: EarningsQualityRow }) {
  if (row.cur_per_type === 'FY') {
    const nx = isNum(row.nx_op_growth_pct)
      ? `\n翌期 OP 予想の伸び ${fmtPct(row.nx_op_growth_pct)} (スコア非対象 — 供給側の検証で無効)`
      : ''
    if (!isNum(row.op_beat_pct)) {
      return (
        <span className="text-gray-400 text-xs" title={`FY は通期予想修正の対象外${nx}`}>
          —
        </span>
      )
    }
    return (
      <span
        className="font-mono tabular-nums text-xs"
        style={{ color: pctColor(row.op_beat_pct) }}
        title={`op_beat_pct — 当期実績 OP ÷ 同FY直近予想 − 1 (着地 beat)。FY はスコア非対象${nx}`}
      >
        着地 {fmtPct(row.op_beat_pct)}
      </span>
    )
  }
  // s_guide >= 1 → 通期予想修正がスコアに効いている行。根拠として強調。
  const guideScored = isNum(row.s_guide) && row.s_guide >= 1
  return (
    <span
      className="font-mono tabular-nums text-xs"
      style={{ color: pctColor(row.fop_rev_pct), fontWeight: guideScored ? 700 : 500 }}
      title={guideScored ? `通期予想修正でスコア +${row.s_guide} (s_guide)` : undefined}
    >
      {fmtPct(row.fop_rev_pct)}
      {guideScored && <span className="ml-0.5 text-[9px] text-emerald-600">+{row.s_guide}</span>}
    </span>
  )
}

// ── 進捗超過セル ───────────────────────────────────────────────────────────
// FY は「通期に対する進捗」という概念が無く常に NULL。データ欠損と区別する。
function ProgressCell({ row }: { row: EarningsQualityRow }) {
  const v = row.progress_excess_pct
  if (!isNum(v)) {
    return row.cur_per_type === 'FY' ? (
      <span className="text-gray-300 text-[10px]" title="FY (通期本決算) は進捗の概念が無いため対象外">
        対象外
      </span>
    ) : (
      <span className="text-gray-400">—</span>
    )
  }
  return (
    <span className="font-mono tabular-nums text-xs" style={{ color: pctColor(v) }}>
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

// Q バッジ色。FY は四半期と質が違う (本決算) ので独立した色を割り当てる。
function qBadgeClass(q: CurPerType): string {
  switch (q) {
    case '1Q':
      return 'bg-blue-50 text-blue-700'
    case '2Q':
      return 'bg-purple-50 text-purple-700'
    case '3Q':
      return 'bg-orange-50 text-orange-700'
    case 'FY':
      return 'bg-rose-100 text-rose-800'
    default:
      return 'bg-gray-100 text-gray-600'
  }
}

// ── 行 (1 銘柄) ───────────────────────────────────────────────────────────
function Row({ row }: { row: EarningsQualityRow }) {
  const noQoq = !hasQoq(row.cur_per_type)
  const max = maxScoreFor(row.cur_per_type)
  const isPerfect = row.score3 >= max
  const isTop1pct = isNum(row.pct_rank_in_day) && row.pct_rank_in_day <= TOP_1PCT_THRESHOLD
  const qGroup = qGroupOf(row.cur_per_type)

  return (
    <tr
      className={`border-b border-[var(--border-subtle)] transition-colors hover:bg-[var(--bg-card-hover)] ${
        isPerfect ? 'bg-emerald-50/60' : 'bg-[var(--bg-card)]'
      }`}
    >
      <td
        className="px-2 py-2 text-center font-mono text-xs text-gray-500 tabular-nums"
        title={`当日の ${qGroup} グループ内での順位 (1Q / 2Q3Q / FY は上限点が違うため別ランキング。同じ日に 1 位が最大 3 行出ます)`}
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
        <YoyQoqCell yoy={row.sales_yoy_pct} qoq={row.sales_qoq_pct} q1Note={noQoq} />
      </td>
      <td className="px-2 py-2 text-right">
        <YoyQoqCell yoy={row.eps_yoy_pct} qoq={row.eps_qoq_pct} q1Note={noQoq} />
      </td>
      <td className="px-2 py-2 text-right whitespace-nowrap">
        <DivCell row={row} />
      </td>
      <td className="px-2 py-2 text-right whitespace-nowrap">
        <OpCell row={row} />
      </td>
      <td className="px-2 py-2 text-right whitespace-nowrap">
        <ProgressCell row={row} />
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
          className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold ${qBadgeClass(
            row.cur_per_type,
          )}`}
          title={
            row.cur_per_type === 'FY'
              ? 'FY = 通期本決算。増配軸は「期末の配当上積み」、通期予想修正軸は対象外 (上限 7 点)'
              : undefined
          }
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

// ソート用の値。「通期 OP」列は FY で fop_rev_pct が常に NULL のため表示値
// (op_beat_pct) を返す。意味は違うが、列に出ている値と並び順を一致させる方が
// 誤解が少ない (FY と四半期が同日に混在するのは訂正開示くらいで稀)。
function sortValue(row: EarningsQualityRow, key: SortKey): number | null | undefined {
  if (key === 'fop_rev_pct' && row.cur_per_type === 'FY') return row.op_beat_pct
  return row[key] as number | null | undefined
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

  // ── フィルタ state ──
  // Q は「未選択 = 全件」。FY が加わって 1 つの表に本決算と四半期が混ざるように
  // なったため、指標の意味が違う FY を切り分けられるようにする。
  const [qSelected, setQSelected] = useState<Set<CurPerType>>(new Set())
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

  // 当日に存在する Q のみをチップに出す (FY 単独日に 1Q-3Q のチップは不要)
  const qOptions = useMemo(() => {
    const present = new Set(rows.map(r => r.cur_per_type))
    const known = CUR_PER_TYPES.filter(q => present.has(q))
    const unknown = Array.from(present)
      .filter(q => !CUR_PER_TYPES.includes(q))
      .sort()
    return [...known, ...unknown]
  }, [rows])

  const sectorOptions = useMemo(
    () =>
      Array.from(
        new Set(rows.map(r => r.sector_s33).filter((s): s is string => !!s)),
      ).sort((a, b) => a.localeCompare(b, 'ja')),
    [rows],
  )

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (qSelected.size > 0 && !qSelected.has(r.cur_per_type)) return false
      if (sectorSelected.size > 0 && (!r.sector_s33 || !sectorSelected.has(r.sector_s33))) {
        return false
      }
      return true
    })
  }, [rows, qSelected, sectorSelected])

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
        const aRaw = sortValue(a, sortKey)
        const bRaw = sortValue(b, sortKey)
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

      {/* ── フィルタ UI（Q / セクター）────────────────────────────── */}
      {(qOptions.length > 1 || sectorOptions.length > 0) && (
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-4 mb-5 space-y-3">
          {/* Q が 1 種類しか無い日はチップを出しても意味が無いので隠す */}
          {qOptions.length > 1 && (
            <div className="flex flex-wrap items-start gap-2">
              <span className="text-[11px] font-semibold text-gray-500 uppercase w-14 shrink-0 mt-1">
                Q
              </span>
              <div className="flex flex-wrap gap-1.5 flex-1">
                {qOptions.map(q => (
                  <ChipFilter
                    key={q}
                    label={q === 'FY' ? 'FY (本決算)' : q}
                    selected={qSelected.has(q)}
                    onToggle={() => setQSelected(toggleSet(qSelected, q))}
                  />
                ))}
                {qSelected.size > 0 && (
                  <button
                    onClick={() => setQSelected(new Set())}
                    className="text-[10px] text-gray-400 hover:text-gray-600"
                  >
                    クリア
                  </button>
                )}
              </div>
            </div>
          )}
          {sectorOptions.length > 0 && (
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
          )}
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
              <SortTh label="順位" tooltip="rank_in_day — 当日の 1Q / 2Q3Q / FY それぞれの中での score3 降順順位 (1=トップ)。上限点が違う群を混ぜないための分割で、同じ日に 1 位が最大 3 行出ます" sortKey="rank_in_day" {...sp} align="center" className="w-16" />
              <SortTh label="Score" tooltip="score3 = s_div + s_eps + s_sales + s_guide (0-9)。1Q は QoQ 2軸が、FY は予想修正軸が構造的に無く最大 7 — 表示は常に score/最大点" sortKey="score3" {...sp} align="center" className="w-20" />
              <th className="px-2 py-2.5 text-xs font-medium uppercase tracking-wide text-left text-[var(--text-secondary)]">Verdict</th>
              <th className="px-2 py-2.5 text-xs font-medium uppercase tracking-wide text-left text-[var(--text-secondary)] w-20">Code</th>
              <SortTh label="銘柄名" sortKey="co_name" {...sp} align="left" className="min-w-[180px]" />
              <SortTh label="セクター" sortKey="sector_s33" {...sp} align="left" className="min-w-[110px]" />
              <SortTh label="売上 YoY/QoQ" tooltip="上: sales_yoy_pct (単Q 前年同期比 %) / 下: sales_qoq_pct (前期単Q比 %)" sortKey="sales_yoy_pct" {...sp} />
              <SortTh label="EPS YoY/QoQ" tooltip="上: eps_yoy_pct (単Q 前年同期比 %) / 下: eps_qoq_pct (前期単Q比 %。1Q は計算不能で n/a)" sortKey="eps_yoy_pct" {...sp} />
              <SortTh label="配当" tooltip="div_change_pct — s_div の根拠。1Q-3Q は年間配当予想の増減率 % / FY は期末の配当上積み (実績年間配当 vs 同FY直近予想)。>=10 で「大」★。FY は実績の前期比 (div_yoy_pct) を下段に併記" sortKey="div_change_pct" {...sp} />
              <SortTh label="通期 OP" tooltip="1Q-3Q: fop_rev_pct — 通期予想 OP 上方修正率 % (同 FY 前回 FOP 比)。s_guide 軸の根拠で、加点された行は太字＋加点数を表示。FY: 修正対象の通期予想が無いため代わりに op_beat_pct (着地 beat) をスコア非対象として表示" sortKey="fop_rev_pct" {...sp} />
              <SortTh label="進捗超過" tooltip="progress_excess_pct — 実進捗 − 期待ペース (pt)。FY は進捗の概念が無く対象外" sortKey="progress_excess_pct" {...sp} />
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
          <span
            className="flex items-center gap-1 text-gray-600"
            title="1Q は QoQ 2軸、FY は通期予想修正軸が構造的に無いため上限 7 点。満点色は 7/7 で付きます"
          >
            <span className={`px-1.5 rounded-full text-[10px] font-mono font-semibold ${qBadgeClass('FY')}`}>
              FY
            </span>
            1Q・FY は上限 7 点
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
