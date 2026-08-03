// Earnings Quality v2 — EQS (Earnings Quality Score) 0-100
// 純ロジック層: React / Supabase / DOM に一切依存しない。移植時はこのファイルを丸ごと持っていく。
//
// v1 (score3 = s_div + s_eps + s_sales, 0-7) の構造的欠陥:
//   - s_div が最大 3 点 (配点の 43%) だが四半期開示では通常 0 → 実効レンジが潰れる
//   - 1Q は QoQ 不能 → 増配が無ければ理論最大 2/5 = 常時「弱(灰)」
//   - 伸び率のマグニチュードを捨てる二値化 (+0.1% と +300% が同点)
//   - fop_rev_pct (通期予想修正) / progress_excess_pct がスコア非対象
//   - 黒字転換・赤字転落が % で表現できず脱落
//   - 欠損 (null) と中立 (0) が同じ 0 点
//
// v2 の方針:
//   1. 4 軸 (成長 40 / ガイダンス 30 / 還元 10 / 需給 20) の加点式
//   2. 段階的加点でマグニチュードを保持
//   3. 欠損軸は「分子・分母の両方から除外」して比例配分 (available-points normalization)
//      → 欠損が減点にならず、coverage で信頼度を別途表示できる
//   4. 下方修正・減配・赤字転落は正規化後に減点 (ペナルティ)
//   5. 単Q YoY を使うので 1Q の特例 (最大 5) が消滅 → 全 Q 同一スケールで比較可能

export type CurPerType = '1Q' | '2Q' | '3Q' | string

// 損益の符号変化。% では表現できないため供給側で分類して渡す。
export type Turnaround =
  | 'none' // 前年同期 黒字 → 今期 黒字
  | 'to_profit' // 黒字転換 (前年 ≦0 → 今期 >0)
  | 'loss_narrow' // 赤字縮小 (両期赤字)
  | 'loss_widen' // 赤字拡大 (両期赤字)
  | 'to_loss' // 赤字転落 (前年 >0 → 今期 ≦0)
  | 'unknown' // 供給側未対応 / 判定不能

export type EqsInput = {
  cur_per_type: CurPerType
  /** 単Q EPS 前年同期比 %。1Q では累計 YoY と定義上一致する。 */
  eps_q_yoy_pct: number | null
  /** 単Q 売上 前年同期比 %。 */
  sales_q_yoy_pct: number | null
  /** EPS の符号変化区分。null / 'unknown' は % にフォールバック。 */
  eps_turnaround: Turnaround | null
  /** 通期予想 OP の修正率 % (同 FY 前回 FOP 比)。 */
  fop_rev_pct: number | null
  /** 通期予想を「据え置いた」ことが確認できる場合 false。不明なら null。 */
  has_fop_revision: boolean | null
  /** 実進捗 − 期待ペース (pt)。 */
  progress_excess_pct: number | null
  /** 同 FY 前回 FDivAnn からの増配率 %。 */
  div_change_pct: number | null
  above_sma200: boolean | null
  /** 20 日平均売買代金 (億円)。 */
  turnover_oku: number | null
}

export type EqsAxis = 'growthEps' | 'growthSales' | 'guidanceRev' | 'guidanceProgress' | 'shareholder' | 'trend' | 'liquidity'

export type EqsBreakdown = {
  /** 正規化後の総合スコア 0-100 (ペナルティ適用済み)。評価可能軸ゼロなら null。 */
  eqs: number | null
  /** ペナルティ適用前の正規化スコア 0-100。 */
  raw: number | null
  /** 軸ごとの [獲得点, 配点]。評価不能軸は available=false。 */
  axes: Record<EqsAxis, { earned: number; max: number; available: boolean }>
  /** 評価可能だった配点の合計 (最大 100)。 */
  availablePoints: number
  /** availablePoints / 100 (%) — 表示の信頼度。 */
  coverage: number
  /** 減点の内訳 (正の値が減点量)。 */
  penalties: { label: string; points: number }[]
  penaltyTotal: number
  /** coverage が低く単独判断に使えない行。 */
  lowCoverage: boolean
}

