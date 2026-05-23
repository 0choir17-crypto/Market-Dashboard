import { MarketConditions } from '@/types/market'

type Regime = MarketConditions['scorecard_regime']

const REGIME_CONFIG: Record<NonNullable<Regime>, { color: string; label: string }> = {
  strong_bull: { color: '#639922', label: 'Strong Bull' },
  bull:         { color: '#97C459', label: 'Bull' },
  neutral:      { color: '#B4B2A9', label: 'Neutral' },
  bear:         { color: '#F09595', label: 'Bear' },
  strong_bear:  { color: '#E24B4A', label: 'Strong Bear' },
}

const MARKET_REGIME_CONFIG: Record<string, { color: string; label: string }> = {
  bull:    { color: '#639922', label: 'Bull' },
  neutral: { color: '#B4B2A9', label: 'Neutral' },
  bear:    { color: '#E24B4A', label: 'Bear' },
}

const BREADTH_REGIME_CONFIG: Record<string, { color: string; label: string }> = {
  strong: { color: '#639922', label: 'Strong' },
  normal: { color: '#B4B2A9', label: 'Normal' },
  weak:   { color: '#E24B4A', label: 'Weak' },
}

type Props = {
  regime?: Regime
  marketRegime?: string
  breadthRegime?: string
  // MC v4 Score (0-100). null \u306e\u65e5\u4ed8\u306f "\u2014" \u8868\u793a
  mcV4Score?: number | null
  divergenceFlag?: number | null
}

export default function ScoreGauge({
  regime,
  marketRegime, breadthRegime,
  mcV4Score, divergenceFlag,
}: Props) {
  const config = regime ? REGIME_CONFIG[regime] : { color: '#9ca3af', label: '\u2014' }

  const hasScore = mcV4Score != null
  const scoreDisplay = hasScore ? Number(mcV4Score).toFixed(1) : null
  const pct = hasScore ? (mcV4Score as number) : 0

  const trendCfg   = marketRegime  ? MARKET_REGIME_CONFIG[marketRegime]   : null
  const breadthCfg = breadthRegime ? BREADTH_REGIME_CONFIG[breadthRegime] : null

  const trendColor        = trendCfg?.color   ?? '#9ca3af'
  const marketRegimeLabel = trendCfg?.label   ?? '\u2014'
  const breadthColor      = breadthCfg?.color ?? '#9ca3af'
  const breadthRegimeLabel = breadthCfg?.label ?? '\u2014'

  // SVG semi-circle gauge
  const cx = 100
  const cy = 100
  const r = 80
  const strokeWidth = 14

  const toRad = (deg: number) => (deg * Math.PI) / 180
  const startAngle = 180
  const endAngle = startAngle + (pct / 100) * 180

  const polarToXY = (angle: number) => ({
    x: cx + r * Math.cos(toRad(angle)),
    y: cy + r * Math.sin(toRad(angle)),
  })

  const start = polarToXY(startAngle)
  const end = polarToXY(endAngle)
  const largeArc = endAngle - startAngle > 180 ? 1 : 0

  const bgStart = polarToXY(180)
  const bgEnd = polarToXY(360)

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 140" width="100%" height="160" style={{ display: 'block' }}>
        {/* Background arc */}
        <path
          d={`M ${bgStart.x} ${bgStart.y} A ${r} ${r} 0 1 1 ${bgEnd.x} ${bgEnd.y}`}
          fill="none"
          stroke="#e8eaed"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Progress arc */}
        {pct > 0 && (
          <path
            d={`M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`}
            fill="none"
            stroke={config.color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        )}

        {/* Regime label */}
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          fontSize="18"
          fontWeight="700"
          fill={config.color}
          fontFamily="var(--font-sans, sans-serif)"
        >
          {config.label}
        </text>

        {/* Score label */}
        <text
          x={cx}
          y={cy + 16}
          textAnchor="middle"
          fontSize="11"
          fill="#6b7280"
          fontFamily="var(--font-mono, monospace)"
        >
          {scoreDisplay ?? '\u2014'} / 100
        </text>

        {/* Pct label */}
        <text
          x={cx}
          y={cy + 30}
          textAnchor="middle"
          fontSize="11"
          fill="#9ca3af"
          fontFamily="var(--font-mono, monospace)"
        >
          {pct.toFixed(1)}%
        </text>
      </svg>

      {/* Regime badge */}
      <span
        className="mt-2 px-3 py-1 rounded-full text-xs font-semibold"
        style={{
          backgroundColor: config.color + '1a',
          color: config.color,
          border: `1px solid ${config.color}40`,
        }}
      >
        {hasScore ? `MC v4: ${Number(mcV4Score).toFixed(1)}/100` : config.label}
      </span>

      {/* Divergence warning */}
      {divergenceFlag === 1 && (
        <div className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{ backgroundColor: '#FAEEDA', color: '#633806', border: '1px solid #F0D9A8' }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M8 1L15 14H1L8 1Z" fill="#EF9F27" />
            <text x="8" y="12" textAnchor="middle" fontSize="9" fill="white" fontWeight="bold">!</text>
          </svg>
          Divergence
        </div>
      )}

      {/* Sub-regimes (MC v4 \u3068\u306F\u5225\u7CFB\u7D71\u306E regime) */}
      <div className="mt-4 w-full">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
          Sub-regimes
        </p>
        <div className="rounded-lg border border-[#e8eaed] overflow-hidden text-sm">
          <div className="flex items-center justify-between px-4 py-2 border-b border-[#e8eaed]">
            <span className="text-gray-500 font-medium">Index Trend</span>
            <span className="flex items-center gap-1.5 font-semibold" style={{ color: trendColor }}>
              {'\u25CF'} {marketRegimeLabel}
            </span>
          </div>
          <div className="flex items-center justify-between px-4 py-2">
            <span className="text-gray-500 font-medium">Market Breadth</span>
            <span className="flex items-center gap-1.5 font-semibold" style={{ color: breadthColor }}>
              {'\u25CF'} {breadthRegimeLabel}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
