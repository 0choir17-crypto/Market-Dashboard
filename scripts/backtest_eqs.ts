/**
 * v1 (score3) vs v2 (EQS) — 決算開示後の成績比較バックテスト
 *
 * 実行方法:
 *   npx tsx scripts/backtest_eqs.ts
 *   npx tsx scripts/backtest_eqs.ts --since 2025-01-01 --source ohlcv
 *   npx tsx scripts/backtest_eqs.ts --source signals --csv /tmp/eqs_backtest.csv
 *
 * オプション:
 *   --since YYYY-MM-DD  対象開示日の下限（既定: 全期間）
 *   --source ohlcv|signals
 *        ohlcv   : chart_ohlcv_cache（OHLC あり）→ エントリ = D+1 始値、MFE/MAE は高値/安値ベース【既定】
 *        signals : daily_signals（終値のみ）→ エントリ = D+1 終値、MFE/MAE は終値ベース（保守的）
 *   --hold N            保有本数（既定 20 営業日）
 *   --csv PATH          明細を CSV 出力
 *   --concurrency N     価格取得の並列数（既定 8）
 *
 * .env.local の NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY を自動ロードする
 * （scripts/backfill_mfe_mae.ts と同じ方式）。
 *
 * 前提: 「翌営業日 (D+1) 寄り買い」という /earnings の商品前提に合わせ、
 *       開示日 D の翌営業日をエントリ日とする（引け前開示も含めて統一）。
 *       引け前開示は本来 D 当日に入れるため、この定義は D 当日の初動を捨てる
 *       ぶん保守的。v1/v2 の双方に同じ定義を適用するので比較の公平性は保たれる。
 */
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join } from 'path'
import { createClient } from '@supabase/supabase-js'
import {
  computeEqs,
  eqsBand,
  toEqsInput,
  type EqsBand,
  type V1LikeRow,
} from '../types/earningsQualityV2'

// ── env ────────────────────────────────────────────────────────────────────
function loadEnv(file: string) {
  const path = join(process.cwd(), file)
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf-8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
}
loadEnv('.env.local')
loadEnv('.env')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!supabaseUrl || !supabaseKey) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY が未設定です')
  process.exit(1)
}
const supabase = createClient(supabaseUrl, supabaseKey)

// ── args ───────────────────────────────────────────────────────────────────
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const SINCE = arg('since') ?? null
const SOURCE = (arg('source') ?? 'ohlcv') as 'ohlcv' | 'signals'
const HOLD = Number(arg('hold') ?? 20)
const CSV_PATH = arg('csv') ?? null
const CONCURRENCY = Number(arg('concurrency') ?? 8)
const HORIZONS = [1, 5, 10, HOLD].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b)

// ── types ──────────────────────────────────────────────────────────────────
type EqRow = V1LikeRow & {
  date: string
  code: string
  co_name: string | null
  sector_s33: string | null
  score3: number
  rank_in_day: number | null
  pct_rank_in_day: number | null
  events_in_day: number | null
}

type Bar = { date: string; open: number; high: number; low: number; close: number }

type Result = {
  date: string
  code: string
  co_name: string | null
  cur_per_type: string
  score3: number
  v1band: V1Band
  eqs: number
  v2band: EqsBand
  coverage: number
  degraded: boolean
  rankInDay: number | null
  entryDate: string
  entry: number
  rets: Record<number, number | null> // horizon(本) → %
  mfe: number | null
  mae: number | null
}

// ── v1 バンド（types/earningsQuality.ts の score3Color と同じ境界）─────────
type V1Band = '満点' | '強' | '中' | '弱'
function v1Band(score3: number, curPerType: string): V1Band {
  const max = curPerType === '1Q' ? 5 : 7
  if (score3 === max) return '満点'
  if (score3 >= 5) return '強'
  if (score3 >= 3) return '中'
  return '弱'
}
const V1_ORDER: V1Band[] = ['満点', '強', '中', '弱']
const V2_ORDER: EqsBand[] = ['S', 'A', 'B', 'C']

