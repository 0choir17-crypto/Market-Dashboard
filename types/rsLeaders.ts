// RS リーダー — TOPIX 比の強さ (全体RS) と、同業の中での強さ (業種RS) で強い銘柄を並べる。
// Source tables:
//   public.rs_leaders         (PK: date + code)        1 日 約 300〜450 行
//   public.rs_leaders_sector  (PK: date + sector_code) 1 日 33 行
// Pipeline: jquants-scanner-prod の run_daily Step1l (別リポ) が毎平日の夜に直近 10 営業日を upsert。
//
// テーブルには RS の値を問わず条件を満たす全銘柄が入っている。表示する銘柄の区切り
// (RS 80 以上など) はダッシュボード側で決める → 下の定数。
// 売買シグナルや成績は出さない (研究で成績の上乗せが無かったため)。

export type RsLeader = {
  date: string
  code: string
  co_name: string | null
  sector_code: string | null
  sector_s33: string | null
  /** 全体RS 1〜99 (TOPIX 比。上位ほど 99) */
  rs_rating: number | null
  /** 過去 20 日の rs_rating の最大 */
  rs_max20: number | null
  /** rs_rating の 5 営業日前からの変化 */
  rs_chg5: number | null
  /** 業種RS 1〜99 (自分を除いた同業の中央値と比べた強さ) */
  sector_rs: number | null
  /** 'peers' / 'index' (同業が少ない業種は業種指数で代用) */
  sector_bench: string | null
  /** 同業が自分を含めて 3 銘柄以下 → 業種RS は参考値 */
  sector_ref_only: boolean | null
  close: number | null
  atr14: number | null
  adr_pct: number | null
  turnover_oku: number | null
  volume_ma20: number | null
  dist_from_high_pct: number | null
  ema9: number | null
  ema21: number | null
  ema50: number | null
  ema150: number | null
  ema9_weekly: number | null
  /** 終値がその線から何 ATR 上か (マイナスは線の下) */
  d_ema9: number | null
  d_ema21: number | null
  d_ema50: number | null
  /** 150EMA から何 ATR 上か (2026-11 追加) */
  d_ema150?: number | null
  /** 週足 9EMA から何 ATR 上か (押しの段階の判定にだけ使う) */
  d_ema9_weekly: number | null
  /** 線の開き = (21EMA − 50EMA) ÷ ATR */
  spread_21_50: number | null
}

export type RsLeaderSector = {
  date: string
  sector_code: string
  sector_s33: string
  /** 業種の強さの順位 1〜33 (1 が最強) */
  sector_rank: number | null
  /** 同業の銘柄数 (売買代金 1 億円以上などの母集団。rs_leaders の行より広い) */
  members: number | null
  n_rs80: number | null
  /** n_rs80 ÷ members × 100 */
  pct_rs80: number | null
  strength_bench: string | null
}

// ── 表示の区切り (ここだけ変えれば両方の画面に効く) ─────────────────────
/** 表示する rs_rating の下限 */
export const RS_MIN = 80
/** Pullback Board に出す spread_21_50 の下限 (未満 = 線が密集 → 出さない) */
export const SPREAD_MIN = 1.0
/** 「すぐ下の線が近い」とみなす距離 (ATR) */
export const NEAR_ATR = 1.0
/** 札の濃さの区切り: 95〜99 / 90〜94 / 80〜89 */
export const TIER = [95, 90] as const
/** < 1.0 Tight / 1.0〜2.5 Normal / > 2.5 Wide (ツールチップ用) */
export const SPREAD_LABEL = { tight: 1.0, wide: 2.5 }
/** 業種の折れ線の日数 (直近 63 営業日) */
export const SECTOR_DAYS = 63
/** 札のスコアの変化を何営業日前と比べるか */
export const CHG_DAYS = 5
/** 「3W ago」= 何営業日前の行と比べるか */
export const SECTOR_3W = 15

function num(v: number | null | undefined): number | null {
  return v !== null && v !== undefined && Number.isFinite(v) ? v : null
}

/** 札の濃さ 1 (濃) / 2 (中) / 3 (薄) */
export function rsTier(rs: number | null): 1 | 2 | 3 {
  const v = num(rs) ?? 0
  return v >= TIER[0] ? 1 : v >= TIER[1] ? 2 : 3
}

export function spreadLabel(s: number | null): string {
  const v = num(s)
  if (v === null) return '—'
  return v < SPREAD_LABEL.tight ? 'Tight' : v > SPREAD_LABEL.wide ? 'Wide' : 'Normal'
}

export type MaKey = '9' | '21' | '50' | '150'

/** 押しの判定に使う列 (rs_leaders と liquid_leaders で同じ定義) */
export type MaDists = {
  d_ema9: number | null
  d_ema21: number | null
  d_ema50: number | null
  /** 2026-11 追加。追加前の行・履歴の足りない銘柄は null */
  d_ema150?: number | null
  d_ema9_weekly: number | null
}

/** 札の下段に並べる日足の線 (週足 9EMA は含めない) */
export const MA_LINES = (r: MaDists): [MaKey, number | null | undefined][] => [
  ['9', r.d_ema9],
  ['21', r.d_ema21],
  ['50', r.d_ema50],
  ['150', r.d_ema150],
]

