// ベース上抜けイベント（Darvas Box 改） — Daily Watch の新テーブル。
// Source table: public.box_breakout_events  (PK: date + code, anon SELECT 可・RLS public read)
// Pipeline: jquants-scanner (別リポ) が毎営業日・引け後 (Step1i) に「直近10営業日に
//   ブレイクしたイベント」を upsert（冪等）。DDL は jquants-scanner `sql/box_breakout_events.sql`。
//
// 「ベース（揉み合い箱）を上抜けた銘柄のウォッチリスト」。買い持ちシグナルではなく候補検出で、
// エントリー/手仕舞いは利用者のチャート判断が前提。
//
// 本テーブルの肝: 同一 date+code の `status` が後日書き換わる。
//   仮ブレイク当日      → PENDING（速報・確認中）
//   5営業日 天井の上に留まる → CONFIRMED（確定, confirm_date 付与）
//   途中で箱内へ戻る    → FAILED（偽ブレイク, fail_date 付与）
// PENDING で出た行が数日後の再実行で CONFIRMED / FAILED に上書きされる（過去日の行が
// 突然 status 変化するのは仕様）。速報の約6割は最終的に FAILED になる設計。
//
// ユニバース（ADR≥2.5 / 150日線上向き / 20日平均売買代金≥1億 / 個別株のみ）は配信前に
// 適用済み。テーブルに乗っている時点で通過済みなので adr_pct 等は「確認用」。

export type BoxBreakoutStatus = 'PENDING' | 'CONFIRMED' | 'FAILED'

export type BoxBreakoutRow = {
  date: string // 仮ブレイク日（PK）。「いつ上抜けたか」。動かない
  code: string
  status: BoxBreakoutStatus

  confirm_date: string | null // 確定した日（仮ブレイクの5営業日後）。PENDING/FAILED は null
  fail_date: string | null // 失敗が判明した日。PENDING/CONFIRMED は null

  co_name: string | null
  sector_s33: string | null

  close_break: number | null // 仮ブレイク日の終値（pivot をどれだけ超えたか）
  pivot: number | null // 箱の天井＝上抜けた基準線。チャートに引く上側の線
  box_low: number | null // フル箱の最安値

  armed_date: string | null // 箱が成立した日（フル箱の起点）
  base_len: number | null // フル箱の長さ（営業日数）。ベース認定 ≥20
  height_pct: number | null // フル箱の高さ%（(pivot−box_low)/box_low）
  height_atr: number | null // 箱の高さ ÷ ATR14（ボラ正規化した深さ）
  n_fail: number | null // このベース内で天井に跳ね返された回数

  eff_box_low: number | null // 実効下限＝直近40本の最安値。いま機能している防衛ライン。チャート下側の線
  eff_low_date: string | null // その安値を付けた日（実質的な今のベースの起点）
  eff_base_len: number | null // 実効下限からブレイクまでの営業日数（直近構造の熟成期間）
  eff_height_pct: number | null // 実効ベースの高さ%（(pivot−eff_box_low)/eff_box_low）

  trend_150: boolean | null // 終値>150日線 かつ 傾き上向き（より強いトレンドの目印）
  rs_topix_avg: number | null // 対TOPIX 相対強度（50=市場並み。選抜には未使用の注釈値）
  vol_ratio: number | null // ブレイク日の相対出来高（20日平均比）
  adr_pct: number | null // 日中平均変動率%（ユニバースで≥2.5に絞り済み・確認用）
  dist_from_high_pct: number | null // 52週高値からの距離%（0付近=新高値接近, null あり得る）
  turnover_oku: number | null // 直近20日平均 売買代金（億円。ユニバースで≥1に絞り済み）

  updated_at?: string | null
}

// status バッジの表示定義（ラベル / 色 / ツールチップ）。
export type BoxStatusMeta = {
  label: string
  palette: { bg: string; fg: string; border: string }
  title: string
}

export const BOX_STATUS_META: Record<BoxBreakoutStatus, BoxStatusMeta> = {
  PENDING: {
    label: '速報',
    palette: { bg: '#fef9c3', fg: '#854d0e', border: '#fde047' },
    title: 'PENDING: 仮ブレイク（確認中）。5営業日 天井の上に留まれば CONFIRMED、箱内へ戻れば FAILED。約6割は FAILED になる。',
  },
  CONFIRMED: {
    label: '確定',
    palette: { bg: '#dcfce7', fg: '#166534', border: '#86efac' },
    title: 'CONFIRMED: 仮ブレイクから5営業日 天井の上に留まり確定。',
  },
  FAILED: {
    label: '失敗',
    palette: { bg: '#f3f4f6', fg: '#6b7280', border: '#d1d5db' },
    title: 'FAILED: 途中で箱内へ戻った偽ブレイク。',
  },
}

export function boxStatusMeta(status: BoxBreakoutStatus | null | undefined): BoxStatusMeta {
  if (status && status in BOX_STATUS_META) return BOX_STATUS_META[status]
  return {
    label: status ?? '—',
    palette: { bg: '#f3f4f6', fg: '#6b7280', border: '#d1d5db' },
    title: '',
  }
}
