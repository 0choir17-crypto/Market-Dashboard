// 東証クロスセクション top 50 銘柄の日次スナップショット
// Source table: public.market_leaders  (PK: code + date)
// Pipeline: jquants-scanner (別リポ) が平日 18:23 JST に upsert

export type PassRoute = 'template' | 'ipo'

export type MarketLeader = {
  code: string
  date: string
  coname: string | null
  s33: string | null
  s33nm: string | null
  scalecat: string | null
  mkt: string | null

  market_rank: number | null
  pass_route: PassRoute | null

  close: number | null

  // 主軸スコア
  cs_avg: number | null
  cs_21d: number | null
  cs_63d: number | null

  // 初動スコア（鏡像）: 高い=今RSが加速中（初動）/ 低い=成熟・失速。cs_avg と同じ 0-100。
  emerging_cs: number | null
  rs_topix_mom_21d: number | null  // 対TOPIX RS(21d) の 21営業日変化＝RS加速度
  rs_topix_mom_5d: number | null   // 同・5営業日変化（ごく直近）

  return_63d: number | null
  return_21d: number | null
  return_5d: number | null

  // 参考 RS (Pine 流時系列、cs_avg とは別物)
  rs_topix_avg: number | null
  rs_sector_avg: number | null

  dist_high: number | null
  vol_5d: number | null

  vcs: number | null
  vcs_days: number | null
  adr: number | null

  turnover_oku: number | null
  mcap_oku: number | null
}

// vol_5d 色分け: 機関買い継続 / 通常 / 警戒 / 出来高枯渇。
// 色は意味語彙（globals.css の --sem-*）から取る。生の 16 進は持たない。
export function volColor(v: number | null | undefined): { bg: string; text: string; label: string } {
  if (v === null || v === undefined || !Number.isFinite(v)) {
    return { bg: 'var(--sem-idle-bg)', text: 'var(--sem-idle-fg)', label: '--' }
  }
  if (v >= 1.5) return { bg: 'var(--sem-strong-bg)', text: 'var(--sem-strong-fg)', label: '機関買い継続' }
  if (v >= 1.0) return { bg: 'var(--sem-ok-bg)', text: 'var(--sem-ok-fg)', label: '通常上昇' }
  if (v >= 0.7) return { bg: 'var(--sem-watch-bg)', text: 'var(--sem-watch-fg)', label: '警戒' }
  return { bg: 'var(--sem-weak-bg)', text: 'var(--sem-weak-fg)', label: '出来高枯渇' }
}

// cs_avg のバー色 (パーセンタイル評価)
export function csBarColor(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return 'var(--sem-idle-bd)'
  if (v >= 95) return 'var(--sem-strong-fg)'
  if (v >= 85) return 'var(--sem-ok-fg)'
  if (v >= 70) return 'var(--sem-watch-fg)'
  return 'var(--sem-idle-fg)'
}

// 初動 (emerging_cs) のバー色: 高い=加速中(緑) / 低い=成熟・失速(灰)。閾値は調整可。
export function emergingBarColor(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return 'var(--sem-idle-bd)'
  if (v >= 80) return 'var(--sem-strong-fg)' // 加速中
  if (v >= 65) return 'var(--sem-ok-fg)'     // やや加速
  if (v >= 55) return 'var(--sem-watch-fg)'  // 中間
  return 'var(--sem-idle-fg)'                // 成熟・失速
}

// scalecat の表示色。
// 規模の分類であって良し悪しではないので、色は付けない（設計原則 1）。
// 区別が要るときはラベルの文字そのもので読む。
export function scaleCatColor(): { bg: string; text: string } {
  return { bg: 'var(--sem-idle-bg)', text: 'var(--sem-idle-fg)' }
}
