import { supabase } from '@/lib/supabase'
import type { OhlcvBar } from '@/types/chart'

const TABLE = 'sector_selection_s33'

export type SectorPriceResponse = {
  bars: OhlcvBar[]
  error: string | null
}

// 業種指数の生 OHLC（sector_index_*_s33）を1業種ぶん取得する。
// 新カラムは直近150営業日のみ非null（それ以前は NULL）なので、
// 余裕を持って直近 N 行を date desc で引き、null を除外して昇順に直す。
// 指数ポイントで出来高は無いため volume は 0 で埋める（OhlcvBar 互換用）。
export async function fetchSectorPriceHistory(
  sectorName: string,
  lookbackRows = 220,
): Promise<SectorPriceResponse> {
  const { data, error } = await supabase
    .from(TABLE)
    .select(
      'date, sector_index_open_s33, sector_index_high_s33, sector_index_low_s33, sector_index_close_s33',
    )
    .eq('sector_name_s33', sectorName)
    .order('date', { ascending: false })
    .limit(lookbackRows)

  if (error) {
    console.error('[sector_selection_s33 price]', error)
    return { bars: [], error: error.message }
  }

  const rows = (data ?? []) as unknown as Record<string, unknown>[]

  const bars: OhlcvBar[] = rows
    .map((r) => ({
      date: r.date as string,
      open: r.sector_index_open_s33 as number | null,
      high: r.sector_index_high_s33 as number | null,
      low: r.sector_index_low_s33 as number | null,
      close: r.sector_index_close_s33 as number | null,
    }))
    .filter(
      (b) =>
        b.date &&
        b.open != null &&
        b.high != null &&
        b.low != null &&
        b.close != null,
    )
    .map((b) => ({
      date: b.date,
      open: Number(b.open),
      high: Number(b.high),
      low: Number(b.low),
      close: Number(b.close),
      volume: 0,
    }))
    // date desc で取ったので昇順に戻す
    .reverse()

  return { bars, error: null }
}
