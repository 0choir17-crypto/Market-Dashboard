// 出来高イグニッション（枯れ→点火）— Daily Watch の瞬発トレード用ウォッチリスト
// Source table: public.volume_ignition  (PK: date + code, anon SELECT 可・RLS public read)
// Pipeline: jquants-scanner (別リポ) が毎晩・平日引け後に当日分を upsert（冪等）。
//   最新 date が「今日の点火銘柄」。各行は直近5営業日以内に点火した銘柄（銘柄ごとに最新1件）。
//   ダッシュは読み取り専用でブラウザから直接クエリする（coil/ma_pullback_setups と同方針）。
// 位置づけ: push型シグナルではなく「素早く利確する瞬発トレード用ウォッチリスト」。
//   管理ルール: 即利確（中央~10日）/ −15%ストップ / 持ち切り厳禁（63日中央 −8%）/
//   adr_extreme=true（ADR>12）は大負け多発帯＝減サイズ警告。
//
// スキャナーは生値のみ返す。グレード分け・色分けはダッシュ側で算出（閾値を後から変えられる設計）。

export type VolumeIgnitionRow = {
  date: string                       // スキャン基準日（直近営業日）。最新= max(date)
  code: string
  co_name: string | null
  sector_s33: string | null
  scale_cat: string | null           // 規模区分（"-"=区分外の小型）
  mkt: string | null                 // 0111=プライム/0112=スタンダード/0113=グロース

  entry_date: string | null          // 枯れ→点火が立った日（シグナル発火日）
  days_since_entry: number | null    // スキャン日−点火日（営業日）。0=当日点火、最大5

  entry_close: number | null         // 点火日の終値
  close: number | null               // 直近終値
  ret_since_entry_pct: number | null // 点火日からの騰落率(%)。マイナス=既に押している

  vol_ratio: number | null           // 点火日 出来高/20日平均（≥2）。点火の強さ
  vol_5d: number | null              // 点火日 volume_ratio の5日平均（直前は枯れ≤0.9）
  adr_pct: number | null             // ADR%（20本）。日中ボラ容量（≥4が条件）
  adr_extreme: boolean | null        // adr>12（大負け多発帯）＝減サイズ警告

  rs_topix_63: number | null         // 対TOPIX 相対強さ 63日（0–100）
  rs_topix_avg: number | null        // 同（21/63/126平均、0–100）。強さ主指標

  dist_sma50_pct: number | null      // 50日線からの乖離(%)（過熱目安）
  dist_sma150_pct: number | null     // 150日線からの乖離(%)（大=伸び切り）
  dist_from_high_pct: number | null  // 52週高値からの距離(%、0=高値更新)
  turnover_oku: number | null        // 直近20日平均 売買代金（億円）。流動性

  updated_at: string | null
}

// 当日点火（days_since_entry=0）を「最も新しい初動」として強調。
export const FRESH_IGNITION_DAYS = 0

export function isFreshIgnition(row: VolumeIgnitionRow): boolean {
  return row.days_since_entry === FRESH_IGNITION_DAYS
}
