// Stage 2 Fresh — 押し目買い候補スクリーン
// Source table: public.stage2_fresh  (PK: date + code)
// Pipeline: jquants-scanner (別リポ) が週次・金曜引け後に delete→upsert で push。
// 条件: 強い銘柄 (RS≥60 / ADR≥3%) が 150日線上向きの確立した上昇トレンドに
//       入って間もない (weeks_in_s2 ≤3) かつ流動的 (turnover_oku ≥5)。
// 注意: "候補" であって売買シグナルではない (実エントリー判断は別途)。

export type Stage2FreshRow = {
  date: string
  code: string
  co_name: string | null
  sector_s33: string | null
  scale_cat: string | null
  mkt: string | null

  s2_entry: string | null      // Stage2 (ゲート版) に入った週
  weeks_in_s2: number | null   // 経過週 1〜3 (小さいほど新しい)
  path: string | null          // 到達経路 (3top->2 / 4down->2 / 1bottom->2)

  close: number | null
  rs_topix_63: number | null   // 対TOPIX 相対強度 (63日, 0–100)
  ma150_dir: string | null     // 大局トレンドの向き (原則 up)
  ma150_slope_pct: number | null

  dist_sma50_pct: number | null   // 50日線乖離%＝押し目度 (小さいほど押し目)
  dist_sma150_pct: number | null
  adr_pct: number | null          // 日中平均変動率% (≥3)
  vol_ratio: number | null        // 相対出来高 (20日平均比)
  dist_from_high_pct: number | null // 52週高値からの距離% (負値, null あり)
  turnover_oku: number | null     // 直近20日平均 売買代金 (億円, ≥5)
  momentum_flag: boolean | null   // vol_ratio≥2 かつ adr_pct≥4 (瞬発)

  updated_at: string | null
}

// path コード → 人間可読ラベル (凡例・ツールチップ用)
export const PATH_LABELS: Record<string, string> = {
  '3top->2': '押し目復帰（天井から）',
  '4down->2': 'V字回復（下落から）',
  '1bottom->2': '王道（底から）',
}

export function pathLabel(p: string | null | undefined): string {
  if (!p) return '—'
  return PATH_LABELS[p] ?? p
}
