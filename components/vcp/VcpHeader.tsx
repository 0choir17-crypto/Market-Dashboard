import { VcpRegime } from '@/types/vcp'

type RegimeMeta = {
  label: string
  color: string
  bg: string
  border: string
  context: string
  warn?: boolean
}

const REGIME_META: Record<string, RegimeMeta> = {
  strong_bull: {
    label: 'Strong Bull',
    color: '#166534',
    bg: '#dcfce7',
    border: '#86efac',
    context: '最良環境: 過去勝率 50%',
  },
  bull: {
    label: 'Bull',
    color: '#15803d',
    bg: '#ecfdf5',
    border: '#a7f3d0',
    context: '好環境: 過去勝率 49%',
  },
  neutral: {
    label: 'Neutral',
    color: '#4b5563',
    bg: '#f3f4f6',
    border: '#d1d5db',
    context: '⚠️ 注意: neutral 期は勝率 36% に低下',
    warn: true,
  },
  bear: {
    label: 'Bear',
    color: '#92400e',
    bg: '#fef3c7',
    border: '#fcd34d',
    context: '逆風だが勝率 45% 維持',
  },
  strong_bear: {
    label: 'Strong Bear',
    color: '#991b1b',
    bg: '#fee2e2',
    border: '#fca5a5',
    context: '⚠️ 注意: 勝率 40%, テールリスク高',
    warn: true,
  },
}

const FALLBACK: RegimeMeta = {
  label: '—',
  color: '#6b7280',
  bg: '#f3f4f6',
  border: '#e5e7eb',
  context: 'regime データなし',
}

export default function VcpHeader({
  regime,
  mcV4,
}: {
  regime: VcpRegime | null | undefined
  mcV4: number | null | undefined
}) {
  const meta = (regime && REGIME_META[regime]) || FALLBACK

  return (
    <div className="mb-6">
      <div
        className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl border"
        style={{
          backgroundColor: meta.bg,
          borderColor: meta.border,
        }}
      >
        <span
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold"
          style={{
            color: meta.color,
            backgroundColor: '#ffffffaa',
            border: `1px solid ${meta.border}`,
          }}
        >
          {'●'} {meta.label}
        </span>
        {mcV4 != null && (
          <span
            className="text-sm font-mono font-semibold"
            style={{ color: meta.color }}
          >
            mc_v4 {Number(mcV4).toFixed(1)} / 100
          </span>
        )}
        <span
          className="text-sm"
          style={{
            color: meta.color,
            fontWeight: meta.warn ? 600 : 500,
          }}
        >
          {meta.context}
        </span>
      </div>
    </div>
  )
}
