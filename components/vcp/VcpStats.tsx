import { DailyVcpScreen } from '@/types/vcp'

function isPivotNear(p: number | null) {
  return p != null && p >= -2 && p <= 2
}

export default function VcpStats({ rows }: { rows: DailyVcpScreen[] }) {
  const total = rows.length
  const stage2 = rows.filter(r => r.ma_stack === 1).length
  const pivot = rows.filter(r => isPivotNear(r.pct_from_20d_high)).length

  return (
    <div className="mb-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
      <StatCard label="候補数" value={`${total}`} suffix="件" />
      <StatCard
        label="完全 Stage 2 (ma_stack=1)"
        value={`${stage2}`}
        suffix="件"
        accent={stage2 > 0 ? 'positive' : undefined}
      />
      <StatCard
        label="Pivot 近接 (±2%)"
        value={`${pivot}`}
        suffix="件"
        accent={pivot > 0 ? 'highlight' : undefined}
      />
    </div>
  )
}

function StatCard({
  label,
  value,
  suffix,
  accent,
}: {
  label: string
  value: string
  suffix?: string
  accent?: 'positive' | 'highlight'
}) {
  const valueColor =
    accent === 'positive'
      ? 'var(--positive)'
      : accent === 'highlight'
        ? '#a16207'
        : 'var(--text-primary)'
  const bg =
    accent === 'highlight' ? '#fefce8' : 'var(--bg-card)'
  const border =
    accent === 'highlight' ? '#fde68a' : 'var(--border)'

  return (
    <div
      className="rounded-xl border px-4 py-3"
      style={{ backgroundColor: bg, borderColor: border }}
    >
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 font-mono">
        <span className="text-2xl font-bold" style={{ color: valueColor }}>
          {value}
        </span>
        {suffix && (
          <span className="text-xs ml-1 text-gray-500">{suffix}</span>
        )}
      </p>
    </div>
  )
}
