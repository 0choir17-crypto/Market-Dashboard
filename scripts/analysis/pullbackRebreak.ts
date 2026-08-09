/**
 * 押し目深度 → 再ブレイク難易度の検証 CLI
 *
 * 「高値からの押しが何％下落したら再ブレイクが困難になるか」を、chart_ohlcv_cache の
 * 日足全history から実測する。ロジックは pullbackRebreakCore.ts（DB非依存）。
 *
 * 実行方法:
 *   npx tsx scripts/analysis/pullbackRebreak.ts
 *   npx tsx scripts/analysis/pullbackRebreak.ts --universe daily_signals --limit-codes 300
 *   npx tsx scripts/analysis/pullbackRebreak.ts --basis hl --segments adr,trend --out .analysis/pullback
 *
 * .env.local / .env の NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY を自動ロードする。
 *
 * 主なオプション（既定値は DEFAULT_PARAMS 準拠）:
 *   --codes 7203,6758        対象銘柄を直接指定（指定時は universe 探索をしない）
 *   --universe ohlcv|daily_signals   銘柄リストの取得元（既定 ohlcv）
 *   --limit-codes N          対象銘柄数の上限（既定 400。0 = 無制限）
 *   --from YYYY-MM-DD        日足の開始日
 *   --to   YYYY-MM-DD        日足の終了日
 *   --basis close|hl         価格基準（既定 close）
 *   --trigger 3              押し開始とみなす下落率(%)
 *   --peak-lookback 60       起点高値の足切り（直近N本の最高値であること）
 *   --max-episode-bars 500   1エピソードを追う最大営業日数（最長ホライズンより十分大きく取る）
 *   --min-turnover 1         高値時点の20日平均売買代金（億円）の下限
 *   --confirm-bars 5         再ブレイク後の「確定」判定日数
 *   --headline-horizon 60    結論行で使うホライズン
 *   --segments adr,trend,dist52w,year   セグメント別カーブも出す
 *   --concurrency 6          Supabase への同時リクエスト数
 *   --out DIR                episodes.csv / curves.json を書き出す
 */
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  DEFAULT_PARAMS,
  buildCurve,
  buildEpisodes,
  groupBy,
  type AnalyzeParams,
  type Bar,
  type Curve,
  type Episode,
  type PriceBasis,
  type SegmentKey,
} from './pullbackRebreakCore'
import { formatCurve, formatKnee, legend, writeOutputs } from './pullbackRebreakReport'

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

// ── args ───────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2)

function arg(name: string): string | undefined {
  const i = argv.indexOf(`--${name}`)
  if (i === -1) return undefined
  const v = argv[i + 1]
  return v && !v.startsWith('--') ? v : ''
}

