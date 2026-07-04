// 表示フォーマットの単一ソース。
//
// 表記ルール:
//   - 金額: 整数円・3桁区切り・損益は符号付き（+¥12,300 / −¥4,500）
//   - 率  : 小数2桁・変化率は符号付き（+1.23% / −0.45%）
//   - 数値は font-mono（タブラー数字）と組で使い、表では右揃えにする
//   - 色は CSS 変数 --positive / --negative / --text-secondary のみ使う

/** 金額（円・整数）。sign=true で正値に + を付ける。null は em ダッシュ。 */
export function formatYen(value: number | null | undefined, opts: { sign?: boolean } = {}): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const rounded = Math.round(value)
  const abs = Math.abs(rounded).toLocaleString('ja-JP')
  if (rounded < 0) return `-¥${abs}`
  return `${opts.sign && rounded > 0 ? '+' : ''}¥${abs}`
}

/** 率（%）。digits 省略時は2桁。sign=true で正値に + を付ける。 */
export function formatPct(
  value: number | null | undefined,
  opts: { digits?: number; sign?: boolean } = {},
): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const digits = opts.digits ?? 2
  const s = value.toFixed(digits)
  return `${opts.sign && value > 0 ? '+' : ''}${s}%`
}

/** R倍数（+1.25R / −0.80R）。 */
export function formatR(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}R`
}

/** 損益の文字色クラス。0 とnullはニュートラル。 */
export function pnlColorClass(value: number | null | undefined): string {
  if (value == null || value === 0) return 'text-[var(--text-secondary)]'
  return value > 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
}
