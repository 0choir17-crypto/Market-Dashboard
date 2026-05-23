'use client'

import {
  ScatterChart, Scatter, XAxis, YAxis, Tooltip as RechartsTooltip,
  ReferenceLine, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { SectorData, Quadrant, getQuadrant, QUADRANT_CONFIG } from '@/types/sectors'

type Props = { sectors: SectorData[] }

type PointData = {
  x: number
  y: number
  name: string
  quadrant: Quadrant
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload as PointData | undefined
  return (
    <div className="bg-white border border-[#e8eaed] rounded-lg px-3 py-2 shadow-sm text-xs">
      <p className="font-medium text-gray-700 mb-1">{d?.name}</p>
      <p className="text-gray-500">SMA50 Dist: <span className="font-mono">{(d?.x ?? 0).toFixed(2)}%</span></p>
      <p className="text-gray-500">5D%: <span className="font-mono">{(d?.y ?? 0).toFixed(2)}%</span></p>
    </div>
  )
}

/** セクター名ラベルを描画するカスタムシェイプ */
function SectorLabel(props: any) {
  const { cx, cy, payload } = props
  if (cx == null || cy == null || !payload) return null
  const d = payload as PointData
  const color = QUADRANT_CONFIG[d.quadrant].color
  return (
    <text
      x={cx}
      y={cy}
      textAnchor="middle"
      dominantBaseline="central"
      fill={color}
      fontSize={11}
      fontWeight={600}
    >
      {d.name}
    </text>
  )
}

export default function SectorRRG({ sectors }: Props) {
  if (sectors.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-[#e8eaed] shadow-sm p-8 text-center text-gray-400">
        <p className="text-sm">データ不足（20日以上必要）</p>
      </div>
    )
  }

  const allData: PointData[] = sectors.map(s => ({
    x: s.dist_sma50_pct ?? 0,
    y: s.chg_5d_pct     ?? 0,
    name: s.sector_name,
    quadrant: getQuadrant(s),
  }))

  return (
    <div className="bg-white rounded-xl border border-[#e8eaed] shadow-sm p-5">
      <p className="text-sm font-semibold text-gray-500 mb-4">
        Sector RRG (X: SMA50 Dist % / Y: 5D %)
      </p>
      <div className="relative">
        <ResponsiveContainer width="100%" height={420}>
          <ScatterChart margin={{ top: 20, right: 40, bottom: 30, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f4" />
            <XAxis
              type="number"
              dataKey="x"
              name="SMA50 Dist %"
              tick={{ fontSize: 11 }}
              tickFormatter={v => `${v}%`}
              label={{ value: 'SMA50 Dist %', position: 'insideBottom', offset: -15, fontSize: 11, fill: '#9ca3af' }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="5D%"
              tick={{ fontSize: 11 }}
              tickFormatter={v => `${v}%`}
              label={{ value: '5D%', angle: -90, position: 'insideLeft', offset: 15, fontSize: 11, fill: '#9ca3af' }}
            />
            <RechartsTooltip content={<CustomTooltip />} />
            <ReferenceLine x={0} stroke="#9ca3af" strokeDasharray="4 4" />
            <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="4 4" />
            <Scatter
              data={allData}
              shape={<SectorLabel />}
            />
          </ScatterChart>
        </ResponsiveContainer>
        {/* 4象限ラベル */}
        <div className="absolute top-6 right-8 text-[11px] font-semibold text-green-700 pointer-events-none">🟢 Leader</div>
        <div className="absolute top-6  left-16 text-[11px] font-semibold text-blue-700  pointer-events-none">🔵 Improving</div>
        <div className="absolute bottom-12 right-8 text-[11px] font-semibold text-amber-700 pointer-events-none">🟡 Weakening</div>
        <div className="absolute bottom-12 left-16 text-[11px] font-semibold text-red-700   pointer-events-none">🔴 Lagging</div>
      </div>
    </div>
  )
}
