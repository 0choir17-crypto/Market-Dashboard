// 状態を示す小さなドット。
//
// 絵文字（🟢 ⚪ 🔴）の置き換え。絵文字は環境ごとに字形とサイズが変わるため、
// 密度の高い表の中で位置が揃わない。色は意味語彙（--sem-*）から取る。

import type { SemanticTone } from '@/types/semantic'
import { toneVars } from '@/types/semantic'

export default function Dot({ tone }: { tone: SemanticTone }) {
  return (
    <span
      aria-hidden
      className="inline-block w-1.5 h-1.5 rounded-full align-middle"
      style={{ backgroundColor: toneVars(tone).fg }}
    />
  )
}
