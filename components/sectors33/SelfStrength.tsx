'use client'

// 業種の自力 (self_t63 など) の表示部品。一覧とチャートカードで共通に使う。
//
// 注意の印: self_t63 ≤ −1 の業種に 1 つだけ。控えめに (塗りつぶしは使わず、注意色の文字だけ)。
// 5 日差の矢印: 5 営業日前の self_t63 との差が +0.1 以上 ↑ (緑) / −0.1 以下 ↓ (赤) / それ以外は出さない。

import {
  SELF_DIFF_STEP,
  SELF_T63_CAUTION,
  fmtT,
  isCaution,
  isNum,
  type SectorSelectionRow,
} from '@/types/sectorSelection'

export const CAUTION_NOTE = `self_t63 が ${SELF_T63_CAUTION} 以下 = 注意（入る時期を遅らせる目安。この業種の銘柄は、利確せず持つ場合に成績が約 1% 悪かった）`

export function CautionMark({ row }: { row: Pick<SectorSelectionRow, 'self_t63'> }) {
  if (!isCaution(row)) return null
  return (
    <span className="text-caption font-medium text-[var(--sem-watch-fg)] whitespace-nowrap" title={CAUTION_NOTE}>
      注意
    </span>
  )
}

export function DiffArrow({ diff }: { diff: number | undefined }) {
  if (diff === undefined || !isNum(diff)) return null
  const up = diff >= SELF_DIFF_STEP
  const down = diff <= -SELF_DIFF_STEP
  if (!up && !down) return null
  return (
    <span
      className="text-caption"
      style={{ color: up ? 'var(--positive)' : 'var(--negative)' }}
      title={`5 営業日前から ${fmtT(diff)}`}
      aria-label={`5 営業日前から ${fmtT(diff)}`}
    >
      {up ? '↑' : '↓'}
    </span>
  )
}

/** t 値を符号付きで。値が無ければ灰の「—」 */
export function TValue({ v, strong = false }: { v: number | null | undefined; strong?: boolean }) {
  if (!isNum(v)) return <span className="text-[var(--sem-idle-fg)]">—</span>
  return (
    <span className={`num ${strong ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-secondary)]'}`}>
      {fmtT(v)}
    </span>
  )
}
