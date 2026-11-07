// エントリー種別。押し目（9/21EMA・VWAP）とブレイクで期待値を比べるための分類。
// trades.entry_type に表示名のまま保存する（supabase/migrations/20261107_entry_type.sql）。
export const ENTRY_TYPES = [
  '押し目 9EMA',
  '押し目 21EMA',
  '押し目 VWAP',
  'ブレイク',
  'その他',
] as const

export type EntryType = (typeof ENTRY_TYPES)[number]

/** 押し目系か（集計の大分類用） */
export function isPullback(t: string | null | undefined): boolean {
  return !!t && t.startsWith('押し目')
}
