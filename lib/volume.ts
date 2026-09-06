// 出来高バーの色分けルール（TOPIX チャートと業種チャートで共通）。
//
// 生の株数は株価水準の違う銘柄をまたいで足した値なので、絶対量の大小より
// 「その日がその銘柄群にとって商いを伴ったか」= 平常比 (volume / 20日平均) が意味を持つ。
// 平常比 1.2 以上を濃色にして「商いを伴った動きか」を一目で分かるようにする。

import { VOLUME_TONE } from '@/lib/chartColors'

/** 濃色にする平常比のしきい値 */
export const VOLUME_HEAVY_RATIO = 1.2
/** さらに強調する平常比のしきい値（大商い） */
export const VOLUME_SURGE_RATIO = 2.0

export const VOLUME_COLORS = {
  surge: VOLUME_TONE.surge, // 警戒 — 平常比 2.0 以上
  heavy: VOLUME_TONE.heavy, // 注目 — 平常比 1.2 以上
  normal: 'rgba(148, 163, 184, 0.55)', // slate — 平常またはそれ以下 / 平常比不明
} as const

/** 平常比からバーの色を決める。ratio が null（20日平均なし）のときは淡色。 */
export function volumeBarColor(ratio: number | null | undefined): string {
  if (ratio == null || !Number.isFinite(ratio)) return VOLUME_COLORS.normal
  if (ratio >= VOLUME_SURGE_RATIO) return VOLUME_COLORS.surge
  if (ratio >= VOLUME_HEAVY_RATIO) return VOLUME_COLORS.heavy
  return VOLUME_COLORS.normal
}