// ── 配点表 ────────────────────────────────────────────────────────────────
export const AXIS_MAX: Record<EqsAxis, number> = {
  growthEps: 22,
  growthSales: 18,
  guidanceRev: 20,
  guidanceProgress: 10,
  shareholder: 10,
  trend: 10,
  liquidity: 10,
}
// 合計 100

/** coverage がこれ未満なら単独判断に使わない (UI で「参考」表示 / ランキング除外オプション)。 */
export const MIN_COVERAGE = 50

// 段階表: [下限, 得点] を降順に並べる。最後に [-Infinity, 0] を置く。
type Tier = readonly [min: number, pts: number]

function tierScore(v: number | null | undefined, tiers: readonly Tier[]): number {
  if (v == null || !Number.isFinite(v)) return 0
  for (const [min, pts] of tiers) {
    if (v >= min) return pts
  }
  return 0
}

// EPS 単Q YoY (max 22)
const EPS_TIERS: readonly Tier[] = [
  [100, 22],
  [50, 18],
  [30, 14],
  [15, 10],
  [0.01, 6],
  [-15, 2],
  [-Infinity, 0],
]

// 売上 単Q YoY (max 18) — EPS より変動幅が小さいのでスケールを分ける
const SALES_TIERS: readonly Tier[] = [
  [30, 18],
  [20, 15],
  [10, 11],
  [5, 8],
  [0.01, 4],
  [-5, 1],
  [-Infinity, 0],
]

// 通期 OP 修正率 (max 20)。0 = 据え置きは中立 4 点。
const FOP_TIERS: readonly Tier[] = [
  [20, 20],
  [10, 16],
  [5, 12],
  [0.01, 8],
  [0, 4],
  [-Infinity, 0],
]
const FOP_NEUTRAL = 4

// 進捗超過 pt (max 10)
const PROGRESS_TIERS: readonly Tier[] = [
  [10, 10],
  [5, 8],
  [2, 6],
  [0.01, 4],
  [-5, 1],
  [-Infinity, 0],
]

// 増配率 (max 10)。v1 では 3/7 = 43% を占めていた配点を 10% に縮小。
const DIV_TIERS: readonly Tier[] = [
  [10, 10],
  [0.01, 7],
  [0, 3],
  [-Infinity, 0],
]

// 売買代金 億円 (max 10) — 執行可能性の下限を担保する
const TURNOVER_TIERS: readonly Tier[] = [
  [10, 10],
  [5, 8],
  [3, 6],
  [1, 4],
  [0.5, 2],
  [-Infinity, 0],
]

// ペナルティ (正規化後の 100 点スケールから減算)
export const PENALTY_FOP_CUT = 12 // 通期 OP 下方修正 (<= -5%)
export const PENALTY_DIV_CUT = 8 // 減配
export const PENALTY_TO_LOSS = 10 // 赤字転落 / 赤字拡大

function isNum(v: number | null | undefined): v is number {
  return v != null && Number.isFinite(v)
}

// ── EPS 成長軸: 符号変化を % より優先 ────────────────────────────────────
function scoreEpsGrowth(input: EqsInput): { earned: number; available: boolean } {
  const ta = input.eps_turnaround ?? 'unknown'
  if (ta === 'to_profit') return { earned: AXIS_MAX.growthEps, available: true }
  if (ta === 'to_loss' || ta === 'loss_widen') return { earned: 0, available: true }
  // 赤字縮小は改善だが黒字化には届かない → 中間点
  if (ta === 'loss_narrow') return { earned: 8, available: true }
  if (!isNum(input.eps_q_yoy_pct)) return { earned: 0, available: false }
  return { earned: tierScore(input.eps_q_yoy_pct, EPS_TIERS), available: true }
}

function scoreSalesGrowth(input: EqsInput): { earned: number; available: boolean } {
  if (!isNum(input.sales_q_yoy_pct)) return { earned: 0, available: false }
  return { earned: tierScore(input.sales_q_yoy_pct, SALES_TIERS), available: true }
}

