import { MarketConditions } from '@/types/market'
import { AdvDecChart } from './AdvDecChart'
import { AdvDecRatioChart } from './AdvDecRatioChart'
import { NhNlDiffChart } from './NhNlDiffChart'

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
        <p className="text-caption font-medium text-[var(--text-muted)] uppercase tracking-wide">
          {title}
        </p>
        {subtitle && (
          <p className="text-caption text-[var(--text-muted)]">{subtitle}</p>
        )}
      </div>
      {children}
    </div>
  )
}

export default function BreadthPanel({ market }: Props) {
  const adRatio10Color = AdRatioColor(market?.ad_ratio_10)
  const adRatio25Color = AdRatioColor(market?.ad_ratio_25)

  return (
    // Breadth 判定カードの詳細モーダル内に置くので、外枠と見出しは持たない。
    // 移動平均より上の割合は判定カード側の推移チャート（BreadthHistoryChart）に移した。
    <div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Adv / Dec */}
        <BreadthCard title="Adv / Dec" subtitle="値上がり比率(Adv%)の推移">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-caption text-[var(--text-muted)] mb-0.5">Advances</p>
              <p className="font-mono text-title font-medium text-[var(--positive)]">
                {fmtInt(market?.advances)}
              </p>
            </div>
            <div>
              <p className="text-caption text-[var(--text-muted)] mb-0.5">Declines</p>
              <p className="font-mono text-title font-medium text-[var(--negative)]">
                {fmtInt(market?.declines)}
              </p>
            </div>
            <div>
              <p className="text-caption text-[var(--text-muted)] mb-0.5">Adv%</p>
              <p className="font-mono text-title font-medium text-[var(--text-primary)]">
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
              <p className="text-caption text-[var(--text-muted)] mb-0.5">10D</p>
              <p className="font-mono text-title font-medium" style={{ color: adRatio10Color }}>
                {fmt(market?.ad_ratio_10)}
              </p>
            </div>
            <div>
              <p className="text-caption text-[var(--text-muted)] mb-0.5">25D</p>
              <p className="font-mono text-title font-medium" style={{ color: adRatio25Color }}>
                {fmt(market?.ad_ratio_25)}
              </p>
            </div>
          </div>
          <p className="text-caption text-[var(--text-muted)] mt-2">
            &lt;70: oversold　&gt;120: overbought
          </p>
          <AdvDecRatioChart height={200} />
        </BreadthCard>

        {/* New Highs / Lows */}
        <BreadthCard title="New Highs / Lows">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-caption text-[var(--text-muted)] mb-0.5">New High</p>
              <p className="font-mono text-title font-medium text-[var(--positive)]">
                {fmtInt(market?.new_highs)}
              </p>
            </div>
            <div>
              <p className="text-caption text-[var(--text-muted)] mb-0.5">New Low</p>
              <p className="font-mono text-title font-medium text-[var(--negative)]">
                {fmtInt(market?.new_lows)}
              </p>
            </div>
            <div>
              <p className="text-caption text-[var(--text-muted)] mb-0.5">NH-NL</p>
              <p
                className="font-mono text-title font-medium"
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

      </div>
    </div>
  )
}
