import { computeEqs, eqsBand, toEqsInput, type V1LikeRow } from './earningsQualityV2'

// ── v1 の再実装 (設計書 §3 のとおり) ───────────────────────────────────
function v1Score(r: V1LikeRow) {
  const gt0 = (v: number | null | undefined) => v != null && Number.isFinite(v) && v > 0
  const d = r.div_change_pct
  const s_div = gt0(d) ? (d! >= 10 ? 3 : 2) : 0
  const s_eps = (gt0(r.eps_yoy_pct) ? 1 : 0) + (gt0(r.eps_qoq_pct) ? 1 : 0)
  const s_sales = (gt0(r.sales_yoy_pct) ? 1 : 0) + (gt0(r.sales_qoq_pct) ? 1 : 0)
  const score3 = s_div + s_eps + s_sales
  const max = r.cur_per_type === '1Q' ? 5 : 7
  const band = score3 === max ? '満点(濃緑)' : score3 >= 5 ? '強(緑)' : score3 >= 3 ? '中(黄)' : '弱(灰)'
  return { score3, max, s_div, s_eps, s_sales, band }
}

// ── 1. v1 の到達可能スコアを全列挙 ──────────────────────────────────────
console.log('=== v1: 増配の有無別に到達可能な score3 ===')
for (const q of ['1Q', '2Q'] as const) {
  for (const divCase of [
    { label: '増配なし(据置0%)', v: 0 },
    { label: '増配 +5%', v: 5 },
    { label: '増配 +12%', v: 12 },
  ]) {
    const scores = new Set<number>()
    // 成長シグナルの全組み合わせ (YoY/QoQ の正負)
    for (const ey of [1, -1]) for (const eq of [1, -1]) for (const sy of [1, -1]) for (const sq of [1, -1]) {
      const row: V1LikeRow = {
        cur_per_type: q,
        eps_yoy_pct: ey, eps_qoq_pct: q === '1Q' ? null : eq,
        sales_yoy_pct: sy, sales_qoq_pct: q === '1Q' ? null : sq,
        div_change_pct: divCase.v,
        fop_rev_pct: null, progress_excess_pct: null, above_sma200: null, turnover_oku: null,
      }
      scores.add(v1Score(row).score3)
    }
    const arr = [...scores].sort((a, b) => a - b)
    const max = Math.max(...arr)
    const maxBand = v1Score({
      cur_per_type: q, eps_yoy_pct: 1, eps_qoq_pct: q === '1Q' ? null : 1,
      sales_yoy_pct: 1, sales_qoq_pct: q === '1Q' ? null : 1,
      div_change_pct: divCase.v, fop_rev_pct: null, progress_excess_pct: null,
      above_sma200: null, turnover_oku: null,
    }).band
    console.log(`  ${q} / ${divCase.label.padEnd(16)} 到達域=[${arr.join(',')}] 最大=${max} → 最良でも「${maxBand}」`)
  }
}

// ── 2. ケーススタディ ────────────────────────────────────────────────────
const cases: { name: string; row: V1LikeRow }[] = [
  {
    name: 'A. 見逃し型: 1Q 高成長・上方修正・増配なし (トーメンデバイス想定)',
    row: {
      cur_per_type: '1Q',
      eps_yoy_pct: 120, eps_qoq_pct: null,      // 1Q は QoQ 構造的に null
      sales_yoy_pct: 45, sales_qoq_pct: null,
      div_change_pct: 0,                         // 期初予想据え置き
      fop_rev_pct: 25,                           // 通期 OP 上方修正
      progress_excess_pct: 12,                   // 進捗大幅先行
      above_sma200: true, turnover_oku: 8,
    },
  },
  {
    name: 'B. 見逃し型: 2Q 黒字転換・上方修正・増配なし',
    row: {
      cur_per_type: '2Q',
      eps_yoy_pct: null, eps_qoq_pct: null,      // 前年赤字で % 算出不能 → v1 は 0 点
      sales_yoy_pct: 32, sales_qoq_pct: 18,
      div_change_pct: 0,
      fop_rev_pct: 40, progress_excess_pct: 15,
      above_sma200: true, turnover_oku: 12,
      eps_turnaround: 'to_profit',
    },
  },
  {
    name: 'C. 誤検知型: 微増益だが増配 (v1 満点)',
    row: {
      cur_per_type: '2Q',
      eps_yoy_pct: 2, eps_qoq_pct: 1,
      sales_yoy_pct: 1, sales_qoq_pct: 1,
      div_change_pct: 12,
      fop_rev_pct: null, progress_excess_pct: 0,
      above_sma200: false, turnover_oku: 0.8,
    },
  },
  {
    name: 'D. 忌避型: 増配だが通期下方修正',
    row: {
      cur_per_type: '3Q',
      eps_yoy_pct: 5, eps_qoq_pct: 3,
      sales_yoy_pct: 4, sales_qoq_pct: 2,
      div_change_pct: 11,
      fop_rev_pct: -18, progress_excess_pct: -8,
      above_sma200: false, turnover_oku: 3,
    },
  },
]

console.log('\n=== ケーススタディ: v1 vs v2 ===')
for (const c of cases) {
  const v1 = v1Score(c.row)
  const { input, degraded } = toEqsInput(c.row)
  const v2 = computeEqs(input)
  console.log(`\n${c.name}`)
  console.log(`  v1: score3=${v1.score3}/${v1.max} (div=${v1.s_div} eps=${v1.s_eps} sales=${v1.s_sales}) → ${v1.band}`)
  console.log(`  v2: EQS=${v2.eqs} (raw=${v2.raw} penalty=-${v2.penaltyTotal}) band=${eqsBand(v2.eqs)} coverage=${v2.coverage}% degraded=${degraded}`)
  const detail = (Object.keys(v2.axes) as (keyof typeof v2.axes)[])
    .map(k => `${k}=${v2.axes[k].available ? `${v2.axes[k].earned}/${v2.axes[k].max}` : '除外'}`)
    .join(' ')
  console.log(`      ${detail}`)
  if (v2.penalties.length) console.log(`      penalties: ${v2.penalties.map(p => `${p.label}(-${p.points})`).join(', ')}`)
}
