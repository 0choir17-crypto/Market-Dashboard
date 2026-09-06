// CSS カスタムプロパティを実値に解決する。
//
// canvas に描くチャート（lightweight-charts / Recharts の一部）は
// `var(--x)` を解釈せず、渡された文字列をそのまま色として扱う。SVG の
// presentation attribute（stroke="..."）も同じ。そういう場所に色を渡すときだけ
// これを通し、色の定義そのものは globals.css に置いたままにする。
//
// SSR / プリレンダー時は document が無いので fallback を返す。呼び出し側は
// useEffect の中（= 生成時）で呼ぶこと。

export function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}
