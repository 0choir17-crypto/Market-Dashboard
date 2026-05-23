'use client'

import { SectorData } from '@/types/sectors'

type RSPoint = { date: string; sector_name: string; rs_1d: number }

type Props = {
  rsHistory: RSPoint[]
  sectors: SectorData[]
}

// ── フェーズ色 ───────────────────────────────────────────────────────────────
function phaseColor(rs: number): string {
  if (rs >= 70) return '#22c55e'
  if (rs >= 40) return '#eab308'
  return '#ef4444'
}

function phaseBorder(rs: number): string {
  if (rs >= 70) return '#16a34a'
  if (rs >= 40) return '#ca8a04'
  return '#dc2626'
}

type SectorTimeSeries = {
  sectorName: string
  points: { date: string; rs: number }[]
  latestRS: number
  change5d: number | null
}

export default function SectorBarChart({ rsHistory, sectors }: Props) {
  // ── セクターごとに時系列データを構築 ──────────────────────────────────────
  const bySector = new Map<string, Map<string, number>>()

  for (const r of rsHistory) {
    if (r.rs_1d == null) continue
    if (!bySector.has(r.sector_name)) bySector.set(r.sector_name, new Map())
    bySector.get(r.sector_name)!.set(r.date, r.rs_1d)
  }

  // sectors props から最新日データを補完
  for (const s of sectors) {
    if (s.rs_1d == null) continue
    if (!bySector.has(s.sector_name)) bySector.set(s.sector_name, new Map())
    const map = bySector.get(s.sector_name)!
    if (!map.has(s.date)) {
      map.set(s.date, s.rs_1d)
    }
  }

  // 時系列に変換
  const seriesList: SectorTimeSeries[] = []

  for (const [sectorName, dateMap] of bySector) {
    const points = [...dateMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, rs]) => ({ date, rs }))

    if (points.length === 0) continue

    const latestRS = points[points.length - 1].rs
    let change5d: number | null = null
    if (points.length >= 6) {
      change5d = +(latestRS - points[points.length - 6].rs).toFixed(1)
    } else if (points.length >= 2) {
      change5d = +(latestRS - points[0].rs).toFixed(1)
    }

    seriesList.push({ sectorName, points, latestRS, change5d })
  }

  // 最新RS降順ソート
  seriesList.sort((a, b) => b.latestRS - a.latestRS)

  const CHART_H = 48

  return (
    <div>
      {/* グリッド */}
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}
      >
        {seriesList.map(({ sectorName, points, latestRS, change5d }) => {
          const borderColor = phaseBorder(latestRS)
          const rsColor = phaseColor(latestRS)
          const dayCount = points.length

          return (
            <div
              key={sectorName}
              className="bg-white rounded-lg border border-[#e8eaed] shadow-sm px-3 py-2.5 flex flex-col gap-1.5"
              style={{ borderTop: `3px solid ${borderColor}` }}
            >
              {/* ヘッダー: セクター名 + RS値 */}
              <div className="flex items-center justify-between">
                <span
                  className="text-xs font-medium truncate"
                  style={{ color: 'var(--text-primary)' }}
                  title={sectorName}
                >
                  {sectorName}
                </span>
                <span
                  className="text-sm font-bold font-mono tabular-nums ml-1 shrink-0"
                  style={{ color: rsColor }}
                >
                  {latestRS.toFixed(0)}
                </span>
              </div>

              {/* ミニ棒グラフ */}
              <div
                className="flex items-end gap-px"
                style={{ height: CHART_H }}
              >
                {points.map((p, i) => {
                  const h = (p.rs / 100) * CHART_H
                  const isRecent = i >= points.length - 5
                  return (
                    <div
                      key={p.date}
                      className="flex-1 rounded-t-sm"
                      style={{
                        height: Math.max(h, 1),
                        backgroundColor: phaseColor(p.rs),
                        opacity: isRecent ? 1 : 0.5,
                      }}
                      title={`${p.date}: ${p.rs.toFixed(0)}`}
                    />
                  )
                })}
              </div>

              {/* フッター: 期間 + 5日変化 */}
              <div className="flex items-center justify-between">
                <span
                  className="text-[10px] font-mono"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {dayCount}d
                </span>
                <span
                  className="text-[10px] font-mono font-semibold"
                  style={{
                    color:
                      change5d == null
                        ? 'var(--text-muted)'
                        : change5d > 0
                          ? '#16a34a'
                          : change5d < 0
                            ? '#dc2626'
                            : 'var(--text-muted)',
                  }}
                >
                  {change5d == null
                    ? '—'
                    : change5d > 0
                      ? `▲${change5d}pt`
                      : change5d < 0
                        ? `▼${Math.abs(change5d)}pt`
                        : '— 0pt'}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* フェーズ凡例 */}
      <div className="flex items-center justify-center gap-5 mt-3 text-[11px]">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#22c55e' }} />
          <span style={{ color: 'var(--text-secondary)' }}>Leader (≥70)</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#eab308' }} />
          <span style={{ color: 'var(--text-secondary)' }}>Neutral (40–70)</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#ef4444' }} />
          <span style={{ color: 'var(--text-secondary)' }}>Lagging (&lt;40)</span>
        </span>
      </div>
    </div>
  )
}
