// 押し目ウォッチ（Daily Watch）— 新2テーブル
// Source tables: public.coil_pullback_setups / public.ma_pullback_setups (PK: date + code)
// Pipeline: jquants-scanner (別リポ) が毎日・平日引け後 (~18:00 JST) に当日分を upsert（冪等）。
//   最新 date が「今日の候補」。ダッシュは読み取り専用でブラウザから直接クエリする
//   (stage2_fresh / market_leaders と同方針。`output: export` のため API ルートは無い)。
// 注意: これは押し目"候補"ウォッチであって買いシグナルではない（実エントリーは別途）。
//
// スキャナーは生値のみ返す。グレード分けはダッシュ側で算出（閾値を後から変えられる設計）。

// ── ① coil_pullback_setups（高値圏の静かなベース＝収縮）─────────────────────
export type CoilPullbackRow = {
  date: string
  code: string
  co_name: string | null
  sector_s33: string | null
  scale_cat: string | null
  mkt: string | null

  close: number | null
  iqr5: number | null               // 終値の収縮度（小さいほどタイト）
  vs_peak63_pct: number | null      // 63本ピークからの位置(%)
  dist_from_high_pct: number | null // 52週高値からの距離(%)

  rs_topix_avg: number | null       // 強さ
  adr_pct: number | null            // ボラ
  turnover_oku: number | null       // 流動性（売買代金, 億円）
  vol_ma20_man: number | null       // 流動性（20日平均出来高, 万株）
  vol_ratio: number | null          // 相対出来高（20日平均比）

  fresh: boolean | null             // 直近5営業日に未出現＝新規
}

// ── ② ma_pullback_setups（高値圏 momentum の押し目）─────────────────────────
export type MaPullbackRow = {
  date: string
  code: string
  co_name: string | null
  sector_s33: string | null
  scale_cat: string | null
  mkt: string | null

  close: number | null
  dist_from_high_pct: number | null // 52週高値からの距離(%)【位置軸】

  dist_ema10_adr: number | null     // EMA10 乖離（ADR単位）【深さ軸】
  dist_ema21_adr: number | null     // EMA21 乖離（ADR単位）【深さ軸】
  dist_sma50_adr: number | null     // SMA50 乖離（ADR単位）【深さ軸】

  ret63: number | null              // 3ヶ月モメンタム(%)
  rs: number | null                 // 強さ
  adr_pct: number | null            // ボラ
  turnover_oku: number | null       // 流動性（売買代金, 億円）
  vol_ma20_man: number | null       // 流動性（20日平均出来高, 万株）
  volume_ratio: number | null       // 相対出来高（20日平均比）

  fresh: boolean | null             // 新規
}

function isNum(v: number | null | undefined): v is number {
  return v !== null && v !== undefined && Number.isFinite(v)
}

// ── MA グレード算出（生値→2軸）────────────────────────────────────────────
// 位置軸（dist_from_high_pct, 高値への近さ）: ≥-5→A++ / ≥-10→A+ / それ未満→base
export type MaPositionGrade = 'A++' | 'A+' | 'base'

export function maPositionGrade(distFromHighPct: number | null): MaPositionGrade | null {
  if (!isNum(distFromHighPct)) return null
  if (distFromHighPct >= -5) return 'A++'
  if (distFromHighPct >= -10) return 'A+'
  return 'base'
}

// 深さ軸: dist_ema10/21/50_adr のうち 0〜0.5 を満たす「最深MA」を採用。
//   SMA50（深い押し目）→ A(50) / EMA21 → B(21) / EMA10（浅い）→ C(10)
export type MaDepthGrade = 'A' | 'B' | 'C'

export type MaDepthInfo = {
  grade: MaDepthGrade
  ma: 10 | 21 | 50
  adr: number       // 採用したMAからの乖離（ADR単位, 0〜0.5）
  label: string     // 'A(50)' / 'B(21)' / 'C(10)'
}

const DEPTH_BAND_MIN = 0
const DEPTH_BAND_MAX = 0.5

function inDepthBand(v: number | null): v is number {
  return isNum(v) && v >= DEPTH_BAND_MIN && v <= DEPTH_BAND_MAX
}

export function maDepthInfo(row: MaPullbackRow): MaDepthInfo | null {
  // 最深MA優先（SMA50 → EMA21 → EMA10）
  if (inDepthBand(row.dist_sma50_adr)) {
    return { grade: 'A', ma: 50, adr: row.dist_sma50_adr, label: 'A(50)' }
  }
  if (inDepthBand(row.dist_ema21_adr)) {
    return { grade: 'B', ma: 21, adr: row.dist_ema21_adr, label: 'B(21)' }
  }
  if (inDepthBand(row.dist_ema10_adr)) {
    return { grade: 'C', ma: 10, adr: row.dist_ema10_adr, label: 'C(10)' }
  }
  return null
}

export type MaGrade = {
  position: MaPositionGrade | null
  depth: MaDepthInfo | null
  combined: string | null   // 例 'A(50)×A++'（深さ×位置）。両軸そろう時のみ
  score: number             // 並べ替え用（大きいほど良 / 最上位 A(50)×A++ = 33）
}

const POS_RANK: Record<MaPositionGrade, number> = { 'A++': 3, 'A+': 2, base: 1 }
const DEPTH_RANK: Record<MaDepthGrade, number> = { A: 3, B: 2, C: 1 }

export function maGrade(row: MaPullbackRow): MaGrade {
  const position = maPositionGrade(row.dist_from_high_pct)
  const depth = maDepthInfo(row)
  const posRank = position ? POS_RANK[position] : 0
  const depthRank = depth ? DEPTH_RANK[depth.grade] : 0
  // 深さを主軸（×10）、位置を従軸。両軸そろう時のみ combined を出す。
  const score = depthRank * 10 + posRank
  const combined = depth && position ? `${depth.label}×${position}` : null
  return { position, depth, combined, score }
}
