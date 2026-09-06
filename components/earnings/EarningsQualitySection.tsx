'use client'

import { useCallback, useMemo, useState } from 'react'
import type { CurPerType, EarningsQualityRow } from '@/types/earningsQuality'
import {
  CUR_PER_TYPES,
  PEAK_DAY_THRESHOLD,
  curPerTypeRank,
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
import DataTable, { type Column } from '@/components/shared/DataTable'
import TickerCell from '@/components/shared/TickerCell'


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
/**
 * 列定義を作る。
 *
 * 表の骨格（ソート・要約/詳細・行の装飾）は components/shared/DataTable.tsx が持つ。
 * ここは「どの列を、どう描くか」だけを持つ。
 *
 * 要約 7 列は「当日の全行を横断比較するための数値」に絞った（設計原則 3）。
 * 終値・売買代金・SMA200・開示時刻・セクター・Verdict・Q は 1 銘柄を決めるための
 * 情報なので詳細行に落とし、1500px の横スクロールを解消する。
 */
function buildColumns(
  dupMap: Map<string, DupInfo>,
  collapsed: boolean,
): Column<EarningsQualityRow>[] {
  return [
    {
      key: 'rank_in_day',
      label: '順位',
      tooltip:
        'rank_in_day — 当日の 1Q / 2Q3Q / FY それぞれの中での score3 降順順位 (1=トップ)。上限点が違う群を混ぜないための分割で、同じ日に 1 位が最大 3 行出ます',
      align: 'center',
      value: r => r.rank_in_day,
      defaultDir: 'asc',
      className: 'w-16',
      render: r => {
        const isTop1pct = isNum(r.pct_rank_in_day) && r.pct_rank_in_day <= TOP_1PCT_THRESHOLD
        return (
          <div className="flex flex-col items-center leading-tight num text-[var(--text-secondary)]">
            <span>
              {r.rank_in_day ?? '—'}
              {isTop1pct && (
                <span
                  title="当日 Q別 Top 1% (検証 end_per_risk 1.131 / +20%到達 28.9%)"
                  className="ml-0.5 text-[var(--sem-watch-fg)]"
                >
                  ★
                </span>
              )}
            </span>
            <span className="text-caption text-[var(--text-muted)]">{qGroupOf(r.cur_per_type)}</span>
          </div>
        )
      },
    },
    {
      key: 'score3',
      label: 'Score',
      tooltip:
        'score3 = s_div + s_eps + s_sales + s_guide (0-9)。1Q は QoQ 2軸が、FY は予想修正軸が構造的に無く最大 7 — 表示は常に score/最大点',
      align: 'center',
      value: r => r.score3,
      className: 'w-20',
      render: r => <Score3Badge row={r} />,
    },
    {
      key: 'code',
      label: 'Code / 銘柄名',
      tooltip: '銘柄コード → TradingView / 銘柄名 → 四季報',
      align: 'left',
      value: r => r.code,
      defaultDir: 'asc',
      render: r => {
        const dup = dupMap.get(r.code)
        return (
          <div className="flex items-center gap-1.5 min-w-0">
            <TickerCell code={r.code} name={r.co_name} />
            {dup && dup.count > 1 && (
              <span
                className="px-1 rounded text-caption bg-[var(--sem-idle-bg)] text-[var(--sem-idle-fg)] whitespace-nowrap shrink-0"
                title={
                  `同日に ${dup.count} 本の決算を開示 (${dup.types.join(' / ')})。` +
                  (collapsed
                    ? `\n最新の ${r.cur_per_type} を代表として表示中 — 他は「1銘柄1行」を解除すると出ます`
                    : '\n決算を延期していた企業がまとめて開示したケースなどで、いずれも別々の開示です')
                }
              >
                {collapsed ? `他${dup.count - 1}` : `同日${dup.count}`}
              </span>
            )}
          </div>
        )
      },
    },
    {
      key: 'sales_yoy_pct',
      label: '売上 YoY/QoQ',
      tooltip: '上: sales_yoy_pct (単Q 前年同期比 %) / 下: sales_qoq_pct (前期単Q比 %)',
      value: r => r.sales_yoy_pct,
      render: r => (
        <YoyQoqCell yoy={r.sales_yoy_pct} qoq={r.sales_qoq_pct} q1Note={!hasQoq(r.cur_per_type)} />
      ),
    },
    {
      key: 'eps_yoy_pct',
      label: 'EPS YoY/QoQ',
      tooltip:
        '上: eps_yoy_pct (単Q 前年同期比 %) / 下: eps_qoq_pct (前期単Q比 %。1Q は計算不能で n/a)',
      value: r => r.eps_yoy_pct,
      render: r => (
        <YoyQoqCell yoy={r.eps_yoy_pct} qoq={r.eps_qoq_pct} q1Note={!hasQoq(r.cur_per_type)} />
      ),
    },
    {
      key: 'div_change_pct',
      label: '配当',
      tooltip:
        'div_change_pct — s_div の根拠。1Q-3Q は年間配当予想の増減率 % / FY は期末の配当上積み (実績年間配当 vs 同FY直近予想)。>=10 で「大」。FY は実績の前期比 (div_yoy_pct) を下段に併記',
      value: r => r.div_change_pct,
      render: r => <DivCell row={r} />,
    },
    {
      key: 'fop_rev_pct',
      label: '通期 OP',
      tooltip:
        '1Q-3Q: fop_rev_pct — 通期予想 OP 上方修正率 % (同 FY 前回 FOP 比)。s_guide 軸の根拠で、加点された行は加点数を表示。FY: 修正対象の通期予想が無いため代わりに op_beat_pct (着地 beat) をスコア非対象として表示',
      value: r => r.fop_rev_pct,
      render: r => <OpCell row={r} />,
    },

    // ── ここから下は詳細行だけ（1 銘柄を決めるための情報）────────────────
    {
      key: 'progress_excess_pct',
      label: '進捗超過',
      tooltip: 'progress_excess_pct — 実進捗 − 期待ペース (pt)。FY は進捗の概念が無く対象外',
      summary: false,
      value: r => r.progress_excess_pct,
      render: r => <ProgressCell row={r} />,
    },
    {
      key: 'verdict',
      label: 'Verdict',
      summary: false,
      align: 'left',
      value: r => r.verdict,
      render: r => (
        <span className="text-small text-[var(--text-secondary)]">
          {r.verdict ?? <span className="text-[var(--sem-idle-fg)]">—</span>}
        </span>
      ),
    },
    {
      key: 'sector_s33',
      label: 'セクター',
      summary: false,
      align: 'left',
      value: r => r.sector_s33,
      render: r => (
        <span className="text-small text-[var(--text-secondary)]">
          {r.sector_s33 ?? <span className="text-[var(--sem-idle-fg)]">—</span>}
        </span>
      ),
    },
    {
      key: 'close',
      label: '終値',
      summary: false,
      value: r => r.close,
      render: r => <span className="num text-[var(--text-secondary)]">{fmtNum(r.close, 0)}</span>,
    },
    {
      key: 'turnover_oku',
      label: '売買代金',
      tooltip: 'turnover_oku — 20 日平均売買代金 (億円)',
      summary: false,
      value: r => r.turnover_oku,
      render: r => (
        <span className="num text-[var(--text-secondary)]">
          {isNum(r.turnover_oku) ? `${r.turnover_oku.toFixed(1)}億` : '—'}
        </span>
      ),
    },
    {
      key: 'above_sma200',
      label: 'SMA200',
      summary: false,
      align: 'center',
      render: r =>
        r.above_sma200 === true ? (
          <span className="text-[var(--positive)]" title=">200日SMA">
            上
          </span>
        ) : r.above_sma200 === false ? (
          <span className="text-[var(--negative)]" title="<200日SMA">
            下
          </span>
        ) : (
          <span className="text-[var(--sem-idle-fg)]">—</span>
        ),
    },
    {
      key: 'disc_time',
      label: '開示時刻',
      summary: false,
      align: 'center',
      render: r => <DiscTimeCell t={r.disc_time} />,
    },
    {
      key: 'cur_per_type',
      label: 'Q',
      summary: false,
      align: 'center',
      render: r => (
        <span
          className={`inline-block px-2 py-0.5 rounded-full text-caption num ${qBadgeClass(
            r.cur_per_type,
          )}`}
          title={
            r.cur_per_type === 'FY'
              ? 'FY = 通期本決算。増配軸は「期末の配当上積み」、通期予想修正軸は対象外 (上限 7 点)'
              : undefined
          }
        >
          {r.cur_per_type}
        </span>
      ),
    },
  ]
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

// ── 同一銘柄が同日に複数 Q を開示したケース ─────────────────────────────
// PK が (date, code, cur_per_type) なので、決算を延期していた企業が 1Q〜FY を
// まとめて開示すると同じ code が最大 4 行並ぶ (訂正開示 + 当期新規も同様)。
// データとしては正しいが、D+1 買い候補リストとしては 1 銘柄が上位を占有して
// しまうため、「1 銘柄 1 行」に畳めるようにする。
type DupInfo = { count: number; types: CurPerType[] }

// その日の全行 (フィルタ前) から code ごとの開示 Q を集計。フィルタで一部が
// 隠れても「この銘柄は同日に N 回開示している」事実は変わらないため rows 基準。
function buildDupMap(rows: EarningsQualityRow[]): Map<string, DupInfo> {
  const m = new Map<string, DupInfo>()
  for (const r of rows) {
    const cur = m.get(r.code)
    if (cur) {
      cur.count++
      cur.types.push(r.cur_per_type)
    } else {
      m.set(r.code, { count: 1, types: [r.cur_per_type] })
    }
  }
  for (const info of m.values()) {
    info.types.sort((a, b) => curPerTypeRank(a) - curPerTypeRank(b))
  }
  return m
}

// 代表行の選定: 最新の Q (FY > 3Q > 2Q > 1Q)。未知の Q 同士で並んだときだけ
// 開示時刻 → 相対スコアで決定的に決める。
function isMoreRecent(a: EarningsQualityRow, b: EarningsQualityRow): boolean {
  const ao = curPerTypeRank(a.cur_per_type)
  const bo = curPerTypeRank(b.cur_per_type)
  if (ao !== bo) return ao > bo
  const at = a.disc_time ?? ''
  const bt = b.disc_time ?? ''
  if (at !== bt) return at > bt
  return a.score3 / maxScoreFor(a.cur_per_type) > b.score3 / maxScoreFor(b.cur_per_type)
}

// 表示中の行を 1 銘柄 1 行に畳む。フィルタ後の集合に対して適用するので、
// 「1Q だけ表示」中に代表 (FY) が消えて行が丸ごと落ちる、ということは起きない。
function collapseByCode(rows: EarningsQualityRow[]): EarningsQualityRow[] {
  const best = new Map<string, EarningsQualityRow>()
  for (const r of rows) {
    const cur = best.get(r.code)
    if (!cur || isMoreRecent(r, cur)) best.set(r.code, r)
  }
  return Array.from(best.values())
}

// ソート用の値。「通期 OP」列は FY で fop_rev_pct が常に NULL のため表示値
// (op_beat_pct) を返す。意味は違うが、列に出ている値と並び順を一致させる方が
// 誤解が少ない (FY と四半期が同日に混在するのは訂正開示くらいで稀)。

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
  // 同日に複数 Q を開示した銘柄を 1 行に畳むか。既定は OFF (データどおり全件表示)
  const [collapsed, setCollapsed] = useState(false)

  function toggleSet<T>(s: Set<T>, v: T): Set<T> {
    const ns = new Set(s)
    if (ns.has(v)) ns.delete(v)
    else ns.add(v)
    return ns
  }


  const dupMap = useMemo(() => buildDupMap(rows), [rows])
  // 同日に複数開示した銘柄が 1 つも無ければトグル自体を出さない
  const hasDup = useMemo(() => {
    for (const info of dupMap.values()) if (info.count > 1) return true
    return false
  }, [dupMap])

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

  const deduped = useMemo(
    () => (collapsed ? collapseByCode(filtered) : filtered),
    [filtered, collapsed],
  )

  const columns = useMemo(() => buildColumns(dupMap, collapsed), [dupMap, collapsed])

  // 同値のときの決定規則: rank_in_day 昇順 → score3 降順 → code 昇順。
  // rank_in_day は Q グループ別なので同値が並ぶ（同じ日に 1 位が最大 3 行）。
  const tieBreak = useCallback((a: EarningsQualityRow, b: EarningsQualityRow) => {
    const ar = a.rank_in_day ?? Number.POSITIVE_INFINITY
    const br = b.rank_in_day ?? Number.POSITIVE_INFINITY
    if (ar !== br) return ar - br
    if (a.score3 !== b.score3) return b.score3 - a.score3
    return a.code.localeCompare(b.code)
  }, [])

  return (
    <>
      {/* ── サマリ カード（開示件数のみ）───────────────────────────── */}
      <section className="mb-5 max-w-[200px]">
        <StatCard label="開示件数" value={`${eventsInDay}`} sub={latestDate ?? ''} />
      </section>

      {/* ── 旧スコア (v2 バックフィル前) の注意 ─────────────────────── */}
      {scoreData.state !== 'ok' && (
        <div className="mb-5 px-4 py-2.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-sm flex items-start gap-2">
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
        <div className="flex items-center gap-3 px-4 pt-4 pb-3 flex-wrap">
          <p className="text-sm font-semibold text-[var(--text-primary)]">品質スコア ランキング</p>
          {hasDup && (
            <label
              className="flex items-center gap-1.5 text-[11px] text-gray-600 cursor-pointer select-none"
              title="決算を延期していた企業などが同日に 1Q〜FY をまとめて開示すると、同じ銘柄が最大 4 行並びます。ON にすると最新の Q (FY > 3Q > 2Q > 1Q) の 1 行だけ残します"
            >
              <input
                type="checkbox"
                checked={collapsed}
                onChange={e => setCollapsed(e.target.checked)}
                className="cursor-pointer"
              />
              1銘柄1行
            </label>
          )}
          <span className="ml-auto text-xs text-[var(--text-muted)]">
            <span className="font-mono">{deduped.length} / {rows.length}</span> 件表示
            {collapsed && filtered.length > deduped.length && (
              <span className="ml-1 text-[10px]">
                (同日重複 {filtered.length - deduped.length} 件を集約)
              </span>
            )}
          </span>
        </div>

        <DataTable
          rows={deduped}
          columns={columns}
          rowKey={r => `${r.code}-${r.cur_per_type}`}
          defaultSort={{ key: 'score3', dir: 'desc' }}
          // 満点の行は左端のレールで示す（面を塗ると当日の全行が緑に沈む）
          rail={r => (r.score3 >= maxScoreFor(r.cur_per_type) ? 'var(--sem-strong-fg)' : null)}
          tieBreak={tieBreak}
        />

        {deduped.length === 0 && (
          <div className="py-10 text-center text-[var(--text-muted)] text-sm">
            条件に合う銘柄はありません — フィルタを緩めてください
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 py-3 text-[11px] border-t border-[var(--border-subtle)] flex-wrap">
          <span className="text-[var(--text-secondary)]">Score:</span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded" style={{ backgroundColor: 'var(--sem-strong-fg)' }} />
            <span style={{ color: 'var(--text-secondary)' }}>満点</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded" style={{ backgroundColor: 'var(--sem-strong-bg)' }} />
            <span style={{ color: 'var(--text-secondary)' }}>強 7-8</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded" style={{ backgroundColor: 'var(--sem-ok-bg)' }} />
            <span style={{ color: 'var(--text-secondary)' }}>中 4-6</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded" style={{ backgroundColor: 'var(--sem-idle-bg)' }} />
            <span style={{ color: 'var(--text-secondary)' }}>弱 0-3</span>
          </span>
          <span className="text-gray-300">|</span>
          <span className="flex items-center gap-1 text-gray-600">
            <span className="text-[var(--sem-watch-fg)]">★</span> 当日 Q別 Top 1%
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
          {hasDup && (
            <>
              <span className="text-gray-300">|</span>
              <span
                className="flex items-center gap-1 text-gray-600"
                title="PK が (date, code, cur_per_type) のため、同日に複数の決算を開示した銘柄は Q ごとに別行になります"
              >
                <span className="px-1 rounded text-[9px] font-semibold bg-slate-200 text-slate-600">
                  同日N
                </span>
                同一銘柄が同日に N 本開示
              </span>
            </>
          )}
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
          ? 'text-[var(--sem-watch-fg)]'
          : 'text-[var(--text-primary)]'
  return (
    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-3">
      <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wide font-medium">{label}</p>
      <p className={`text-2xl font-bold font-mono tabular-nums mt-1 ${accentColor}`}>{value}</p>
      {sub && <p className="text-[10px] text-[var(--text-muted)] mt-0.5 truncate" title={sub}>{sub}</p>}
    </div>
  )
}
