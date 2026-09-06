import { MarketConditions } from '@/types/market'
import { AdvDecChart } from './AdvDecChart'
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
    <div className="w-full bg-[var(--bg-primary)] rounded-full h-2 overflow-hidden">
      <div
        className="h-2 rounded-full transition-all"
        style={{ width: `${Math.min(Math.max(value, 0), 100)}%`, backgroundColor: color }}
      />
    </div>
  )
}

// 各指標をカード化して余白を確保することで、内部のチャートが横幅を広く取れる。
// （狭い 4 列レイアウトだと月ラベルが間引かれて見づらかったため 2 列に変更）
function BreadthCard({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card-hover)] p-5">
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
          {title}
        </p>
        {subtitle && (
          <p className="text-xs text-[var(--text-muted)]">{subtitle}</p>
        )}
      </div>
      {children}
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
      <div className="flex items-baseline justify-between mb-5">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          Market Breadth
        </h2>
        <span className="text-xs text-[var(--text-muted)]">
          市場の内部状態（騰落・新高安・移動平均上）
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Adv / Dec */}
        <BreadthCard title="Adv / Dec" subtitle="値上がり比率(Adv%)の推移">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-xs text-[var(--text-muted)] mb-0.5">Advances</p>
              <p className="font-mono text-lg font-semibold text-[var(--positive)]">
                {fmtInt(market?.advances)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)] mb-0.5">Declines</p>
              <p className="font-mono text-lg font-semibold text-[var(--negative)]">
                {fmtInt(market?.declines)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)] mb-0.5">Adv%</p>
              <p className="font-mono text-lg font-semibold text-[var(--text-primary)]">
                {fmt(market?.advance_pct)}%
              </p>
            </div>
          </div>
          <AdvDecChart height={200} />
        </BreadthCard>

        {/* Adv/Dec Ratio */}
        <BreadthCard title="Adv/Dec Ratio" subtitle="騰落レシオ（過熱度）">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-[var(--text-muted)] mb-0.5">10D</p>
              <p className="font-mono text-lg font-semibold" style={{ color: adRatio10Color }}>
                {fmt(market?.ad_ratio_10)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)] mb-0.5">25D</p>
              <p className="font-mono text-lg font-semibold" style={{ color: adRatio25Color }}>
                {fmt(market?.ad_ratio_25)}
              </p>
            </div>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-2">
            &lt;70: oversold　&gt;120: overbought
          </p>
          <AdvDecRatioChart height={200} />
        </BreadthCard>

        {/* New Highs / Lows */}
        <BreadthCard title="New Highs / Lows">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-xs text-[var(--text-muted)] mb-0.5">New High</p>
              <p className="font-mono text-lg font-semibold text-[var(--positive)]">
                {fmtInt(market?.new_highs)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)] mb-0.5">New Low</p>
              <p className="font-mono text-lg font-semibold text-[var(--negative)]">
                {fmtInt(market?.new_lows)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)] mb-0.5">NH-NL</p>
              <p
                className="font-mono text-lg font-semibold"
                style={{
                  color:
                    (market?.nh_nl_diff ?? 0) >= 0 ? 'var(--positive)' : 'var(--negative)',
                }}
              >
                {market?.nh_nl_diff !== null && market?.nh_nl_diff !== undefined
                  ? (market.nh_nl_diff >= 0 ? '+' : '') + fmtInt(market.nh_nl_diff)
                  : '—'}
              </p>
            </div>
          </div>
          <NhNlDiffChart height={200} />
        </BreadthCard>

        {/* % Above SMA */}
        <BreadthCard title="% Above SMA">
          <div className="space-y-3">
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
          <PctAboveSmaChart height={200} />
        </BreadthCard>

      </div>
    </div>
  )
}