// 修正率が null でも「据え置きが確認できている」なら中立点で評価対象にする。
function scoreGuidanceRev(input: EqsInput): { earned: number; available: boolean } {
  if (isNum(input.fop_rev_pct)) {
    return { earned: tierScore(input.fop_rev_pct, FOP_TIERS), available: true }
  }
  if (input.has_fop_revision === false) return { earned: FOP_NEUTRAL, available: true }
  return { earned: 0, available: false }
}

function scoreProgress(input: EqsInput): { earned: number; available: boolean } {
  if (!isNum(input.progress_excess_pct)) return { earned: 0, available: false }
  return { earned: tierScore(input.progress_excess_pct, PROGRESS_TIERS), available: true }
}

function scoreShareholder(input: EqsInput): { earned: number; available: boolean } {
  if (!isNum(input.div_change_pct)) return { earned: 0, available: false }
  return { earned: tierScore(input.div_change_pct, DIV_TIERS), available: true }
}

function scoreTrend(input: EqsInput): { earned: number; available: boolean } {
  if (input.above_sma200 == null) return { earned: 0, available: false }
  return { earned: input.above_sma200 ? AXIS_MAX.trend : 0, available: true }
}

function scoreLiquidity(input: EqsInput): { earned: number; available: boolean } {
  if (!isNum(input.turnover_oku)) return { earned: 0, available: false }
  return { earned: tierScore(input.turnover_oku, TURNOVER_TIERS), available: true }
}

/**
 * EQS を算出する。評価不能な軸は分子・分母の両方から除外するため、
 * 「データが無いから低スコア」が起きない。
 */
export function computeEqs(input: EqsInput): EqsBreakdown {
  const parts: Record<EqsAxis, { earned: number; available: boolean }> = {
    growthEps: scoreEpsGrowth(input),
    growthSales: scoreSalesGrowth(input),
    guidanceRev: scoreGuidanceRev(input),
    guidanceProgress: scoreProgress(input),
    shareholder: scoreShareholder(input),
    trend: scoreTrend(input),
    liquidity: scoreLiquidity(input),
  }

  const axes = {} as EqsBreakdown['axes']
  let earnedSum = 0
  let availableSum = 0
  for (const key of Object.keys(parts) as EqsAxis[]) {
    const p = parts[key]
    const max = AXIS_MAX[key]
    axes[key] = { earned: p.earned, max, available: p.available }
    if (p.available) {
      earnedSum += p.earned
      availableSum += max
    }
  }

  const penalties: { label: string; points: number }[] = []
  if (isNum(input.fop_rev_pct) && input.fop_rev_pct <= -5) {
    penalties.push({ label: '通期 OP 下方修正', points: PENALTY_FOP_CUT })
  }
  if (isNum(input.div_change_pct) && input.div_change_pct < 0) {
    penalties.push({ label: '減配', points: PENALTY_DIV_CUT })
  }
  const ta = input.eps_turnaround ?? 'unknown'
  if (ta === 'to_loss' || ta === 'loss_widen') {
    penalties.push({ label: ta === 'to_loss' ? '赤字転落' : '赤字拡大', points: PENALTY_TO_LOSS })
  }
  const penaltyTotal = penalties.reduce((s, p) => s + p.points, 0)

  if (availableSum <= 0) {
    return {
      eqs: null,
      raw: null,
      axes,
      availablePoints: 0,
      coverage: 0,
      penalties,
      penaltyTotal,
      lowCoverage: true,
    }
  }

  const raw = Math.round((earnedSum / availableSum) * 100)
  const eqs = Math.max(0, Math.min(100, raw - penaltyTotal))

  return {
    eqs,
    raw,
    axes,
    availablePoints: availableSum,
    coverage: availableSum,
    penalties,
    penaltyTotal,
    lowCoverage: availableSum < MIN_COVERAGE,
  }
}

// ── バンド / 配色 ─────────────────────────────────────────────────────────
export type EqsBand = 'S' | 'A' | 'B' | 'C' | 'na'

export function eqsBand(eqs: number | null | undefined): EqsBand {
  if (eqs == null || !Number.isFinite(eqs)) return 'na'
  if (eqs >= 80) return 'S'
  if (eqs >= 65) return 'A'
  if (eqs >= 45) return 'B'
  return 'C'
}