/**
 * すぐ下の線 = d_ema9 / d_ema21 / d_ema50 / d_ema150 のうち 0 以上で最小のもの (週足 9EMA は含めない)。
 * near = その距離が NEAR_ATR 以下。
 */
export function nearestBelow(r: MaDists): { key: MaKey; dist: number; near: boolean } | null {
  let best: { key: MaKey; dist: number } | null = null
  for (const [key, v] of MA_LINES(r)) {
    const d = num(v)
    if (d === null || d < 0) continue
    if (!best || d < best.dist) best = { key, dist: d }
  }
  return best ? { ...best, near: best.dist <= NEAR_ATR } : null
}

export type StageDef = {
  title: string
  desc: string
  /** 基準の線の見出し */
  line: string
  /** 札の下段で太字にする線 (段階 4・5 は無し) */
  bold: MaKey | null
  dist: (r: MaDists) => number | null
}

export const STAGES: StageDef[] = [
  { title: 'Above 9EMA', desc: 'まだ押していない', line: '9EMA', bold: '9', dist: r => num(r.d_ema9) },
  { title: '9-21EMA', desc: '浅い押し', line: '21EMA', bold: '21', dist: r => num(r.d_ema21) },
  { title: '21-50EMA', desc: '中くらいの押し', line: '50EMA', bold: '50', dist: r => num(r.d_ema50) },
  { title: '50-150EMA', desc: '深い押し', line: '150EMA', bold: '150', dist: r => num(r.d_ema150) },
  { title: 'Below 150EMA', desc: '150EMA割れ・週足9EMAの上', line: 'W9EMA', bold: null, dist: r => num(r.d_ema9_weekly) },
  { title: 'Below W9EMA', desc: '週足9EMAも割れ', line: 'W9EMA', bold: null, dist: r => num(r.d_ema9_weekly) },
]

/**
 * 押しの段階 0〜5 = d_ema9 → d_ema21 → d_ema50 → d_ema150 → d_ema9_weekly の順に見て、最初に 0 以上の線。
 * 週足 9EMA は最後に見る。どれも負なら 5。
 */
export function pullbackStage(r: MaDists): number {
  const lines = [r.d_ema9, r.d_ema21, r.d_ema50, r.d_ema150, r.d_ema9_weekly]
  for (let i = 0; i < lines.length; i++) {
    const d = num(lines[i])
    if (d !== null && d >= 0) return i
  }
  return 5
}

/** 線が密集している銘柄 (spread_21_50 < SPREAD_MIN) か。押しの段階は読まず、別の列に置く */
export function isTight(spread: number | null | undefined): boolean {
  const v = num(spread)
  return v === null || v < SPREAD_MIN
}

/** 線が密集している列の見出し */
export const TIGHT_STAGE = {
  title: 'MA Tight',
  desc: `線が密集 (21/50EMA の開き ${SPREAD_MIN} ATR 未満)・もみ合い`,
}

/** 線が密集している列の並び = 9 / 21 / 50EMA のうち最も近い線までの距離 (絶対値) */
export function tightDist(r: MaDists): number {
  const v = [r.d_ema9, r.d_ema21, r.d_ema50].map(num).filter((x): x is number => x !== null).map(Math.abs)
  return v.length ? Math.min(...v) : Infinity
}

export function fmtSigned1(v: number | null): string {
  const d = num(v)
  if (d === null) return '—'
  const s = d.toFixed(1)
  return s.startsWith('-') ? (s === '-0.0' ? '+0.0' : s) : `+${s}`
}

/** 5 営業日前からのスコアの変化を (↑3) / (↓5) / (→0) で。null は空文字 */
export function fmtChg5(v: number | null | undefined): string {
  const d = num(v)
  if (d === null) return ''
  return d > 0 ? `(↑${d})` : d < 0 ? `(↓${Math.abs(d)})` : '(→0)'
}

/** Pullback Board の列の数 = 押しの段階 (STAGES) + 線が密集 (最後。画面では段階の列の下に置く) */
export const PULLBACK_COLS = STAGES.length + 1

/**
 * Pullback Board の列分け (RS Leaders / Liquid Leaders 共通)。
 * 線が密集している銘柄は最後の列 (TIGHT_STAGE)、それ以外は押しの段階の列。
 * 列の中は基準の線までの距離 (絶対値) が小さい順。密集の列は最も近い日足の線までの距離順。
 */
export function buildPullbackColumns<T extends MaDists & { spread_21_50: number | null | undefined }>(rows: T[]): T[][] {
  const cols: T[][] = Array.from({ length: PULLBACK_COLS }, () => [])
  for (const r of rows) cols[isTight(r.spread_21_50) ? STAGES.length : pullbackStage(r)].push(r)
  cols.forEach((c, k) => {
    const d = k === STAGES.length ? tightDist : (r: T) => Math.abs(STAGES[k].dist(r) ?? Infinity)
    c.sort((a, b) => d(a) - d(b))
  })
  return cols
}
