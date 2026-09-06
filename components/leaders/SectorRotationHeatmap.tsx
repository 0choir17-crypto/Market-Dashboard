'use client'

import type { SectorRotation } from '@/lib/marketLeadersFetch'
import { GREEN_RAMP } from '@/lib/chartColors'

type Props = {
  rotation: SectorRotation
  loading: boolean
}

// セル色: count に応じた緑の濃淡（0 は地の色）。
// 意味語彙は段階を持たない（緑は strong と ok の 2 つだけ）ので、
// 量を濃淡で表すここだけ lib/chartColors.ts の専用ランプを使う。
function cellColor(count: number, max: number): string {
  if (count === 0) return 'var(--bg-primary)'
  const ratio = Math.min(1, count / Math.max(1, max))
  if (ratio >= 0.8) return GREEN_RAMP[4]
  if (ratio >= 0.6) return GREEN_RAMP[3]
  if (ratio >= 0.4) return GREEN_RAMP[2]
  if (ratio >= 0.2) return GREEN_RAMP[1]
  return GREEN_RAMP[0]
}

function cellTextColor(count: number, max: number): string {
  const ratio = Math.min(1, count / Math.max(1, max))
  return ratio >= 0.4 ? 'var(--bg-card)' : 'var(--text-primary)'
}

function fmtWeek(w: string): string {
  // 'YYYY-MM-DD' → 'M/D'
  const [, m, d] = w.split('-')
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`
}

export default function SectorRotationHeatmap({ rotation, loading }: Props) {
  const { weeks, sectors, cells } = rotation

  if (loading && weeks.length === 0) {
    return (
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-8 text-center text-[var(--text-muted)]">
        <p className="text-sm">Loading...</p>
      </div>
    )
  }

  if (weeks.length === 0) {
    return (
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-8 text-center text-[var(--text-muted)]">
        <p className="text-sm">ヒートマップ用データなし</p>
      </div>
    )
  }

  // 全体の最大カウント (色スケール用)
  let globalMax = 1
  for (const v of cells.values()) if (v > globalMax) globalMax = v

  return (
    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-5 overflow-x-auto">
      <div className="mb-4">
        <p className="text-sm font-semibold text-[var(--text-primary)]">セクターローテーション タイムライン</p>
        <p className="text-xs text-[var(--text-secondary)] mt-0.5">
          縦軸 = S33 セクター、横軸 = 週、セル色 = Top50 に入った銘柄数。
          先月→今週で資金の移動が見える。
        </p>
      </div>

      <div className="inline-block min-w-full">
        <table className="border-separate" style={{ borderSpacing: '2px' }}>
          <thead>
            <tr>
              <th className="text-left text-[11px] font-semibold text-[var(--text-secondary)] px-2 py-1 sticky left-0 bg-[var(--bg-card)] z-10">
                Sector
              </th>
              {weeks.map(w => (
                <th
                  key={w}
                  className="text-center text-[10px] font-mono text-[var(--text-secondary)] px-1 py-1 whitespace-nowrap"
                  title={w}
                >
                  {fmtWeek(w)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sectors.map(s => (
              <tr key={s}>
                <td className="text-xs text-[var(--text-primary)] px-2 py-1 sticky left-0 bg-[var(--bg-card)] whitespace-nowrap font-medium">
                  {s}
                </td>
                {weeks.map(w => {
                  const c = cells.get(`${w}|${s}`) ?? 0
                  return (
                    <td
                      key={w}
                      className="text-center text-[10px] font-mono font-semibold tabular-nums"
                      style={{
                        backgroundColor: cellColor(c, globalMax),
                        color: cellTextColor(c, globalMax),
                        width: 36,
                        height: 22,
                        borderRadius: 3,
                      }}
                      title={`${s} / 週始 ${w}: ${c} 銘柄`}
                    >
                      {c > 0 ? c : ''}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-center gap-3 mt-4 text-[11px]">
        <span className="text-[var(--text-secondary)]">少 ←</span>
        {['var(--bg-primary)', ...GREEN_RAMP].map(c => (
          <span key={c} className="inline-block w-5 h-3 rounded-sm" style={{ backgroundColor: c }} />
        ))}
        <span className="text-[var(--text-secondary)]">→ 多</span>
        <span className="text-[var(--text-muted)] ml-3">max = {globalMax} 銘柄/週</span>
      </div>
    </div>
  )
}
