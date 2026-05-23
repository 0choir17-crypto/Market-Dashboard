/**
 * 既存CLOSEDトレードに MFE/MAE をバックフィルするスクリプト
 *
 * 実行方法:
 *   npx tsx scripts/backfill_mfe_mae.ts
 *
 * .env.local の NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY を自動ロードする
 */
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { createClient } from '@supabase/supabase-js'

// .env.local をマニュアルロード（tsxは自動で読まないため）
function loadEnv(file: string) {
  const path = join(process.cwd(), file)
  if (!existsSync(path)) return
  const raw = readFileSync(path, 'utf-8')
  for (const line of raw.split(/\r?\n/)) {
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

interface MfeMaeResult {
  mfe_price: number
  mfe_date: string
  mfe_pct: number
  mae_price: number
  mae_date: string
  mae_pct: number
}

async function calculateMfeMae(
  ticker: string,
  entryDate: string,
  exitDate: string,
  entryPrice: number,
): Promise<MfeMaeResult | null> {
  const { data, error } = await supabase
    .from('daily_signals')
    .select('date, close')
    .eq('code', ticker)
    .gte('date', entryDate)
    .lte('date', exitDate)
    .order('date', { ascending: true })

  if (error || !data || data.length === 0) return null

  const byDate = new Map<string, number>()
  for (const row of data as { date: string; close: number | null }[]) {
    if (row.close == null) continue
    if (!byDate.has(row.date)) byDate.set(row.date, row.close)
  }
  if (byDate.size === 0) return null

  let mfeDate = '', mfePrice = -Infinity
  let maeDate = '', maePrice = Infinity
  for (const [date, close] of byDate) {
    if (close > mfePrice) { mfePrice = close; mfeDate = date }
    if (close < maePrice) { maePrice = close; maeDate = date }
  }

  return {
    mfe_price: mfePrice,
    mfe_date:  mfeDate,
    mfe_pct:   ((mfePrice - entryPrice) / entryPrice) * 100,
    mae_price: maePrice,
    mae_date:  maeDate,
    mae_pct:   ((maePrice - entryPrice) / entryPrice) * 100,
  }
}

async function main() {
  console.log('MFE/MAE バックフィル開始...')

  const { data: trades, error } = await supabase
    .from('trades')
    .select('id, ticker, entry_date, exit_date, entry_price')
    .eq('status', 'closed')
    .is('mfe_pct', null)

  if (error) {
    console.error('トレード取得エラー:', error)
    process.exit(1)
  }

  const targets = trades ?? []
  console.log(`対象トレード: ${targets.length}件`)

  let success = 0
  let failed = 0

  for (const t of targets as Array<{ id: number; ticker: string; entry_date: string; exit_date: string | null; entry_price: number | null }>) {
    if (!t.exit_date || t.entry_price == null) {
      console.log(`スキップ: ${t.ticker} (データ不足)`)
      failed++
      continue
    }

    try {
      const result = await calculateMfeMae(t.ticker, t.entry_date, t.exit_date, t.entry_price)
      if (!result) {
        console.log(`データなし: ${t.ticker} ${t.entry_date}〜${t.exit_date}`)
        failed++
        continue
      }

      const { error: updateErr } = await supabase
        .from('trades')
        .update(result)
        .eq('id', t.id)

      if (updateErr) {
        console.error(`更新エラー ${t.ticker}:`, updateErr.message)
        failed++
      } else {
        console.log(`✓ ${t.ticker}: MFE=${result.mfe_pct.toFixed(1)}% (${result.mfe_date}), MAE=${result.mae_pct.toFixed(1)}% (${result.mae_date})`)
        success++
      }
    } catch (e) {
      console.error(`例外 ${t.ticker}:`, e)
      failed++
    }

    // スロットリング
    await new Promise(r => setTimeout(r, 50))
  }

  console.log(`\n完了: 成功${success}件、失敗${failed}件`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
