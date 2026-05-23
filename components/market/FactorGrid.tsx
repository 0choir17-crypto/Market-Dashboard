import { MarketConditions } from '@/types/market'

type Props = { market: MarketConditions | null }

// ── v4 8-Factor display (0-100 percentile rank per factor) ──────────────────
// Weights match mc_config/mc_v4_config.py.

type V4Factor = {
  key: keyof MarketConditions
  label: string
  weight: number  // %
}

const V4_FACTORS: V4Factor[] = [
  { key: 'mc_v4_m1', label: 'M1 Short MOM',     weight: 20 },
  { key: 'mc_v4_m2', label: 'M2 Mid Trend',     weight: 10 },
  { key: 'mc_v4_m3', label: 'M3 EMA Slope',     weight: 20 },
  { key: 'mc_v4_c1', label: 'C1 Long Confirm',  weight: 5  },
  { key: 'mc_v4_b1', label: 'B1 Breadth',       weight: 15 },
  { key: 'mc_v4_s1', label: 'S1 Flow',          weight: 15 },
  { key: 'mc_v4_s2', label: 'S2 IV',            weight: 10 },
  { key: 'mc_v4_s3', label: 'S3 Short/Basis',   weight: 5  },
]

// regime 境界 (80/60/40/20) と同じ色階調でスコアバーを塗る
function v4Color(score: number): string {
  if (score >= 80) return '#639922'  // strong_bull
  if (score >= 60) return '#97C459'  // bull
  if (score >= 40) return '#B4B2A9'  // neutral
  if (score >= 20) return '#F09595'  // bear
  return '#E24B4A'                    // strong_bear
}

function ScoreBar({ score }: { score: number | null | undefined }) {
  if (score === null || score === undefined) {
    return (
      <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-400">
        N/A
      </span>
    )
  }
  const pct = Math.max(0, Math.min(100, score))
  const color = v4Color(pct)
  return (
    <div className="flex items-center gap-2 w-32">
      <div className="flex-1 h-2 bg-gray-200 rounded overflow-hidden">
        <div
          className="h-full rounded"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs font-mono text-gray-500 w-8 text-right">
        {Math.round(pct)}
      </span>
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

export default function FactorGrid({ market }: Props) {
  const validWeight = market?.mc_v4_valid_weight_pct
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-gray-500">8 Factors (v4)</p>
        {validWeight != null && (
          <span className="text-[11px] font-mono text-gray-400">
            valid_weight: {validWeight.toFixed(0)}%
          </span>
        )}
      </div>
      <div className="space-y-1.5">
        {V4_FACTORS.map(f => (
          <div key={f.key} className="flex justify-between items-center py-1">
            <span className="text-sm text-gray-600">
              {f.label}
              <span className="ml-1 text-[10px] text-gray-400">{f.weight}%</span>
            </span>
            <ScoreBar score={market?.[f.key] as number | null} />
          </div>
        ))}
      </div>
    </div>
  )
}
