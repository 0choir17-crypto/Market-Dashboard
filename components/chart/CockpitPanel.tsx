'use client'

import type { CockpitColor, CockpitMetric, CockpitSnapshot } from '@/lib/cockpit'

const COLOR_MAP: Record<CockpitColor, { bg: string; fg: string; border: string }> = {
  green:  { bg: '#dcfce7', fg: '#166534', border: '#86efac' },
  red:    { bg: '#fee2e2', fg: '#991b1b', border: '#fca5a5' },
  yellow: { bg: '#fef9c3', fg: '#854d0e', border: '#fde68a' },
  orange: { bg: '#ffedd5', fg: '#9a3412', border: '#fdba74' },
  gray:   { bg: '#f1f5f9', fg: '#475569', border: '#cbd5e1' },
}

function MetricCell({ m }: { m: CockpitMetric }) {
  const c = COLOR_MAP[m.color]
  return (
    <div
      className="px-2.5 py-2 rounded-md border flex flex-col items-start gap-0.5"
      style={{ backgroundColor: c.bg, borderColor: c.border }}
      title={m.hint}
    >
      <span
        className="text-[10px] uppercase tracking-wide font-semibold"
        style={{ color: c.fg, opacity: 0.75 }}
      >
        {m.label}
      </span>
      <span
        className="font-mono text-sm font-bold leading-tight"
        style={{ color: c.fg }}
      >
        {m.value}
      </span>
    </div>
  )
}

export default function CockpitPanel({ snapshot }: { snapshot: CockpitSnapshot }) {
  if (snapshot.metrics.length === 0) {
    return (
      <div className="card p-4 text-sm text-[var(--text-muted)]">
        Cockpit メトリクスを計算するためのデータが不足しています
      </div>
    )
  }
  return (
    <div className="card p-3">
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">
          Cockpit (re-impl. without RS / Growth)
        </span>
        {snapshot.asOf && (
          <span className="text-[11px] font-mono text-[var(--text-muted)]">
            {snapshot.asOf}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-9 gap-2">
        {snapshot.metrics.map(m => (
          <MetricCell key={m.key} m={m} />
        ))}
      </div>
    </div>
  )
}
