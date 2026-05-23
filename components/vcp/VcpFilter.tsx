import { DailyVcpScreen } from '@/types/vcp'

export type FilterPreset = 'all' | 'strong' | 'pivot' | 'tight'

export const PRESET_LABELS: Record<FilterPreset, string> = {
  all: 'All',
  strong: 'Strong',
  pivot: 'Pivot 近接',
  tight: 'Tight',
}

export const PRESET_DESCRIPTIONS: Record<FilterPreset, string> = {
  all: 'フィルタなし',
  strong: 'cockpit_rs ≥ 80 かつ ma_stack = 1（完全 Stage 2）',
  pivot: 'pct_from_20d_high が -2% 〜 +2%（エントリ候補）',
  tight: 'vcs_days_tight ≥ 5（教科書的 VCP）',
}

export function applyPreset(
  rows: DailyVcpScreen[],
  preset: FilterPreset,
): DailyVcpScreen[] {
  switch (preset) {
    case 'strong':
      return rows.filter(
        r => (r.cockpit_rs ?? -Infinity) >= 80 && r.ma_stack === 1,
      )
    case 'pivot':
      return rows.filter(r => {
        const p = r.pct_from_20d_high
        return p != null && p >= -2 && p <= 2
      })
    case 'tight':
      return rows.filter(r => (r.vcs_days_tight ?? 0) >= 5)
    case 'all':
    default:
      return rows
  }
}

export default function VcpFilter({
  preset,
  onChange,
  counts,
}: {
  preset: FilterPreset
  onChange: (p: FilterPreset) => void
  counts: Record<FilterPreset, number>
}) {
  const presets: FilterPreset[] = ['all', 'strong', 'pivot', 'tight']

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <span className="text-xs text-gray-500 mr-1">Preset:</span>
      {presets.map(p => {
        const active = preset === p
        return (
          <button
            key={p}
            onClick={() => onChange(p)}
            title={PRESET_DESCRIPTIONS[p]}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
              active
                ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                : 'bg-white text-gray-700 border-[var(--border)] hover:bg-gray-50'
            }`}
          >
            {PRESET_LABELS[p]}
            <span
              className={`ml-1.5 text-[10px] ${
                active ? 'opacity-90' : 'text-gray-400'
              }`}
            >
              {counts[p]}
            </span>
          </button>
        )
      })}
    </div>
  )
}