function numArg(name: string, fallback: number): number {
  const v = arg(name)
  if (v === undefined || v === '') return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

const params: AnalyzeParams = {
  ...DEFAULT_PARAMS,
  basis: (arg('basis') as PriceBasis) === 'hl' ? 'hl' : 'close',
  triggerPct: numArg('trigger', DEFAULT_PARAMS.triggerPct),
  peakLookback: numArg('peak-lookback', DEFAULT_PARAMS.peakLookback),
  maxEpisodeBars: numArg('max-episode-bars', DEFAULT_PARAMS.maxEpisodeBars),
  minTurnoverOku: numArg('min-turnover', DEFAULT_PARAMS.minTurnoverOku),
  confirmBars: numArg('confirm-bars', DEFAULT_PARAMS.confirmBars),
  minBars: numArg('min-bars', DEFAULT_PARAMS.minBars),
}

const OPTS = {
  codes: (arg('codes') ?? '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
  universe: arg('universe') === 'daily_signals' ? 'daily_signals' : 'chart_ohlcv_cache',
  limitCodes: numArg('limit-codes', 400),
  from: arg('from') || null,
  to: arg('to') || null,
  headlineHorizon: numArg('headline-horizon', 60),
  segments: (arg('segments') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is SegmentKey => s === 'adr' || s === 'trend' || s === 'dist52w' || s === 'year'),
  concurrency: Math.max(1, numArg('concurrency', 6)),
  out: arg('out') || null,
}

// ── Supabase ───────────────────────────────────────────────────────────────

const PAGE = 1000

async function fetchAll<Row>(
  build: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>,
  maxRows = 200_000,
): Promise<Row[]> {
  const rows: Row[] = []
  for (let from = 0; from < maxRows; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < PAGE) break
  }
  return rows
}

/** 直近の営業日付近に存在する銘柄コードを、指定テーブルから拾う。 */
async function fetchUniverse(sb: SupabaseClient, table: string, limit: number): Promise<string[]> {
  const { data: latest, error: latestErr } = await sb
    .from(table)
    .select('date')
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (latestErr) throw new Error(`${table} latest date: ${latestErr.message}`)
  const latestDate = (latest?.date as string | undefined) ?? null
  if (!latestDate) return []

  // 最新日だけだと取りこぼす（銘柄ごとに更新日がずれる）ので直近 10 日ぶん見る
  const since = new Date(`${latestDate}T00:00:00Z`)
  since.setUTCDate(since.getUTCDate() - 10)
  const sinceStr = since.toISOString().slice(0, 10)

  const rows = await fetchAll<{ code: string }>((from, to) =>
    sb
      .from(table)
      .select('code')
      .gte('date', sinceStr)
      .order('date', { ascending: false })
      .order('code', { ascending: true })
      .range(from, to),
  )
  const codes = [...new Set(rows.map((r) => r.code).filter(Boolean))].sort()
  return limit > 0 ? codes.slice(0, limit) : codes
}

async function fetchBars(sb: SupabaseClient, code: string): Promise<Bar[]> {
  return fetchAll<Bar>((from, to) => {
    let q = sb
      .from('chart_ohlcv_cache')
      .select('date, open, high, low, close, volume')
      .eq('code', code)
    if (OPTS.from) q = q.gte('date', OPTS.from)
    if (OPTS.to) q = q.lte('date', OPTS.to)
    return q.order('date', { ascending: true }).range(from, to)
  })
}

/** 同時実行数を絞ったワーカープール。anon key で数百銘柄を舐めるので暴走させない。 */
async function pool<T, R>(items: T[], size: number, worker: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let cursor = 0
  const run = async () => {
    for (;;) {
      const i = cursor++
      if (i >= items.length) return
      out[i] = await worker(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, run))
  return out
}

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  loadEnv('.env.local')
  loadEnv('.env')

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    console.error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY が未設定です (.env.local を確認)')
    process.exit(1)
  }
  const sb = createClient(url, key)

  let codes = OPTS.codes
  if (codes.length === 0) {
    process.stderr.write(`銘柄リストを ${OPTS.universe} から取得中...\n`)
    codes = await fetchUniverse(sb, OPTS.universe, OPTS.limitCodes)
  }
  if (codes.length === 0) {
    console.error('対象銘柄が 0 件でした。--codes で明示指定するか --universe を変えてください。')
    process.exit(1)
  }
  process.stderr.write(`対象 ${codes.length} 銘柄 / 日足を取得して解析します（同時 ${OPTS.concurrency}）\n`)

  let done = 0
  let failed = 0
  const perCode = await pool(codes, OPTS.concurrency, async (code) => {
    try {
      const bars = await fetchBars(sb, code)
      return buildEpisodes(code, bars, params)
    } catch (e) {
      failed++
      process.stderr.write(`  ! ${code}: ${(e as Error).message}\n`)
      return [] as Episode[]
    } finally {
      done++
      if (done % 25 === 0) process.stderr.write(`  ${done}/${codes.length}\n`)
    }
  })

  const episodes = perCode.flat()
  if (episodes.length === 0) {
    console.error('エピソードが 0 件でした。--min-bars / --min-turnover / --from を緩めてください。')
    process.exit(1)
  }

  const withBars = new Set(episodes.map((e) => e.code)).size
  console.log(
    `\n=== 押し目深度 → 再ブレイク難易度 ===\n` +
      `銘柄 ${withBars}/${codes.length}（取得失敗 ${failed}）・エピソード ${episodes.length} 件\n` +
      `価格基準 ${params.basis} / 押し開始 ${params.triggerPct}% / 起点高値=直近${params.peakLookback}本の最高値 / 追跡上限 ${params.maxEpisodeBars}営業日\n\n` +
      legend(params),
  )

  const curves: Curve[] = []
  const pctCurve = buildCurve('pct', '全体', episodes, params)
  const adrCurve = buildCurve('adr', '全体', episodes, params)
  curves.push(pctCurve, adrCurve)
  for (const c of [pctCurve, adrCurve]) {
    console.log(formatCurve(c, params))
    console.log(formatKnee(c, OPTS.headlineHorizon))
  }

  for (const key of OPTS.segments) {
    for (const [label, eps] of groupBy(episodes, key)) {
      if (eps.length < 50) continue
      const c = buildCurve('pct', `${key}: ${label}`, eps, params)
      curves.push(c)
      console.log(formatCurve(c, params))
      console.log(formatKnee(c, OPTS.headlineHorizon))
    }
  }

  if (OPTS.out) {
    const paths = writeOutputs(OPTS.out, params, episodes, curves)
    console.log(`\n書き出し: ${paths.csv} / ${paths.json}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
