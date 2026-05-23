import { MarketConditions } from '@/types/market'

type Props = { market: MarketConditions | null }

function fmtSigned(val: number | null | undefined, decimals = 2): string {
  if (val === null || val === undefined) return '—'
  const s = val.toFixed(decimals)
  return val >= 0 ? `+${s}` : s
}

function fmt(val: number | null | undefined, decimals = 2): string {
  if (val === null || val === undefined) return '—'
  return val.toFixed(decimals)
}

function deltaColor(val: number | null | undefined): string {
  if (val === null || val === undefined) return 'var(--text-muted)'
  if (val > 0) return 'var(--positive)'
  if (val < 0) return 'var(--negative)'
  return 'var(--text-secondary)'
}

function CardShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-[#e8eaed] shadow-sm p-4 flex flex-col">
      <p className="text-sm font-semibold text-gray-500 mb-3">{title}</p>
      {children}
    </div>
  )
}

function VelocityCard({ market }: Props) {
  const d1 = market?.mc_v4_delta_1d
  const d5 = market?.mc_v4_delta_5d
  const d10 = market?.mc_v4_delta_10d
  const vol = market?.mc_v4_volatility_20d

  return (
    <CardShell title="Velocity">
      <div
        className="text-3xl font-mono font-bold leading-none"
        style={{ color: deltaColor(d1) }}
      >
        {fmtSigned(d1)}
      </div>
      <p className="text-[10px] text-gray-400 mt-1 mb-3">Δ MC v4 (1d)</p>

      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">5d</span>
          <span className="font-mono font-semibold" style={{ color: deltaColor(d5) }}>
            {fmtSigned(d5)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">10d</span>
          <span className="font-mono font-semibold" style={{ color: deltaColor(d10) }}>
            {fmtSigned(d10)}
          </span>
        </div>
      </div>

      <hr className="my-3 border-[#e8eaed]" />
      <div className="flex justify-between text-xs">
        <span className="text-gray-500">Volatility 20d</span>
        <span className="font-mono font-medium text-gray-700">{fmt(vol)}</span>
      </div>
    </CardShell>
  )
}

function DurationCard({ market }: Props) {
  const runLen = market?.regime_run_length
  const since = market?.days_since_regime_shift
  const event = market?.regime_shift_event

  return (
    <CardShell title="Duration">
      <div className="flex items-baseline gap-1 leading-none">
        <span className="text-3xl font-mono font-bold text-gray-800">
          {runLen ?? '—'}
        </span>
        <span className="text-base font-medium text-gray-500">days</span>
      </div>
      <p className="text-[10px] text-gray-400 mt-1 mb-3">Current regime run length</p>

      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Days since shift</span>
          <span className="font-mono font-semibold text-gray-700">{since ?? '—'}</span>
        </div>
      </div>

      <hr className="my-3 border-[#e8eaed]" />
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500">Shift event</span>
        {event === 1 ? (
          <span
            className="px-2 py-0.5 rounded font-semibold"
            style={{ backgroundColor: '#FAEEDA', color: '#633806' }}
          >
            Shifted today
          </span>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </div>
    </CardShell>
  )
}

function ShockCard({ market }: Props) {
  const windows = [10, 15, 20] as const
  const rows = windows.map((w) => ({
    w,
    panic: (market?.[`panic_flag_${w}` as keyof MarketConditions] as number | null | undefined) === 1,
    relief: (market?.[`relief_flag_${w}` as keyof MarketConditions] as number | null | undefined) === 1,
  }))
  const anyPanic = rows.some((r) => r.panic)
  const anyRelief = rows.some((r) => r.relief)
  const state = anyPanic ? 'Panic' : anyRelief ? 'Relief' : 'Calm'
  const stateColor = anyPanic ? 'var(--negative)' : anyRelief ? 'var(--positive)' : 'var(--text-muted)'

  return (
    <CardShell title="Shock">
      <div className="text-2xl font-bold leading-none" style={{ color: stateColor }}>
        {state}
      </div>
      <p className="text-[10px] text-gray-400 mt-1 mb-3">Current shock state</p>

      <div className="space-y-1.5 text-xs">
        <div className="grid grid-cols-[2.5rem_1fr_1fr] gap-2 text-gray-400 font-medium">
          <span></span>
          <span className="text-center">Panic</span>
          <span className="text-center">Relief</span>
        </div>
        {rows.map(({ w, panic, relief }) => (
          <div key={w} className="grid grid-cols-[2.5rem_1fr_1fr] gap-2 items-center">
            <span className="text-gray-500">{w}d</span>
            <span className="text-center">
              {panic ? (
                <span
                  className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold"
                  style={{ backgroundColor: 'var(--negative-bg)', color: 'var(--negative)' }}
                >
                  ON
                </span>
              ) : (
                <span className="text-gray-300">—</span>
              )}
            </span>
            <span className="text-center">
              {relief ? (
                <span
                  className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold"
                  style={{ backgroundColor: 'var(--positive-bg)', color: 'var(--positive)' }}
                >
                  ON
                </span>
              ) : (
                <span className="text-gray-300">—</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </CardShell>
  )
}

export default function DynamicsCards({ market }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
      <VelocityCard market={market} />
      <DurationCard market={market} />
      <ShockCard market={market} />
    </div>
  )
}
