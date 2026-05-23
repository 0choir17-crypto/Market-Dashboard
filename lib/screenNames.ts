// Phase 2.1 (2026-05-05): screens を 2 本に絞り込み + MC v4 5-regime に統一.
//
// 採用 2 本 (本リポ commit a47852a):
//   DIV_DY_Incr_EpsGr     : regime_in [very_bear, bear, neutral]  (holding=20)
//   FCT_ValueQuality_CRS  : regime_in [very_bear, bear]           (holding=40)
//
// bull / very_bull regime は意図的に空白 (将来再設計予定).
// 旧 9 screens (FCT_SMA10_*, FCT_EMA21_*, EVT_SMA10_*, FCT_RS_Divergence,
// EVT_RVOL2x_*, EVT_CWH_*, FCT_RS_VCS_Coil, BearRS_Leader, EVT_BearRS_ShortCover)
// は Phase 2.1 で ARCHIVE. 過去の signal は引き続き表示できるよう
// LEGACY_SCREEN_NAMES に display name のみ残置.

export const SCREEN_NAME_MAP: Record<string, string> = {
  'DIV_DY_Incr_EpsGr':     'Div Bear',
  'FCT_ValueQuality_CRS':  'Value',
}

// 過去 signal の display 互換用 (新 MC 評価には使われない)
export const LEGACY_SCREEN_NAMES: Record<string, string> = {
  'EVT_SMA10_ADR_Gap3':    'Gap Up (legacy)',
  'FCT_RS_Divergence':     'RS Dip (legacy)',
  'FCT_EMA21_SMA10_CRS':   '21EMA Pullback (legacy)',
  'FCT_SMA10_SMA50_CRS':   '10/50SMA Pullback (legacy)',
  'EVT_CWH_BPS_EPS':       'CWH (legacy)',
  'EVT_RVOL2x_BPS_EpsGr':  'RVOL 2x (legacy)',
  'FCT_RS_VCS_Coil':       'VCS Coil (legacy)',
  'BearRS_Leader':         'BearRS (legacy)',
  'EVT_BearRS_ShortCover': 'ShortCover (legacy)',
  // VCP 系 (Phase 4 試験版, Phase 2.1 で archive)
  'EVT_VCP_CLOUD_BO_20D':         'VCP CloudBO (legacy)',
  'EVT_VCP_EARNINGS_C2_20D':      'VCP Earn C2 (legacy)',
  'EVT_VCP_EARNINGS_C4_20D':      'VCP Earn C4 (legacy)',
  'EVT_VCP_CLOUD_BO_INIT_20D_A':  'VCP Init A (legacy)',
  'EVT_VCP_CLOUD_BO_INIT_20D_B':  'VCP Init B (legacy)',
  // Structure Pivot (Phase 1.7-post で archive)
  'EVT_StructLongBreak_Bull':  'StructLong Bull (legacy)',
  'EVT_StructLongBreak_Bear':  'StructLong Bear (legacy)',
  'EVT_StructHHBreak':         'StructHH (legacy)',
  'FCT_StructLongActive':      'StructLong Active (legacy)',
  'FCT_StructLongPreBreak':    'StructLong PreBreak (legacy)',
}

// SCREEN_RANK: 採用 2 本のみ. Phase 2.0 regime_pool_scan による評価順.
export const SCREEN_RANK: Record<string, number> = {
  'DIV_DY_Incr_EpsGr':    1,  // 全 5 regime 候補, PF_med=4.28 (very_bear/bear/neutral 採用)
  'FCT_ValueQuality_CRS': 2,  // bear/neutral/bull 候補, PF_med=2.38 (very_bear/bear 採用)
}

// MC v4 condition 設定 (本リポ daily_screener.py の MC_V4_CONDITIONS と同期).
// 5 区分: very_bear < 20 / bear < 40 / neutral < 60 / bull < 80 / very_bull >= 80.
export const MC_V4_CONDITIONS: Record<
  string,
  { type: 'always_on' | 'regime_in'; regimes?: string[]; label: string }
> = {
  'DIV_DY_Incr_EpsGr':    {
    type: 'regime_in',
    regimes: ['very_bear', 'bear', 'neutral'],
    label: 'v4 ∈ [very_bear, bear, neutral]',
  },
  'FCT_ValueQuality_CRS': {
    type: 'regime_in',
    regimes: ['very_bear', 'bear'],
    label: 'v4 ∈ [very_bear, bear]',
  },
}

// screen_name は "|" で複数連結されている場合がある (旧 daily_screener 出力).
// 採用 2 名は SCREEN_NAME_MAP, それ以外は LEGACY_SCREEN_NAMES, さらに無ければ
// raw を表示.
export function formatScreenName(raw: string): string {
  return raw
    .split('|')
    .map((s) => {
      const k = s.trim()
      return SCREEN_NAME_MAP[k] ?? LEGACY_SCREEN_NAMES[k] ?? k
    })
    .join(' · ')
}

// 推奨スクリーン (採用 2 本のいずれか, 現在の regime に合致するもの).
// 引数 marketRegime は daily_signals.regime (TOPIX-trend ベース: bull/bear/neutral).
// scorecardRegime は v3 scorecard ラベル (very_bull/bull/neutral/bear/very_bear).
// Phase 2.1 では mc_v4 score を直接持っていないため, scorecard_regime を v4 regime
// 相当とみなして判定する (very_bull > bull > neutral > bear > very_bear).
const REGIME_TO_RECOMMENDED: Record<string, string[]> = {
  'very_bear': ['Div Bear', 'Value'],     // DIV_DY + ValueQuality 両方
  'bear':      ['Div Bear', 'Value'],     // DIV_DY + ValueQuality 両方
  'neutral':   ['Div Bear'],              // DIV_DY のみ
  'bull':      [],                        // 推奨なし (採用 2 本とも bear/neutral 限定)
  'very_bull': [],                        // 推奨なし
}

export function getRecommendedScreens(
  marketRegime?: string | null,
  scorecardRegime?: string | null,
): string[] {
  // 優先: scorecardRegime (5-regime スケール).
  // フォールバック: marketRegime (TOPIX-trend, 3 値).
  const key = (scorecardRegime ?? marketRegime ?? '').toLowerCase().trim()
  if (!key) return []
  return REGIME_TO_RECOMMENDED[key] ?? []
}

export function isRecommended(raw: string, recommended: string[]): boolean {
  if (recommended.length === 0) return false
  const shortNames = raw.split('|').map((s) => SCREEN_NAME_MAP[s.trim()] ?? s.trim())
  return shortNames.some((name) => recommended.includes(name))
}

// Premium データ使用フラグ
export const PREMIUM_SCREENS = new Set(['DIV_DY_Incr_EpsGr'])

export function isPremiumScreen(screenName: string): boolean {
  return screenName.split('|').some((s) => PREMIUM_SCREENS.has(s.trim()))
}

// 採用 (production) screens のセット. legacy / archived screens を識別するのに使う.
export const ADOPTED_SCREENS = new Set(['DIV_DY_Incr_EpsGr', 'FCT_ValueQuality_CRS'])

export function isAdoptedScreen(screenName: string): boolean {
  return screenName.split('|').some((s) => ADOPTED_SCREENS.has(s.trim()))
}
