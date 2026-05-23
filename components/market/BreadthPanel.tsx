import { MarketConditions } from '@/types/market'
import { AdvDecRatioChart } from './AdvDecRatioChart'
import { NhNlDiffChart } from './NhNlDiffChart'
import { PctAboveSmaChart } from './PctAboveSmaChart'

type Props = { market: MarketConditions | null }

function fmt(val: number | null | undefined, decimals = 1): string {
  if (val === null || val === undefined) return '—'
  return val.toFixed(decimals)
}

function fmtInt(val: number | null | undefined): string {
  if (val === null || val === undefined) return '—'
  return val.toLocaleString('ja-JP')
}

function AdRatioColor(ratio: number | null | undefined) {
  if (ratio === null || ratio === undefined) return 'var(--text-muted)'
  if (ratio < 70 || ratio > 120) return 'var(--negative)'
  return 'var(--positive)'
}

function ProgressBar({ pct, color }: { pct: number | null | undefined; color: string }) {
  const value = pct ?? 0
  return (
    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
      <div
        className="h-2 rounded-full transition-all"
        style={{ width: `${Math.min(Math.max(value, 0), 100)}%`, backgroundColor: color }}
      />
    </div>
  )
}

export default function BreadthPanel({ market }: Props) {
  const adRatio10Color = AdRatioColor(market?.ad_ratio_10)
  const adRatio25Color = AdRatioColor(market?.ad_ratio_25)

  const sma50pct = market?.pct_above_sma50 ?? 0
  const sma200pct = market?.pct_above_sma200 ?? 0

  return (
    <div className="card p-6">
      <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-5">
        Market Breadth
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">

        {/* Adv/Dec */}
        <div>
          <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">
            Adv / Dec
          </p>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Advances</span>
              <span className="font-mono font-semibold text-[var(--positive)]">
                {fmtInt(market?.advances)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Declines</span>
              <span className="font-mono font-semibold text-[var(--negative)]">
                {fmtInt(market?.declines)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Adv%</span>
              <span className="font-mono font-semibold text-[var(--text-primary)]">
                {fmt(market?.advance_pct)}%
              </span>
            </div>
          </div>
        </div>

        {/* Adv/Dec Ratio */}
        <div>
          <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">
            Adv/Dec Ratio
          </p>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-secondary)]">10D</span>
              <span
                className="font-mono font-semibold"
                style={{ color: adRatio10Color }}
              >
                {fmt(market?.ad_ratio_10)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-secondary)]">25D</span>
              <span
                className="font-mono font-semibold"
                style={{ color: adRatio25Color }}
              >
                {fmt(market?.ad_ratio_25)}
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              &lt;70: oversold　&gt;120: overbought
            </p>
          </div>
          <AdvDecRatioChart height={180} />
        </div>

        {/* New Highs / Lows */}
        <div>
          <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">
            New Highs / Lows
          </p>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-secondary)]">New High (NH)</span>
              <span className="font-mono font-semibold text-[var(--positive)]">
                {fmtInt(market?.new_highs)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-secondary)]">New Low (NL)</span>
              <span className="font-mono font-semibold text-[var(--negative)]">
                {fmtInt(market?.new_lows)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-secondary)]">NH-NL Diff</span>
              <span
                className="font-mono font-semibold"
                style={{
                  color:
                    (market?.nh_nl_diff ?? 0) >= 0
                      ? 'var(--positive)'
                      : 'var(--negative)',
                }}
              >
                {market?.nh_nl_diff !== null && market?.nh_nl_diff !== undefined
                  ? (market.nh_nl_diff >= 0 ? '+' : '') + fmtInt(market.nh_nl_diff)
                  : '—'}
              </span>
            </div>
          </div>
          <NhNlDiffChart height={180} />
        </div>

        {/* % Above SMA */}
        <div>
          <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">
            % Above SMA
          </p>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-[var(--text-secondary)]">SMA50</span>
                <span
                  className="font-mono font-semibold"
                  style={{ color: sma50pct >= 50 ? 'var(--positive)' : 'var(--negative)' }}
                >
                  {fmt(market?.pct_above_sma50)}%
                </span>
              </div>
              <ProgressBar
                pct={sma50pct}
                color={sma50pct >= 50 ? 'var(--positive)' : 'var(--negative)'}
              />
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-[var(--text-secondary)]">SMA200</span>
                <span
                  className="font-mono font-semibold"
                  style={{ color: sma200pct >= 50 ? 'var(--positive)' : 'var(--negative)' }}
                >
                  {fmt(market?.pct_above_sma200)}%
                </span>
              </div>
              <ProgressBar
                pct={sma200pct}
                color={sma200pct >= 50 ? 'var(--positive)' : 'var(--negative)'}
              />
            </div>
          </div>
          <PctAboveSmaChart height={180} />
        </div>

      </div>
    </div>
  )
}
