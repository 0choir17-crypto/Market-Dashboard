import type { StructurePivotSummary } from '@/types/structurePivot'
import RegimeBadge from './RegimeBadge'

type Props = {
  summary: StructurePivotSummary
  regime: string | null
  mcV4: number | null
}

export default function StructurePivotHeader({ summary, regime, mcV4 }: Props) {
  const { total, by_tier, by_signal } = summary

  return (
    <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
      {/* Totals + Tier breakdown */}
      <div
        className="rounded-xl border px-4 py-3"
        style={{
          backgroundColor: 'var(--bg-card)',
          borderColor: 'var(--border)',
        }}
      >
        <p className="text-xs text-gray-500">候補数 (Total)</p>
        <p className="mt-1 font-mono">
          <span className="text-2xl font-bold text-[var(--text-primary)]">
            {total}
          </span>
          <span className="text-xs ml-1 text-gray-500">件</span>
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <TierChip tier="S" count={by_tier.S} />
          <TierChip tier="A" count={by_tier.A} />
          <TierChip tier="B" count={by_tier.B} />
        </div>
      </div>

      {/* Signal breakdown */}
      <div
        className="rounded-xl border px-4 py-3"
        style={{
          backgroundColor: 'var(--bg-card)',
          borderColor: 'var(--border)',
        }}
      >
        <p className="text-xs text-gray-500">Signal</p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <SignalChip kind="HL_BREAK" count={by_signal.HL_BREAK} />
          <SignalChip kind="SETUP_LONG" count={by_signal.SETUP_LONG} />
        </div>
        <p className="mt-2 text-[11px] leading-snug text-gray-500">
          HL_BREAK = 当日 close が pivot を突破 / SETUP_LONG = ブレイク待ち
        </p>
      </div>

      {/* Market context */}
      <div
        className="rounded-xl border px-4 py-3"
        style={{
          backgroundColor: 'var(--bg-card)',
          borderColor: 'var(--border)',
        }}
      >
        <p className="text-xs text-gray-500">Market</p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          {regime ? (
            <RegimeBadge regime={regime} size="md" />
          ) : (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono font-semibold"
              style={{
                backgroundColor: '#f3f4f6',
                color: '#374151',
                border: '1px solid #d1d5db',
              }}
            >
              regime: —
            </span>
          )}
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono font-semibold"
            style={{
              backgroundColor: '#f3f4f6',
              color: '#374151',
              border: '1px solid #d1d5db',
            }}
          >
            mc_v4: {mcV4 != null ? Number(mcV4).toFixed(1) : '—'}
          </span>
        </div>
        <p className="mt-2 text-[11px] leading-snug text-gray-500">
          regime は features.market_regime_v4 由来 (Phase 4)。mc_v4 ∈ [70, 85) で S tier 出現。
        </p>
      </div>
    </div>
  )
}

function TierChip({
  tier,
  count,
}: {
  tier: 'S' | 'A' | 'B'
  count: number
}) {
  const meta =
    tier === 'S'
      ? { label: '⭐ S', bg: '#fef3c7', color: '#92400e', border: '#fcd34d' }
      : tier === 'A'
        ? { label: '🅰️ A', bg: '#e5e7eb', color: '#374151', border: '#9ca3af' }
        : { label: '⚪ B', bg: '#f9fafb', color: '#6b7280', border: '#e5e7eb' }
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono font-semibold"
      style={{
        backgroundColor: meta.bg,
        color: meta.color,
        border: `1px solid ${meta.border}`,
      }}
    >
      {meta.label} = {count}
    </span>
  )
}

function SignalChip({
  kind,
  count,
}: {
  kind: 'HL_BREAK' | 'SETUP_LONG'
  count: number
}) {
  const meta =
    kind === 'HL_BREAK'
      ? {
          label: '🔵 HL_BREAK',
          bg: '#dbeafe',
          color: '#1e40af',
          border: '#93c5fd',
        }
      : {
          label: '🟡 SETUP_LONG',
          bg: '#fef9c3',
          color: '#854d0e',
          border: '#fde68a',
        }
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono font-semibold"
      style={{
        backgroundColor: meta.bg,
        color: meta.color,
        border: `1px solid ${meta.border}`,
      }}
    >
      {meta.label} = {count}
    </span>
  )
}