// ── fetch ──────────────────────────────────────────────────────────────────
const PAGE = 1000

async function fetchAllEarnings(): Promise<EqRow[]> {
  const out: EqRow[] = []
  for (let from = 0; ; from += PAGE) {
    let q = supabase
      .from('earnings_quality')
      .select('*')
      .order('date', { ascending: true })
      .order('code', { ascending: true })
      .order('cur_per_type', { ascending: true })
      .range(from, from + PAGE - 1)
    if (SINCE) q = q.gte('date', SINCE)
    const { data, error } = await q
    if (error) throw new Error(`earnings_quality: ${error.message}`)
    if (!data || data.length === 0) break
    out.push(...(data as unknown as EqRow[]))
    process.stdout.write(`\r  earnings_quality: ${out.length} 行`)
    if (data.length < PAGE) break
  }
  process.stdout.write('\n')
  return out
}

async function fetchBars(code: string, from: string, to: string): Promise<Bar[]> {
  const table = SOURCE === 'ohlcv' ? 'chart_ohlcv_cache' : 'daily_signals'
  const cols = SOURCE === 'ohlcv' ? 'date, open, high, low, close' : 'date, close'
  const out: Bar[] = []
  for (let off = 0; ; off += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(cols)
      .eq('code', code)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: true })
      .range(off, off + PAGE - 1)
    if (error) return out // 銘柄ごとの欠損は致命ではない
    const rows = (data ?? []) as unknown as Record<string, unknown>[]
    if (rows.length === 0) break
    for (const r of rows) {
      const close = r.close == null ? NaN : Number(r.close)
      if (!Number.isFinite(close)) continue
      // daily_signals は終値のみ → OHLC を終値で埋める（MFE/MAE は保守的になる）
      const open = r.open == null ? close : Number(r.open)
      const high = r.high == null ? close : Number(r.high)
      const low = r.low == null ? close : Number(r.low)
      out.push({ date: r.date as string, open, high, low, close })
    }
    if (rows.length < PAGE) break
  }
  // (code, date) 重複（daily_signals は screen_name で重複しうる）を先勝ちで畳む
  const seen = new Set<string>()
  return out.filter(b => (seen.has(b.date) ? false : (seen.add(b.date), true)))
}

async function pool<T, R>(items: T[], n: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let cursor = 0
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      for (;;) {
        const i = cursor++
        if (i >= items.length) return
        out[i] = await fn(items[i], i)
      }
    }),
  )
  return out
}

// ── 統計ヘルパ ─────────────────────────────────────────────────────────────
function mean(a: number[]): number {
  return a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN
}
function median(a: number[]): number {
  if (!a.length) return NaN
  const s = [...a].sort((x, y) => x - y)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
function winRate(a: number[]): number {
  return a.length ? (a.filter(v => v > 0).length / a.length) * 100 : NaN
}
/** 同順位を平均順位で扱う rank 変換 */
function rankify(a: number[]): number[] {
  const idx = a.map((v, i) => [v, i] as const).sort((x, y) => x[0] - y[0])
  const r = new Array<number>(a.length)
  let i = 0
  while (i < idx.length) {
    let j = i
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++
    const avg = (i + j) / 2 + 1
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg
    i = j + 1
  }
  return r
}
/** Spearman 順位相関 */
function spearman(x: number[], y: number[]): number {
  if (x.length < 3) return NaN
  const rx = rankify(x)
  const ry = rankify(y)
  const mx = mean(rx)
  const my = mean(ry)
  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < rx.length; i++) {
    const a = rx[i] - mx
    const b = ry[i] - my
    num += a * b
    dx += a * a
    dy += b * b
  }
  return dx === 0 || dy === 0 ? NaN : num / Math.sqrt(dx * dy)
}
const f = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—')

