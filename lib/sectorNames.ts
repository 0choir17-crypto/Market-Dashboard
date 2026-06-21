import { supabase } from '@/lib/supabase'

// TOPIX-33 業種名の一覧を sector_selection_s33 から取得（最新営業日の distinct）。
// trades.sector_s33 と同じ表記（sector_name_s33）を使うため、ホットセクター判定や
// セクター集計と表記が揃う。フェッチ失敗時は下のフォールバック（東証33業種）を返す。

export const TOPIX33_FALLBACK: string[] = [
  '水産・農林業', '鉱業', '建設業', '食料品', '繊維製品', 'パルプ・紙', '化学', '医薬品',
  '石油・石炭製品', 'ゴム製品', 'ガラス・土石製品', '鉄鋼', '非鉄金属', '金属製品', '機械',
  '電気機器', '輸送用機器', '精密機器', 'その他製品', '電気・ガス業', '陸運業', '海運業',
  '空運業', '倉庫・運輸関連業', '情報・通信業', '卸売業', '小売業', '銀行業',
  '証券・商品先物取引業', '保険業', 'その他金融業', '不動産業', 'サービス業',
]

export async function fetchSectorNames33(): Promise<string[]> {
  const { data: latest, error: latestErr } = await supabase
    .from('sector_selection_s33')
    .select('date')
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (latestErr || !latest?.date) {
    if (latestErr) console.error('[sector_selection_s33] latest date error', latestErr)
    return TOPIX33_FALLBACK
  }

  const { data, error } = await supabase
    .from('sector_selection_s33')
    .select('sector_name_s33')
    .eq('date', latest.date as string)

  if (error || !data || data.length === 0) {
    if (error) console.error('[sector_selection_s33] sector names error', error)
    return TOPIX33_FALLBACK
  }

  const names = [...new Set(
    data.map(r => r.sector_name_s33 as string | null).filter((s): s is string => !!s),
  )]
  names.sort((a, b) => a.localeCompare(b, 'ja'))
  return names.length > 0 ? names : TOPIX33_FALLBACK
}
