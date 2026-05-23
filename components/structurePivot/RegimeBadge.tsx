import type { ReactElement } from 'react'

type RegimeStyle = {
  label: string
  bg: string
  color: string
  border: string
  pf?: number
}

const REGIME_STYLE: Record<string, RegimeStyle> = {
  very_bear: {
    label: '🔻 V.Bear',
    bg: '#fee2e2',
    color: '#991b1b',
    border: '#fecaca',
    pf: 1.02,
  },
  bear: {
    label: '🟠 Bear',
    bg: '#ffedd5',
    color: '#9a3412',
    border: '#fed7aa',
    pf: 2.43,
  },
  neutral: {
    label: '🟡 Neutral',
    bg: '#fef9c3',
    color: '#854d0e',
    border: '#fde68a',
    pf: 1.73,
  },
  bull: {
    label: '🟢 Bull',
    bg: '#dcfce7',
    color: '#166534',
    border: '#86efac',
    pf: 3.21,
  },
  very_bull: {
    label: '💚 V.Bull',
    bg: '#a7f3d0',
    color: '#064e3b',
    border: '#6ee7b7',
    pf: 3.30,
  },
}

type Props = {
  regime: string | null
  size?: 'sm' | 'md'
}

export default function RegimeBadge({
  regime,
  size = 'sm',
}: Props): ReactElement | null {
  if (!regime) return null
  const style = REGIME_STYLE[regime]
  if (!style) return null
  const tooltip =
    style.pf != null
      ? `Phase 3.5 検証 OOS PF: ${style.pf} (regime 別、参考値)`
      : undefined
  const cls =
    size === 'md'
      ? 'inline-flex items-center px-2 py-0.5 rounded-md font-mono text-xs font-semibold'
      : 'inline-flex items-center px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold'
  return (
    <span
      className={cls}
      style={{
        backgroundColor: style.bg,
        color: style.color,
        border: `1px solid ${style.border}`,
      }}
      title={tooltip}
    >
      {style.label}
    </span>
  )
}