// v1 と同じ 16 進値を使い回すので、既存の凡例・テーマ資産をそのまま流用できる。
export function eqsColor(
  eqs: number | null | undefined,
  lowCoverage = false,
): { bg: string; text: string; border: string } {
  if (lowCoverage) return { bg: '#f3f4f6', text: '#9ca3af', border: '#e5e7eb' }
  switch (eqsBand(eqs)) {
    case 'S':
      return { bg: '#86efac', text: '#14532d', border: '#16a34a' }
    case 'A':
      return { bg: '#dcfce7', text: '#15803d', border: '#86efac' }
    case 'B':
      return { bg: '#fef3c7', text: '#92400e', border: '#fde68a' }
    case 'C':
      return { bg: '#f3f4f6', text: '#6b7280', border: '#e5e7eb' }
    default:
      return { bg: '#f3f4f6', text: '#9ca3af', border: '#e5e7eb' }
  }
}

export const EQS_BAND_LABEL: Record<EqsBand, string> = {
  S: 'S 最上位 (80-100)',
  A: 'A 強 (65-79)',
  B: 'B 中 (45-64)',
  C: 'C 弱 (0-44)',
  na: '評価不能',
}

// ── v1 行からの後方互換アダプタ ──────────────────────────────────────────
// 供給側 (スキャナー) の改修を待たずに Phase 0 を出すための橋渡し。
//
// 重要: 1Q は「累計 = 単Q」なので eps_yoy_pct をそのまま単Q YoY として使える。
//       つまり供給側変更ゼロで 1Q の構造的過小評価は解消できる。
//       2Q/3Q は累計 YoY による近似 (degraded=true) となり、単Q 分解は Phase 1 で供給。
export type V1LikeRow = {
  cur_per_type: CurPerType
  eps_yoy_pct: number | null
  eps_qoq_pct: number | null
  sales_yoy_pct: number | null
  sales_qoq_pct: number | null
  div_change_pct: number | null
  fop_rev_pct: number | null
  progress_excess_pct: number | null
  above_sma200: boolean | null
  turnover_oku: number | null
  // Phase 1 で供給側が追加する列 (無ければ undefined)
  eps_q_yoy_pct?: number | null
  sales_q_yoy_pct?: number | null
  eps_turnaround?: Turnaround | null
  has_fop_revision?: boolean | null
}

export function toEqsInput(row: V1LikeRow): { input: EqsInput; degraded: boolean } {
  const isQ1 = row.cur_per_type === '1Q'
  const epsQ = row.eps_q_yoy_pct ?? (isQ1 ? row.eps_yoy_pct : null)
  const salesQ = row.sales_q_yoy_pct ?? (isQ1 ? row.sales_yoy_pct : null)
  // 単Q が無い 2Q/3Q は累計 YoY で代用する (精度低下を degraded で明示)
  const degraded = epsQ == null || salesQ == null

  return {
    input: {
      cur_per_type: row.cur_per_type,
      eps_q_yoy_pct: epsQ ?? row.eps_yoy_pct,
      sales_q_yoy_pct: salesQ ?? row.sales_yoy_pct,
      eps_turnaround: row.eps_turnaround ?? 'unknown',
      fop_rev_pct: row.fop_rev_pct,
      has_fop_revision: row.has_fop_revision ?? null,
      progress_excess_pct: row.progress_excess_pct,
      div_change_pct: row.div_change_pct,
      above_sma200: row.above_sma200,
      turnover_oku: row.turnover_oku,
    },
    degraded,
  }
}

// ── v1 の到達可能スコア (診断用) ─────────────────────────────────────────
// 「増配が無い場合に v1 score3 が理論上到達できる最大値」を返す。
// 1Q → 2 (= 常時「弱(灰)」バンド), 2Q/3Q → 4 (= 常時「中(黄)」止まり)。
export function v1MaxWithoutDividendHike(curPerType: CurPerType): number {
  return curPerType === '1Q' ? 2 : 4
}