// ── main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('■ 設定')
  console.log(`  source=${SOURCE} (${SOURCE === 'ohlcv' ? 'chart_ohlcv_cache / エントリ=D+1 始値' : 'daily_signals / エントリ=D+1 終値'})`)
  console.log(`  since=${SINCE ?? '全期間'} hold=${HOLD}本 horizons=[${HORIZONS.join(', ')}]`)

  console.log('\n■ 決算データ取得')
  const rows = await fetchAllEarnings()
  if (rows.length === 0) {
    console.error('earnings_quality に行がありません')
    process.exit(1)
  }
  const dates = rows.map(r => r.date).sort()
  const minDate = dates[0]
  const maxDate = dates[dates.length - 1]
  console.log(`  期間: ${minDate} 〜 ${maxDate} / ${rows.length} 行 / ${new Set(rows.map(r => r.code)).size} 銘柄`)

  // 価格は「最古の開示日の少し前 〜 最新開示日 + 保有期間の余裕」だけ取れば足りる
  const priceFrom = minDate
  const priceTo = new Date(new Date(maxDate).getTime() + (HOLD + 20) * 86400_000 * 1.5)
    .toISOString()
    .slice(0, 10)

  console.log('\n■ 価格取得')
  const codes = [...new Set(rows.map(r => r.code))]
  let done = 0
  const barsList = await pool(codes, CONCURRENCY, async code => {
    const b = await fetchBars(code, priceFrom, priceTo)
    done++
    if (done % 25 === 0 || done === codes.length) {
      process.stdout.write(`\r  ${done}/${codes.length} 銘柄`)
    }
    return b
  })
  process.stdout.write('\n')
  const barsByCode = new Map<string, Bar[]>()
  codes.forEach((c, i) => barsByCode.set(c, barsList[i]))
  const covered = codes.filter(c => (barsByCode.get(c) ?? []).length > 0).length
  console.log(`  価格カバレッジ: ${covered}/${codes.length} 銘柄 (${f((covered / codes.length) * 100, 1)}%)`)
  if (covered / codes.length < 0.3) {
    console.log(`  ⚠ カバレッジが低すぎます。--source ${SOURCE === 'ohlcv' ? 'signals' : 'ohlcv'} を試してください`)
  }

  // ── スコアリング + 先行リターン ──────────────────────────────────────
  console.log('\n■ スコアリング')
  const results: Result[] = []
  let skippedNoPrice = 0
  let skippedNoEntry = 0

  for (const r of rows) {
    const bars = barsByCode.get(r.code) ?? []
    if (bars.length === 0) {
      skippedNoPrice++
      continue
    }
    // 開示日 D より後の最初の足 = D+1（エントリ日）
    const e = bars.findIndex(b => b.date > r.date)
    if (e < 0) {
      skippedNoEntry++
      continue
    }
    const entry = SOURCE === 'ohlcv' ? bars[e].open : bars[e].close
    if (!Number.isFinite(entry) || entry <= 0) {
      skippedNoEntry++
      continue
    }
    // 最長ホライズンぶんの足が無い行は成績集計から外す（打ち切りバイアス回避）
    if (e + HORIZONS[HORIZONS.length - 1] - 1 >= bars.length) {
      skippedNoEntry++
      continue
    }

    const rets: Record<number, number | null> = {}
    for (const h of HORIZONS) {
      const b = bars[e + h - 1]
      rets[h] = b ? ((b.close - entry) / entry) * 100 : null
    }
    const window = bars.slice(e, e + HOLD)
    const mfe = window.length ? ((Math.max(...window.map(b => b.high)) - entry) / entry) * 100 : null
    const mae = window.length ? ((Math.min(...window.map(b => b.low)) - entry) / entry) * 100 : null

    const { input, degraded } = toEqsInput(r)
    const v2 = computeEqs(input)

    results.push({
      date: r.date,
      code: r.code,
      co_name: r.co_name,
      cur_per_type: r.cur_per_type,
      score3: r.score3,
      v1band: v1Band(r.score3, r.cur_per_type),
      eqs: v2.eqs ?? 0,
      v2band: eqsBand(v2.eqs),
      coverage: v2.coverage,
      degraded,
      rankInDay: r.rank_in_day,
      entryDate: bars[e].date,
      entry,
      rets,
      mfe,
      mae,
    })
  }

  console.log(`  評価対象: ${results.length} 行（価格なし ${skippedNoPrice} / 足不足 ${skippedNoEntry} を除外）`)
  if (results.length === 0) {
    console.error('評価可能な行がありません')
    process.exit(1)
  }
  const H = HORIZONS[HORIZONS.length - 1]

  // ── バンド別成績 ─────────────────────────────────────────────────────
  function bandTable(label: string, order: string[], keyOf: (r: Result) => string) {
    console.log(`\n■ ${label} — バンド別成績（エントリ = D+1、${H}本保有）`)
    const head = ['バンド', 'N', '構成比', ...HORIZONS.map(h => `平均${h}d`), `中央${H}d`, '勝率', `平均MFE`, `平均MAE`]
    const widths = [8, 7, 7, ...HORIZONS.map(() => 9), 9, 8, 9, 9]
    console.log(head.map((s, i) => s.padStart(widths[i])).join(''))
    console.log('─'.repeat(widths.reduce((a, b) => a + b, 0)))
    for (const band of order) {
      const g = results.filter(r => keyOf(r) === band)
      if (!g.length) {
        console.log([band, '0', '—', ...HORIZONS.map(() => '—'), '—', '—', '—', '—'].map((s, i) => s.padStart(widths[i])).join(''))
        continue
      }
      const cells = [
        band,
        String(g.length),
        `${f((g.length / results.length) * 100, 1)}%`,
        ...HORIZONS.map(h => `${f(mean(g.map(r => r.rets[h]).filter((v): v is number => v != null)))}%`),
        `${f(median(g.map(r => r.rets[H]).filter((v): v is number => v != null)))}%`,
        `${f(winRate(g.map(r => r.rets[H]).filter((v): v is number => v != null)), 1)}%`,
        `${f(mean(g.map(r => r.mfe).filter((v): v is number => v != null)))}%`,
        `${f(mean(g.map(r => r.mae).filter((v): v is number => v != null)))}%`,
      ]
      console.log(cells.map((s, i) => s.padStart(widths[i])).join(''))
    }
    // 単調性チェック（上位バンドほど平均リターンが高いか）
    const means = order.map(b => {
      const g = results.filter(r => keyOf(r) === b)
      return mean(g.map(r => r.rets[H]).filter((v): v is number => v != null))
    })
    const valid = means.filter(v => Number.isFinite(v))
    const mono = valid.every((v, i) => i === 0 || valid[i - 1] >= v)
    console.log(`  単調性 (上位バンドほど高リターン): ${mono ? '✓ 満たす' : '✗ 崩れている'}`)
  }

  bandTable('v1 (score3)', V1_ORDER, r => r.v1band)
  bandTable('v2 (EQS)', V2_ORDER, r => r.v2band)

  // ── 見逃し率 / 誤検知率 ──────────────────────────────────────────────
  console.log(`\n■ 見逃し・誤検知（${H}本保有）`)
  const bigWin = results.filter(r => (r.rets[H] ?? -Infinity) >= 20)
  const bigLoss = results.filter(r => (r.rets[H] ?? Infinity) <= -10)
  const v1MissRate = bigWin.length ? (bigWin.filter(r => r.v1band === '弱').length / bigWin.length) * 100 : NaN
  const v2MissRate = bigWin.length ? (bigWin.filter(r => r.v2band === 'C').length / bigWin.length) * 100 : NaN
  const v1FpRate = bigLoss.length ? (bigLoss.filter(r => r.v1band === '満点').length / bigLoss.length) * 100 : NaN
  const v2FpRate = bigLoss.length ? (bigLoss.filter(r => r.v2band === 'S').length / bigLoss.length) * 100 : NaN
  console.log(`  大幅上昇 (+20%以上) ${bigWin.length} 件のうち最下位バンドだった割合（= 見逃し率）`)
  console.log(`     v1「弱」: ${f(v1MissRate, 1)}%     v2「C」: ${f(v2MissRate, 1)}%   ${Number.isFinite(v1MissRate) && Number.isFinite(v2MissRate) ? (v2MissRate < v1MissRate ? '→ v2 が改善 ✓' : '→ 改善せず ✗') : ''}`)
  console.log(`  大幅下落 (-10%以下) ${bigLoss.length} 件のうち最上位バンドだった割合（= 誤検知率）`)
  console.log(`     v1「満点」: ${f(v1FpRate, 1)}%   v2「S」: ${f(v2FpRate, 1)}%   ${Number.isFinite(v1FpRate) && Number.isFinite(v2FpRate) ? (v2FpRate < v1FpRate ? '→ v2 が改善 ✓' : '→ 改善せず ✗') : ''}`)

  // ── 上位選抜の成績（実運用に一番近い指標）────────────────────────────
  console.log(`\n■ 上位 N 銘柄を当日から選ぶ場合の平均 ${H}d リターン`)
  const byDate = new Map<string, Result[]>()
  for (const r of results) {
    const a = byDate.get(r.date) ?? []
    a.push(r)
    byDate.set(r.date, a)
  }
  console.log(['選抜', 'v1(score3)', 'v2(EQS)', '差'].map(s => s.padStart(14)).join(''))
  console.log('─'.repeat(56))
  for (const topN of [1, 3, 5, 10]) {
    const pick = (cmp: (a: Result, b: Result) => number) => {
      const acc: number[] = []
      for (const [, g] of byDate) {
        const sorted = [...g].sort(cmp).slice(0, topN)
        for (const r of sorted) {
          const v = r.rets[H]
          if (v != null) acc.push(v)
        }
      }
      return mean(acc)
    }
    // v1 の並びは UI と同じく score3 降順 → rank_in_day 昇順
    const v1m = pick(
      (a, b) =>
        b.score3 - a.score3 ||
        (a.rankInDay ?? Number.POSITIVE_INFINITY) - (b.rankInDay ?? Number.POSITIVE_INFINITY),
    )
    const v2m = pick((a, b) => b.eqs - a.eqs)
    console.log(
      [`Top ${topN}`, `${f(v1m)}%`, `${f(v2m)}%`, `${v2m - v1m >= 0 ? '+' : ''}${f(v2m - v1m)}pt`]
        .map(s => s.padStart(14))
        .join(''),
    )
  }
  const allMean = mean(results.map(r => r.rets[H]).filter((v): v is number => v != null))
  console.log(`  （全銘柄平均 = ベースライン: ${f(allMean)}%）`)

  // ── 情報係数 (IC) ────────────────────────────────────────────────────
  console.log(`\n■ 情報係数 IC（当日内のスコア順位 vs ${H}d リターン順位・Spearman）`)
  const ics1: number[] = []
  const ics2: number[] = []
  for (const [, g] of byDate) {
    const valid = g.filter(r => r.rets[H] != null)
    if (valid.length < 20) continue
    const ret = valid.map(r => r.rets[H] as number)
    ics1.push(spearman(valid.map(r => r.score3), ret))
    ics2.push(spearman(valid.map(r => r.eqs), ret))
  }
  const ic1 = mean(ics1.filter(Number.isFinite))
  const ic2 = mean(ics2.filter(Number.isFinite))
  console.log(`  対象日数: ${ics1.length}（20 行以上の開示日のみ）`)
  console.log(`  v1 IC: ${f(ic1, 4)}   v2 IC: ${f(ic2, 4)}   差: ${ic2 - ic1 >= 0 ? '+' : ''}${f(ic2 - ic1, 4)}`)
  console.log(`  → ${ic2 > ic1 ? 'v2 のほうが翌日以降のリターンを説明できている ✓' : 'v2 の優位は確認できず ✗'}`)

  // ── 1Q だけの比較（v1 の構造的欠陥が最も効く領域）──────────────────
  const q1 = results.filter(r => r.cur_per_type === '1Q')
  if (q1.length) {
    console.log(`\n■ 1Q のみ（v1 が構造的に不利な領域）— ${q1.length} 行`)
    const q1WeakV1 = q1.filter(r => r.v1band === '弱')
    console.log(`  v1 で「弱(灰)」に分類された割合: ${f((q1WeakV1.length / q1.length) * 100, 1)}%`)
    console.log(`  そのうち ${H}d が +20% 以上だった件数: ${q1WeakV1.filter(r => (r.rets[H] ?? 0) >= 20).length}`)
    const q1S = q1.filter(r => r.v2band === 'S' || r.v2band === 'A')
    console.log(`  v2 で S/A に引き上がった件数: ${q1S.length}（平均 ${H}d: ${f(mean(q1S.map(r => r.rets[H]).filter((v): v is number => v != null)))}%）`)
  }

  // ── 反転した銘柄トップ（v1 弱 → v2 S/A で実際に上がったもの）─────────
  const flipped = results
    .filter(r => r.v1band === '弱' && (r.v2band === 'S' || r.v2band === 'A'))
    .sort((a, b) => (b.rets[H] ?? 0) - (a.rets[H] ?? 0))
  console.log(`\n■ v1「弱」→ v2「S/A」に反転した ${flipped.length} 件の上位 15`)
  if (flipped.length) {
    console.log(
      ['開示日', 'コード', '銘柄名', 'Q', 'score3', 'EQS', `${H}d`].map((s, i) => s.padEnd([12, 8, 20, 5, 8, 6, 9][i])).join(''),
    )
    for (const r of flipped.slice(0, 15)) {
      console.log(
        [
          r.date,
          r.code,
          (r.co_name ?? '').slice(0, 9),
          r.cur_per_type,
          String(r.score3),
          String(r.eqs),
          `${f(r.rets[H] ?? NaN)}%`,
        ]
          .map((s, i) => s.padEnd([12, 8, 20, 5, 8, 6, 9][i]))
          .join(''),
      )
    }
    console.log(`  反転群の平均 ${H}d: ${f(mean(flipped.map(r => r.rets[H]).filter((v): v is number => v != null)))}%`)
  }

  // ── CSV ──────────────────────────────────────────────────────────────
  if (CSV_PATH) {
    const header = [
      'date', 'code', 'co_name', 'cur_per_type', 'score3', 'v1_band', 'eqs', 'v2_band',
      'coverage', 'degraded', 'entry_date', 'entry',
      ...HORIZONS.map(h => `ret_${h}d`), 'mfe', 'mae',
    ]
    const lines = [header.join(',')]
    for (const r of results) {
      lines.push(
        [
          r.date, r.code, `"${(r.co_name ?? '').replace(/"/g, '""')}"`, r.cur_per_type,
          r.score3, r.v1band, r.eqs, r.v2band, r.coverage, r.degraded, r.entryDate, r.entry,
          ...HORIZONS.map(h => (r.rets[h] == null ? '' : (r.rets[h] as number).toFixed(4))),
          r.mfe == null ? '' : r.mfe.toFixed(4),
          r.mae == null ? '' : r.mae.toFixed(4),
        ].join(','),
      )
    }
    writeFileSync(CSV_PATH, lines.join('\n'))
    console.log(`\n■ CSV 出力: ${CSV_PATH} (${results.length} 行)`)
  }

  console.log('\n完了')
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
