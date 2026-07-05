// 生の上昇率ランキング（全窓・無フィルタ）— market_leaders の相補版。
// Source table: public.momentum_leaders  (PK: date + code + horizon)
// Pipeline: jquants-scanner (別リポ) が平日引け後 (~18:00 JST) に当日分を upsert（冪等）。
//   最新 date が「今日のランキング」。過去日はバックフィル/履歴用（表示は max(date) のみ）。
//   ダッシュは読み取り専用でブラウザから直接クエリ（market_leaders と同方針・RLS public read）。
//
// market_leaders（質フィルタ済トップ50・資金流入観測）とは別物・相補。
//   momentum_leaders は流動性/トレンドフィルタ一切なしの「絶対上昇率」ランキング。
//   小型ロケット / 126日超長期勝ち組 / トレンド未成立の急騰株を拾う（ETF/REIT等は除外済）。
//
// horizon（21 / 63 / 126 営業日窓）ごとに別行。3窓を横並び列で見比べる。

export type Horizon = 21 | 63 | 126

// 表示する窓（左→右）。21=短期スパイク / 63=中期 / 126=長期勝ち組。
export const HORIZONS: Horizon[] = [21, 63, 126]

// 各窓の mom_pct 閾値（スキャナー側の採用条件。UI ラベルの参考表示に使う）。
export const HORIZON_THRESHOLD: Record<Horizon, number> = {
  21: 40,
  63: 80,
  126: 100,
}

// 窓の説明ラベル（列ヘッダー用）
export const HORIZON_LABEL: Record<Horizon, { title: string; note: string }> = {
  21: { title: '21日', note: '短期スパイク（≥40%）' },
  63: { title: '63日', note: '中期モメンタム（≥80%）' },
  126: { title: '126日', note: '長期勝ち組（≥100%）' },
}

export type MomentumLeader = {
  date: string
  code: string
  horizon: Horizon

  mom_pct: number | null            // その窓の上昇率(%)
  rank: number | null               // 窓内の上昇率降順順位（1=最上位）
  rank_prev: number | null          // 前営業日の同窓順位。null=前日は圏外（新規入り）
  rank_change: number | null        // rank_prev − rank。正=順位上昇 / 負=下落 / null=新規入り

  close: number | null              // 直近終値（調整後）
  dist_from_high_pct: number | null // 52週高値からの距離(%)。0に近いほど高値圏
  adr_pct: number | null            // 平均日中変動率(%) = ボラの目安

  co_name: string | null
  sector_s33: string | null

  updated_at: string | null
}

// ── rank_change の表示区分 ─────────────────────────────────────────────────
// rank_change = rank_prev − rank（正=順位が上がった/改善）。null=新規入り（NEW）。
export type RankMove =
  | { kind: 'up'; delta: number }     // ▲n（改善）
  | { kind: 'down'; delta: number }   // ▼n（下落）
  | { kind: 'flat' }                  // → 変わらず
  | { kind: 'new' }                   // NEW（前日圏外＝新規入り）

export function rankMove(rankChange: number | null | undefined): RankMove {
  if (rankChange === null || rankChange === undefined || !Number.isFinite(rankChange)) {
    return { kind: 'new' }
  }
  if (rankChange > 0) return { kind: 'up', delta: rankChange }
  if (rankChange < 0) return { kind: 'down', delta: -rankChange }
  return { kind: 'flat' }
}

// mom_pct のバー色（上昇率の強さ。窓ごとの閾値を基準に緑→黄）。
export function momColor(v: number | null | undefined, horizon: Horizon): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '#9ca3af'
  const t = HORIZON_THRESHOLD[horizon]
  if (v >= t * 2) return '#16a34a'   // 閾値の2倍以上＝突出
  if (v >= t * 1.5) return '#22c55e'
  if (v >= t) return '#eab308'
  return '#9ca3af'
}
