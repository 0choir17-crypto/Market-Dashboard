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

// vol_5d 色分け: 機関買い継続 / 通常 / 警戒 / 出来高枯渇
export function volColor(v: number | null | undefined): { bg: string; text: string; label: string } {
  if (v === null || v === undefined || !Number.isFinite(v)) {
    return { bg: '#f3f4f6', text: '#9ca3af', label: '--' }
  }
  if (v >= 1.5) return { bg: '#bbf7d0', text: '#14532d', label: '機関買い継続' }
  if (v >= 1.0) return { bg: '#dcfce7', text: '#166534', label: '通常上昇' }
  if (v >= 0.7) return { bg: '#fef3c7', text: '#92400e', label: '警戒' }
  return { bg: '#fee2e2', text: '#b91c1c', label: '出来高枯渇' }
}

// cs_avg のバー色 (パーセンタイル評価)
export function csBarColor(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '#e5e7eb'
  if (v >= 95) return '#16a34a'
  if (v >= 85) return '#22c55e'
  if (v >= 70) return '#eab308'
  return '#9ca3af'
}

// 初動 (emerging_cs) のバー色: 高い=加速中(緑) / 低い=成熟・失速(灰)。閾値は調整可。
export function emergingBarColor(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '#e5e7eb'
  if (v >= 80) return '#16a34a'  // 加速中
  if (v >= 65) return '#22c55e'  // やや加速
  if (v >= 55) return '#eab308'  // 中間
  return '#9ca3af'               // 成熟・失速
}

// scalecat の表示色
export function scaleCatColor(cat: string | null | undefined): { bg: string; text: string } {
  if (!cat || cat === '-') return { bg: '#f3f4f6', text: '#6b7280' }
  if (cat.includes('Core30')) return { bg: '#dbeafe', text: '#1e40af' }
  if (cat.includes('Large70')) return { bg: '#e0e7ff', text: '#3730a3' }
  if (cat.includes('Mid400')) return { bg: '#f3e8ff', text: '#6b21a8' }
  if (cat.includes('Small 1') || cat.includes('Small1')) return { bg: '#fef3c7', text: '#92400e' }
  if (cat.includes('Small 2') || cat.includes('Small2')) return { bg: '#fed7aa', text: '#9a3412' }
  return { bg: '#f3f4f6', text: '#6b7280' }
}
