import type {
  StructurePivotSignalType,
  StructurePivotTier,
} from '@/types/structurePivot'

export type SignalFilter = StructurePivotSignalType | 'all'
export type TierFilter = StructurePivotTier | 'all'

export type StructurePivotFilters = {
  signal: SignalFilter
  tier: TierFilter
  vcpOnly: boolean
  watchlistOnly: boolean
  institutionalOnly: boolean
}

type Props = {
  filters: StructurePivotFilters
  onChange: (next: StructurePivotFilters) => void
  signalCounts: Record<SignalFilter, number>
  tierCounts: Record<TierFilter, number>
}

const SIGNAL_OPTIONS: { value: SignalFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'HL_BREAK', label: '🔵 HL_BREAK' },
  { value: 'SETUP_LONG', label: '🟡 SETUP_LONG' },
]

const TIER_OPTIONS: { value: TierFilter; label: string }[] = [
  { value: 'all', label: 'All Tier' },
  { value: 'S', label: '⭐ S' },
  { value: 'A', label: '🅰️ A' },
  { value: 'B', label: '⚪ B' },
]

export default function StructurePivotFilter({
  filters,
  onChange,
  signalCounts,
  tierCounts,
}: Props) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      <ButtonGroup
        label="Signal"
        options={SIGNAL_OPTIONS}
        value={filters.signal}
        counts={signalCounts}
        onChange={v => onChange({ ...filters, signal: v })}
      />
      <ButtonGroup
        label="Tier"
        options={TIER_OPTIONS}
        value={filters.tier}
        counts={tierCounts}
        onChange={v => onChange({ ...filters, tier: v })}
      />
      <Toggle
        label="VCP only"
        value={filters.vcpOnly}
        onChange={v => onChange({ ...filters, vcpOnly: v })}
        title="vcp_within_21d = true"
      />
      <Toggle
        label="Watchlist only"
        value={filters.watchlistOnly}
        onChange={v => onChange({ ...filters, watchlistOnly: v })}
        title="in_watchlist = true"
      />
      <Toggle
        label="🏛️ Institutional only"
        value={filters.institutionalOnly}
        onChange={v => onChange({ ...filters, institutionalOnly: v })}
        title="jq_institutional_pass = true (Phase 4 Screen B)"
      />
    </div>
  )
}

function ButtonGroup<T extends string>({
  label,
  options,
  value,
  counts,
  onChange,
}: {
  label: string
  options: { value: T; label: string }[]
  value: T
  counts: Record<T, number>
  onChange: (v: T) => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-gray-500 mr-1">{label}:</span>
      {options.map(opt => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${
              active
                ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                : 'bg-white text-gray-700 border-[var(--border)] hover:bg-gray-50'
            }`}
          >
            {opt.label}
            <span
              className={`ml-1.5 text-[10px] ${
                active ? 'opacity-90' : 'text-gray-400'
              }`}
            >
              {counts[opt.value] ?? 0}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function Toggle({
  label,
  value,
  onChange,
  title,
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
  title?: string
}) {
  return (
    <label
      className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 cursor-pointer select-none"
      title={title}
    >
      <input
        type="checkbox"
        checked={value}
        onChange={e => onChange(e.target.checked)}
        className="w-3.5 h-3.5 rounded border-gray-300 text-[var(--accent)] focus:ring-[var(--accent)] cursor-pointer"
      />
      {label}
    </label>
  )
}
