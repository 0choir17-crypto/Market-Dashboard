/**
 * pullbackRebreakCore.ts のセルフテスト（合成データ・DB不要）
 *
 *   npx tsx scripts/analysis/pullbackRebreak.selftest.ts
 *
 * 「押しが深いほど再ブレイクしにくい」という関係を*こちらで作り込んだ*合成データを
 * 食わせ、集計がその設計値を復元できるかを見る。実データを触る前に、エピソード抽出・
 * ハザード集計・打ち切り処理のバグを弾くのが目的。
 */
import {
  DEFAULT_PARAMS,
  buildCurve,
  buildEpisodes,
  findKnee,
  type AnalyzeParams,
  type Bar,
} from './pullbackRebreakCore'
import { formatCurve, formatKnee, legend } from './pullbackRebreakReport'

let failures = 0

function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    console.log(`  ok   ${name}`)
  } else {
    failures++
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function approx(a: number, b: number, tol: number) {
  return Math.abs(a - b) <= tol
}

// ── 合成足の生成 ──────────────────────────────────────────────────────────

let dayCursor = 0
function nextDate(): string {
  // 営業日である必要はない（ロジックは本数ベース）。単調増加する日付を振るだけ。
  const d = new Date(Date.UTC(2015, 0, 1))
  d.setUTCDate(d.getUTCDate() + dayCursor++)
  return d.toISOString().slice(0, 10)
}

function bar(price: number): Bar {
  // high/low を ±1% に置くと ADR ≒ 2%。close 基準の判定には影響しない。
  return {
    date: nextDate(),
    open: price,
    high: price * 1.01,
    low: price * 0.99,
    close: price,
    volume: 1_000_000, // 売買代金 = price × 1e6 / 1e8 → 1000円なら 10億円
  }
}

/** from → to へ n 本かけて線形に動かす（from は含まない）。 */
function ramp(from: number, to: number, n: number): Bar[] {
  const out: Bar[] = []
  for (let i = 1; i <= n; i++) out.push(bar(from + ((to - from) * i) / n))
  return out
}

function flat(price: number, n: number): Bar[] {
  return Array.from({ length: n }, () => bar(price))
}

/**
 * 1 銘柄 = 1 エピソード の合成足。
 *   助走 300 本の上昇 → 高値 → depthPct の押し → 回復 or 未回復のまま終了
 */
function synthStock(opts: {
  depthPct: number
  recover: boolean
  downBars?: number
  upBars?: number
  tailBars?: number
}): Bar[] {
  const { depthPct, recover, downBars = 15, upBars = 20, tailBars = 600 } = opts
  dayCursor = 0
  const peak = 1000
  // 設計値ちょうどだと浮動小数の丸めで「閾値に届かない」判定が起き得るので僅かに深掘りする
  const trough = peak * (1 - (depthPct + 0.05) / 100)
  const bars: Bar[] = [...ramp(700, peak, 300)]
  bars.push(...ramp(peak, trough, downBars))
  if (recover) {
    bars.push(...ramp(trough, peak * 1.03, upBars))
    bars.push(...flat(peak * 1.03, tailBars))
  } else {
    bars.push(...flat(trough, tailBars))
  }
  return bars
}

const P: AnalyzeParams = { ...DEFAULT_PARAMS }

// ── 1. 基本のエピソード抽出 ────────────────────────────────────────────────

console.log('\n[1] 基本のエピソード抽出')
{
  const bars = synthStock({ depthPct: 8, recover: true })
  const eps = buildEpisodes('TEST', bars, P)
  check('エピソードが 1 件', eps.length === 1, `got ${eps.length}`)
  const e = eps[0]
  check('高値が 1000 付近', approx(e.peakPrice, 1000, 1), `peak=${e.peakPrice}`)
  check('最大押し幅が設計値 8% 付近', approx(e.maxDepthPct, 8, 0.6), `depth=${e.maxDepthPct.toFixed(2)}`)
  check('再ブレイクを検出', e.rebreakDate !== null && e.rebreakBars !== null)
  check('再ブレイクは押し切り後', (e.rebreakBars ?? 0) > 15, `bars=${e.rebreakBars}`)
  check('確定判定が付く（後続に十分な足がある）', e.confirmed === true, `confirmed=${e.confirmed}`)
  check('ADR 倍の深さが算出される', e.maxDepthAdr !== null && e.maxDepthAdr > 2, `adrDepth=${e.maxDepthAdr}`)
}

{
  const bars = synthStock({ depthPct: 25, recover: false })
  const eps = buildEpisodes('TEST', bars, P)
  check('未回復ケースもエピソード化される', eps.length === 1, `got ${eps.length}`)
  const e = eps[0]
  check('未回復は rebreakDate が null', e.rebreakDate === null)
  check('最大押し幅が設計値 25% 付近', approx(e.maxDepthPct, 25, 0.6), `depth=${e.maxDepthPct.toFixed(2)}`)
}

// ── 2. 起点高値の足切り ────────────────────────────────────────────────────

console.log('\n[2] 起点高値の足切り / トリガー')
{
  // 押しが 2% しかない = trigger(3%) 未満 → エピソードにならない
  const bars = synthStock({ depthPct: 2, recover: true })
  const eps = buildEpisodes('TEST', bars, P)
  check('トリガー未満の浅い押しは拾わない', eps.length === 0, `got ${eps.length}`)
}
{
  // 流動性が足りない銘柄（売買代金 ≒ 0.01 億円）は除外される
  const bars = synthStock({ depthPct: 10, recover: true }).map((b) => ({ ...b, volume: 1000 }))
  const eps = buildEpisodes('TEST', bars, P)
  check('低流動性は除外される', eps.length === 0, `got ${eps.length}`)
}
{
  const short = synthStock({ depthPct: 10, recover: true }).slice(0, 200)
  const eps = buildEpisodes('TEST', short, P)
  check('minBars 未満の銘柄はスキップ', eps.length === 0, `got ${eps.length}`)
}

// ── 3. 打ち切り（censoring）────────────────────────────────────────────────

console.log('\n[3] 打ち切り処理')
{
  // 押した直後にデータが終わる → 「戻せなかった」ではなく「観測できていない」
  const bars = synthStock({ depthPct: 12, recover: false, tailBars: 5 })
  const eps = buildEpisodes('TEST', bars, P)
  check('末尾未決着でもエピソードは残る', eps.length === 1, `got ${eps.length}`)
  const curve = buildCurve('pct', 't', eps, P)
  const row10 = curve.rows.find((r) => r.threshold === 10)!
  const h60 = row10.byHorizon.find((h) => h.horizon === 60)!
  check('観測不足は分母 n に入らない', h60.n === 0, `n=${h60.n}`)
  check('観測不足は censored に計上される', h60.censored === 1, `censored=${h60.censored}`)
}

// ── 4. データ断絶ガード ────────────────────────────────────────────────────

console.log('\n[4] データ断絶ガード（未調整の分割など）')
{
  const bars = synthStock({ depthPct: 8, recover: true })
  // 助走の途中で 1/3 に飛ばす（3分割の未調整データを模す）
  for (let i = 150; i < bars.length; i++) {
    const b = bars[i]
    bars[i] = {
      ...b,
      open: b.open! / 3,
      high: b.high! / 3,
      low: b.low! / 3,
      close: b.close! / 3,
      volume: b.volume,
    }
  }
  const eps = buildEpisodes('TEST', bars, P)
  const bogus = eps.filter((e) => e.maxDepthPct > 50)
  check('価格ギャップで偽の暴落エピソードを作らない', bogus.length === 0, `got ${bogus.length}`)
}

// ── 5. ハザード集計が設計した難易度カーブを復元するか ──────────────────────

console.log('\n[5] 難易度カーブの復元')
{
  // 深さごとに回復率を作り込む: 5%→90%, 10%→70%, 20%→40%, 30%→10%
  const design: Array<{ depth: number; rate: number }> = [
    { depth: 5, rate: 0.9 },
    { depth: 10, rate: 0.7 },
    { depth: 20, rate: 0.4 },
    { depth: 30, rate: 0.1 },
  ]
  const N = 100
  const all = []
  for (const d of design) {
    for (let i = 0; i < N; i++) {
      const recover = i < Math.round(d.rate * N)
      // 未回復側は maxEpisodeBars(500) を超える尾を付け、打ち切りではなく実測の「失敗」にする
      const bars = synthStock({ depthPct: d.depth, recover, upBars: 20, tailBars: 600 })
      all.push(...buildEpisodes(`D${d.depth}_${i}`, bars, P))
    }
  }
  check('全エピソードが抽出された', all.length === design.length * N, `got ${all.length}`)

  const curve = buildCurve('pct', 'synthetic', all, P)
  const rowOf = (t: number) => curve.rows.find((r) => r.threshold === t)!
  const rateAt = (t: number, h: number) => rowOf(t).byHorizon.find((x) => x.horizon === h)!.rate ?? NaN

  // 到達件数は「その深さ以上まで下げた本数」= 累積であるはず
  check('n(≥5%) = 400', rowOf(5).nReached === 400, `${rowOf(5).nReached}`)
  check('n(≥10%) = 300', rowOf(10).nReached === 300, `${rowOf(10).nReached}`)
  check('n(≥20%) = 200', rowOf(20).nReached === 200, `${rowOf(20).nReached}`)
  check('n(≥30%) = 100', rowOf(30).nReached === 100, `${rowOf(30).nReached}`)

  // 設計値からの逆算: 閾値 d に到達した母集団の回復率は、d 以上の群の加重平均
  const expected = (t: number) => {
    const grp = design.filter((d) => d.depth >= t)
    return grp.reduce((s, d) => s + d.rate, 0) / grp.length
  }
  for (const t of [5, 10, 20, 30]) {
    const got = rateAt(t, 250)
    check(
      `≥${t}% の再ブレイク率が設計値 ${(expected(t) * 100).toFixed(0)}% を復元`,
      approx(got, expected(t), 0.03),
      `got ${(got * 100).toFixed(1)}%`,
    )
  }

  // 難易度カーブは単調に悪化しているはず
  const rates = [5, 10, 20, 30].map((t) => rateAt(t, 250))
  check('深くなるほど再ブレイク率が下がる', rates.every((r, i) => i === 0 || r <= rates[i - 1] + 1e-9), rates.join(' > '))

  // 「次の閾値まで深くなる確率」: ≥5% の 300/400 が 10% まで到達
  check('P(深化) が正しい', approx(rowOf(5).pDeeper ?? -1, 300 / 400, 0.02), `${rowOf(5).pDeeper}`)

  // 実データ実行時と同じ体裁で描画し、整形側も一緒に動かしておく（合成データなので数値に意味は無い）
  console.log('\n--- 出力体裁の確認（合成データ）---')
  console.log(legend(P))
  console.log(formatCurve(curve, P))
  console.log(formatKnee(curve, 60))
  // 閾値 7.5% の母集団は depth 10/20/30 群の平均 = (0.7+0.4+0.1)/3 = 40% で、
  // ここが初めて 50% を割る行。累積（ハザード）で見ているので設計値そのものではない点に注意。
  const k = findKnee(curve, 250)
  check('halfLife が累積ベースで 7.5% に立つ', k.halfLife === 7.5, `halfLife=${k.halfLife}`)
}

console.log(failures === 0 ? '\n全テスト通過 ✅' : `\n${failures} 件 FAIL ❌`)
process.exit(failures === 0 ? 0 : 1)
