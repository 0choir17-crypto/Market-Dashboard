import { MarketConditions } from '@/types/market'
import { IndexChart } from './IndexChart'

type Prefix = 'topix' | 'nikkei' | 'growth'

type Props = {
  label: string
  prefix: Prefix
  data: MarketConditions | null
  className?: string
}

function fmt(val: number | null | undefined, decimals = 2): string {
  if (val === null || val === undefined) return '—'
  return val.toFixed(decimals)
}

function fmtPrice(val: number | null | undefined): string {
  if (val === null || val === undefined) return '—'
  return val.toLocaleString('ja-JP', { maximumFractionDigits: 2 })
}

function ChangePill({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return <span className="text-[var(--text-muted)]">—</span>
  const positive = value >= 0
  return (
    <span
      className="font-mono text-sm font-semibold"
      style={{ color: positive ? 'var(--positive)' : 'var(--negative)' }}
    >
      {positive ? '+' : ''}{value.toFixed(2)}%
    </span>
  )
}

function SmaBadge({ above, label }: { above: boolean | null | undefined; label: string }) {
  if (above === null || above === undefined) {
    return (
      <span className="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-400">{label} N/A</span>
    )
  }
  return (
    <span
      className="px-1.5 py-0.5 rounded text-xs font-medium"
      style={
        above
          ? { backgroundColor: 'var(--positive-bg)', color: 'var(--positive)' }
          : { backgroundColor: 'var(--negative-bg)', color: 'var(--negative)' }
      }
    >
      {label} {above ? '↑' : '↓'}
    </span>
  )
}

export default function IndexCard({ label, prefix, data, className }: Props) {
  const p = (field: string) => `${prefix}_${field}` as keyof MarketConditions

  const price      = data?.[p('price')]      as number | null
  const chg1w      = data?.[p('chg_1w')]     as number | null
  const chg1m      = data?.[p('chg_1m')]     as number | null
  const chgYtd     = data?.[p('chg_ytd')]    as number | null
  const chg1y      = data?.[p('chg_1y')]     as number | null
  const pct52wh    = data?.[p('pct_52wh')]   as number | null
  const aboveSma50 = data?.[p('above_sma50')]  as boolean | null
  const aboveSma200= data?.[p('above_sma200')] as boolean | null

  return (
    <div className={`bg-white rounded-xl border border-[#e8eaed] shadow-sm p-4 ${className ?? ''}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-[var(--text-secondary)]">{label}</h3>
        <div className="flex gap-1">
          <SmaBadge above={aboveSma50} label="SMA50" />
          <SmaBadge above={aboveSma200} label="SMA200" />
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        {/* Left: existing numeric info */}
        <div className="flex-shrink-0 md:w-[220px]">
          <div
            className="text-3xl font-bold mb-4 font-mono"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono, monospace)' }}
          >
            {fmtPrice(price)}
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">1W</span>
              <ChangePill value={chg1w} />
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">1M</span>
              <ChangePill value={chg1m} />
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">YTD</span>
              <ChangePill value={chgYtd} />
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">1Y</span>
              <ChangePill value={chg1y} />
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-[var(--border)] text-xs text-[var(--text-muted)] flex justify-between">
            <span>To 52W High</span>
            <span className="font-mono font-medium text-[var(--text-secondary)]">
              {fmt(pct52wh)}%
            </span>
          </div>
        </div>

        {/* Right: index chart */}
        <div className="flex-1 min-w-0">
          <IndexChart prefix={prefix} displayName={label} height={260} />
        </div>
      </div>
    </div>
  )
}
