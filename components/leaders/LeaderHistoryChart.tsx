'use client'

import { useEffect, useMemo, useState } from 'react'
import { fetchLeaderHistory, type LeaderHistoryPoint } from '@/lib/marketLeadersFetch'
import { tradingViewUrl, shikihoUrl } from '@/lib/tickerLinks'
import { volColor } from '@/types/marketLeaders'

type Props = {
  code: string | null
  coname?: string | null
  onClose?: () => void
}

const W = 720
const H = 240
const PAD_L = 36
const PAD_R = 16
const PAD_T = 16
const PAD_B = 28

function isNum(v: number | null | undefined): v is number {
  return v !== null && v !== undefined && Number.isFinite(v)
}

export default function LeaderHistoryChart({ code, coname, onClose }: Props) {
  const [points, setPoints] = useState<LeaderHistoryPoint[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!code) {
      // schedule micro-task to avoid synchronous setState in effect body
      const t = setTimeout(() => setPoints([]), 0)
      return () => clearTimeout(t)
    }
    let cancelled = false
    const t = setTimeout(() => {
      setLoading(true)
      fetchLeaderHistory(code, 6).then(p => {
        if (!cancelled) {
          setPoints(p)
          setLoading(false)
        }
      })
    }, 0)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [code])

  const path = useMemo(() => {
    if (points.length === 0) return { rankD: '', csD: '', xs: [] as number[], ranks: [] as (number | null)[] }
    // 横軸: index 等間隔。market_rank は 1 が最上位なので反転 (1 が上 / 50 が下)
    const innerW = W - PAD_L - PAD_R
    const innerH = H - PAD_T - PAD_B
    const xs: number[] = points.map((_, i) => PAD_L + (i / Math.max(1, points.length - 1)) * innerW)
    const ranks = points.map(p => p.market_rank)
    // y for rank: 1 -> top, 50 -> bottom
    const yRank = (rank: number) => PAD_T + ((rank - 1) / 49) * innerH

    let rankD = ''
    let started = false
    for (let i = 0; i < points.length; i++) {
      const r = ranks[i]
      if (!isNum(r)) {
        started = false
        continue
      }
      const x = xs[i]
      const y = yRank(Math.max(1, Math.min(50, r)))
      rankD += `${started ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)} `
      started = true
    }

    // cs_avg は 0-100、ランクの裏側軸として薄いラインで重ねる
    const csD = (() => {
      let d = ''
      let s = false
      for (let i = 0; i < points.length; i++) {
        const v = points[i].cs_avg
        if (!isNum(v)) { s = false; continue }
        const x = xs[i]
        const y = PAD_T + (1 - Math.max(0, Math.min(100, v)) / 100) * innerH
        d += `${s ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)} `
        s = true
      }
      return d
    })()

    return { rankD, csD, xs, ranks }
  }, [points])

  if (!code) {
    return (
      <div className="bg-white rounded-xl border border-[#e8eaed] shadow-sm p-8 text-center text-gray-400">
        <p className="text-sm">銘柄を選択してください</p>
        <p className="text-[11px] mt-1">テーブル行をクリック、または検索ボックスから絞り込み</p>
      </div>
    )
  }

  const latest = points[points.length - 1]
  const innerH = H - PAD_T - PAD_B
  const yRankAxis = (rank: number) => PAD_T + ((rank - 1) / 49) * innerH

  return (
    <div className="bg-white rounded-xl border border-[#e8eaed] shadow-sm p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-700">
            <a href={tradingViewUrl(code)} target="_blank" rel="noopener noreferrer" className="font-mono text-[var(--accent)] hover:underline">{code}</a>
            {coname && (
              <a href={shikihoUrl(code)} target="_blank" rel="noopener noreferrer" className="ml-2 text-gray-800 hover:text-[var(--accent)] hover:underline">{coname}</a>
            )}
            <span className="ml-2 text-xs text-gray-500 font-normal">の足跡 (直近 6 ヶ月)</span>
          </p>
          {latest && (
            <p className="text-[11px] text-gray-500 mt-0.5">
              最新 {latest.date}: rank{' '}
              <span className="font-mono font-semibold">{latest.market_rank ?? '--'}</span>
              {' '}/ cs_avg{' '}
              <span className="font-mono font-semibold">
                {isNum(latest.cs_avg) ? latest.cs_avg.toFixed(1) : '--'}
              </span>
              {' '}/ vol_5d{' '}
              <span
                className="font-mono font-semibold px-1.5 py-0.5 rounded"
                style={(() => { const c = volColor(latest.vol_5d); return { backgroundColor: c.bg, color: c.text } })()}
              >
                {isNum(latest.vol_5d) ? latest.vol_5d.toFixed(2) : '--'}
              </span>
            </p>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50"
          >
            閉じる
          </button>
        )}
      </div>

      {loading && (
        <div className="py-8 text-center text-gray-400 text-sm">Loading...</div>
      )}

      {!loading && points.length === 0 && (
        <div className="py-8 text-center text-gray-400 text-sm">
          直近 6 ヶ月で Top50 入りした記録なし
        </div>
      )}

      {!loading && points.length > 0 && (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 280 }}>
            {/* 横線: rank 1, 10, 25, 50 */}
            {[1, 10, 25, 50].map(r => (
              <g key={r}>
                <line
                  x1={PAD_L}
                  x2={W - PAD_R}
                  y1={yRankAxis(r)}
                  y2={yRankAxis(r)}
                  stroke="#e5e7eb"
                  strokeDasharray={r === 10 ? '4 2' : '2 4'}
                  strokeWidth={1}
                />
                <text x={PAD_L - 4} y={yRankAxis(r) + 3} fontSize={10} textAnchor="end" fill="#9ca3af" fontFamily="monospace">
                  {r}
                </text>
              </g>
            ))}

            {/* cs_avg (薄い青) — 副軸表示 (右に縮小表示) */}
            <path d={path.csD} fill="none" stroke="#93c5fd" strokeWidth={1.5} opacity={0.6} />

            {/* market_rank (メイン: 赤系) */}
            <path d={path.rankD} fill="none" stroke="#dc2626" strokeWidth={2} />

            {/* 各 rank データポイント */}
            {points.map((p, i) => {
              if (!isNum(p.market_rank)) return null
              const cx = path.xs[i]
              const cy = yRankAxis(Math.max(1, Math.min(50, p.market_rank)))
              const color = volColor(p.vol_5d).bg
              return <circle key={p.date} cx={cx} cy={cy} r={2.5} fill={color} stroke="#dc2626" strokeWidth={0.8}>
                <title>{`${p.date}: rank ${p.market_rank}, cs_avg ${isNum(p.cs_avg) ? p.cs_avg.toFixed(1) : '--'}, vol_5d ${isNum(p.vol_5d) ? p.vol_5d.toFixed(2) : '--'}`}</title>
              </circle>
            })}

            {/* x 軸: 最初と最後の日付 */}
            <text x={PAD_L} y={H - 8} fontSize={10} fill="#9ca3af" fontFamily="monospace">
              {points[0].date}
            </text>
            <text x={W - PAD_R} y={H - 8} fontSize={10} fill="#9ca3af" textAnchor="end" fontFamily="monospace">
              {points[points.length - 1].date}
            </text>
          </svg>

          <div className="flex items-center justify-center gap-4 mt-2 text-[11px]">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 h-0.5" style={{ backgroundColor: '#dc2626' }} />
              <span style={{ color: 'var(--text-secondary)' }}>market_rank (1 = 最上位、軸反転)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 h-0.5" style={{ backgroundColor: '#93c5fd' }} />
              <span style={{ color: 'var(--text-secondary)' }}>cs_avg (0-100)</span>
            </span>
            <span className="text-gray-400">● ドット色 = vol_5d ステータス</span>
          </div>

          <p className="text-[11px] text-gray-400 mt-2 text-center">
            データ点 {points.length} 件 ({points[0].date} → {points[points.length - 1].date})
          </p>
        </>
      )}
    </div>
  )
}
