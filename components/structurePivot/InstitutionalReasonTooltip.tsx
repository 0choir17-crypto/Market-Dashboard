import type { ReactElement } from 'react'
import type {
  StructurePivotReason,
  StructurePivotReasonItem,
} from '@/types/structurePivot'

const ITEM_LABELS: Record<keyof StructurePivotReason, string> = {
  eps_growth_yoy: 'EPS YoY',
  revenue_growth_yoy: '売上 YoY',
  section_ft_buyweeks_4w: '海外+信託 買い越し週 (4w)',
  sector_rs_21d: '業種 RS 21d',
  sector_momentum: '業種モメンタム',
  disc_guard: '決算直前ガード',
}

type Props = {
  reason: StructurePivotReason | null
  pass: boolean | null
}

function formatThreshold(
  threshold: StructurePivotReasonItem['threshold'],
): string {
  if (Array.isArray(threshold)) return threshold.join(',')
  return String(threshold)
}

function formatValue(value: StructurePivotReasonItem['value']): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(2)
  }
  return String(value)
}

export default function InstitutionalReasonTooltip({
  reason,
  pass,
}: Props): ReactElement | null {
  if (!reason || pass == null) return null
  const entries = (
    Object.entries(reason) as [
      keyof StructurePivotReason,
      StructurePivotReasonItem | undefined,
    ][]
  ).filter((e): e is [keyof StructurePivotReason, StructurePivotReasonItem] =>
    Boolean(e[1]),
  )
  if (entries.length === 0) return null

  return (
    <div
      className="rounded-md p-2 shadow-sm text-xs"
      style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border)',
        minWidth: 240,
      }}
    >
      <div
        className="font-bold mb-1.5"
        style={{
          color: pass ? 'var(--positive)' : 'var(--negative)',
        }}
      >
        {pass ? '✅ Institutional pass' : '❌ Institutional fail'}
      </div>
      <table className="text-[11px] leading-snug">
        <tbody>
          {entries.map(([k, item]) => (
            <tr key={k}>
              <td className="pr-2 align-top" style={{ color: 'var(--text-secondary)' }}>
                {ITEM_LABELS[k] ?? k}
              </td>
              <td
                className="pr-2 font-mono align-top"
                style={{
                  color: item.passed ? 'var(--positive)' : 'var(--negative)',
                }}
              >
                {item.passed ? '✓' : '✗'} {formatValue(item.value)}
              </td>
              <td className="font-mono align-top" style={{ color: 'var(--text-muted)' }}>
                {item.op} {formatThreshold(item.threshold)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
