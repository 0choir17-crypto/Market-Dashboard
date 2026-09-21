// Inside Day（当日の高値・安値が前日の値幅の内側に収まった日）— Daily Watch の新テーブル。
// Source table: public.inside_day_setups  (PK: date + code, anon SELECT 可・RLS public read)
// Pipeline: jquants-scanner (別リポ) `scripts/daily/scan_inside_day.py`（本番 run_daily Step1e）が
//   毎晩、直近5営業日ぶんを冪等 upsert。過去行は書き換わらない（status の概念なし）。
//
// 検出条件（厳密。前日と同値の日は含めない）:
//   当日高値 < 前日高値  かつ  当日安値 > 前日安値
// 高値・安値はヒゲ込み。実体で判定する「はらみ線」とは別物。
// 前日の足を「マザーバー」と呼び、その高値・安値が翌日以降に見る 2 本の水平線になる。
//
// ⚠️ 位置づけ:
//   このスキャナーは成績（勝率・期待値）の検証をしていない。ウォッチリスト専用。
//   したがってダッシュ側では
//     - スコア / グレード / ランク付けをしない（順位の根拠が無いため）
//     - 「買いシグナル」「エントリー推奨」という表現を使わない
//     - 既定の並びは range_pct 昇順（＝収縮の度合いという事実の並び。良し悪しの順位ではない）
//   正しい位置づけは「毎朝チャートを開く銘柄を機械的に絞り込んだリスト」。最終判断は手動。
//
// ユニバース（このテーブルに載っている時点で全て充足）:
//   個別株のみ（プライム / スタンダード / グロース）/ ADR%₂₀ ≥ 3 / 20日平均出来高 ≥ 10万株 /
//   150日単純移動平均が上向き（20営業日前より上）/ 終値 ≥ 500円
//   → 約 290〜430 銘柄/日
//
// 件数感（直近1年・244営業日の実測）: 平均 44 / 中央値 39（p25 25 / p75 56 / p95 99）/ 最少2 〜 最多204。
//   日によるばらつきが大きく 100 件超の日もあるので、一覧はページネーション前提で組む。

export const INSIDE_DAY_TABLE = 'inside_day_setups'

// DB の 1 行 = 1 銘柄 1 日。
export type InsideDaySetupRow = {
  date: string // インサイドデー当日（PK）。引け後に確定
  code: string // 銘柄コード（PK）。`325A` のように英字を含む

  co_name: string | null
  market: string | null // プライム / スタンダード / グロース
  sector_s33: string | null // 東証33業種名

  close: number | null // 当日終値（生の株価）
  high: number | null // 当日高値（分割調整済み）
  low: number | null // 当日安値（分割調整済み）

  mother_high: number | null // 前日（マザーバー）の高値 = 上抜けを見るライン
  mother_low: number | null // 前日（マザーバー）の安値 = 割れを見るライン

  range_pct: number | null // 当日値幅 ÷ 前日値幅 × 100。定義上 0〜100 未満。小さいほど強く収縮
  inside_streak: number | null // 当日を含む連続インサイド日数。1 = 単発、2 以上 = 連続（全体の約 5%）

  adr_pct: number | null // ADR%（20日）
  vol_ma20_man: number | null // 出来高 20日平均（万株）
  turnover_oku: number | null // 売買代金 20日平均（億円/日）
  vol_ratio: number | null // 当日出来高 ÷ 20日平均
  rs_topix_avg: number | null // 対TOPIX RS 平均（21/63/126d）0-100
  dist_from_high_pct: number | null // 52週高値からの乖離%（0 に近いほど高値圏、負値）
  ext_sma150_pct: number | null // 終値の 150SMA からの乖離%
}

// 市場区分。フィルタの選択肢としてこの順に並べる（配信側の値をそのまま使う）。
export const MARKETS = ['プライム', 'スタンダード', 'グロース'] as const

function isNum(v: number | null | undefined): v is number {
  return v !== null && v !== undefined && Number.isFinite(v)
}

/**
 * close（生の株価）が high / low（分割調整済み）と桁でずれているか。
 *
 * 直近5営業日の範囲では通常一致するが、その間に株式分割があった銘柄だけ
 * close だけが調整前の値のまま残り、当日の値幅の外に出る。そのときは
 *   - 帯の中の終値マーカーを描かない
 *   - 「終値 → マザーバー高値」の距離を出さない（比が壊れているため）
 * ことで、誤った位置・誤った%を見せないようにする。
 *
 * 丸め誤差で誤検知しないよう 0.1% の許容を持たせる。
 */
export function isCloseAdjustmentMismatch(row: InsideDaySetupRow): boolean {
  if (!isNum(row.close) || !isNum(row.high) || !isNum(row.low)) return false
  return row.close > row.high * 1.001 || row.close < row.low * 0.999
}

/**
 * 終値からマザーバー高値までの距離（%）。(mother_high / close − 1) × 100。
 * DB には無い計算列。分割調整のずれがある行は null を返す。
 */
export function distToMotherHighPct(row: InsideDaySetupRow): number | null {
  if (!isNum(row.close) || !isNum(row.mother_high) || row.close === 0) return null
  if (isCloseAdjustmentMismatch(row)) return null
  return (row.mother_high / row.close - 1) * 100
}

/**
 * 終値からマザーバー安値までの距離（%）。(mother_low / close − 1) × 100。負値。
 * 上に同じく、分割調整のずれがある行は null。
 */
export function distToMotherLowPct(row: InsideDaySetupRow): number | null {
  if (!isNum(row.close) || !isNum(row.mother_low) || row.close === 0) return null
  if (isCloseAdjustmentMismatch(row)) return null
  return (row.mother_low / row.close - 1) * 100
}

// 帯（マザーバーの中で当日の値幅がどこに寄って縮んだか）の描画に使う比率。
// マザーバーの安値〜高値を 0〜100 に正規化した位置。
export type InsideDayBandGeometry = {
  lowPct: number // 当日安値の位置
  highPct: number // 当日高値の位置
  closePct: number | null // 終値の位置。分割調整のずれがある行は null（マーカーを描かない）
}

export function bandGeometry(row: InsideDaySetupRow): InsideDayBandGeometry | null {
  const { mother_low: ml, mother_high: mh, low, high } = row
  if (!isNum(ml) || !isNum(mh) || !isNum(low) || !isNum(high)) return null
  const span = mh - ml
  if (!(span > 0)) return null // マザーバーが十字線（高値=安値）だと比率が作れない

  const pos = (v: number) => Math.min(100, Math.max(0, ((v - ml) / span) * 100))
  const closePct =
    isNum(row.close) && !isCloseAdjustmentMismatch(row) ? pos(row.close) : null

  return { lowPct: pos(low), highPct: pos(high), closePct }
}
