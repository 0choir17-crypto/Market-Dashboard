'use client'

import type { ConsecutiveLeader } from '@/lib/marketLeadersFetch'
import { tradingViewUrl, shikihoUrl } from '@/lib/tickerLinks'
import { scaleCatColor } from '@/types/marketLeaders'

type Props = {
  rows: ConsecutiveLeader[]
  windowDays: number
  loading: boolean
  onSelectCode?: (code: string) => void
}

export default function ConsecutiveLeaders({ rows, windowDays, loading, onSelectCode }: Props) {
  const maxDays = rows[0]?.days_in_top10 ?? 1

  return (
    <div className="bg-white rounded-xl border border-[#e8eaed] shadow-sm overflow-x-auto">
      <div className="flex items-center justify-between px-4 pt-4 pb-3 flex-wrap gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-700">連続入賞ランキング — リーダーの持続性</p>
          <p className="text-xs text-gray-500 mt-0.5">
            過去 {windowDays} 日間で market_rank ≤ 10 に居た日数。中期リーダー候補の抽出。
          </p>
        </div>
        <span className="text-xs text-gray-400">{rows.length} 銘柄</span>
      </div>

      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="bg-gray-50 border-y border-[#e8eaed]">
            <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-center text-gray-500 w-10">#</th>
            <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-left text-gray-500 w-16">Code</th>
            <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-left text-gray-500">Name</th>
            <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-left text-gray-500">Sector</th>
            <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-center text-gray-500">Scale</th>
            <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-left text-gray-500 w-40">Top10 日数</th>
            <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-right text-gray-500 w-20">Best Rank</th>
            <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-right text-gray-500 w-24">Latest cs_avg</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const pct = (r.days_in_top10 / maxDays) * 100
            const sc = scaleCatColor(r.scalecat)
            return (
              <tr
                key={r.code}
                className={`border-b border-[#f0f2f4] cursor-pointer ${
                  i % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'
                } hover:bg-blue-50/40`}
                onClick={() => onSelectCode?.(r.code)}
              >
                <td className="px-3 py-1.5 text-center font-mono text-xs text-gray-500 tabular-nums">{i + 1}</td>
                <td className="px-3 py-1.5" onClick={e => e.stopPropagation()}>
                  <a
                    href={tradingViewUrl(r.code)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-[var(--accent)] hover:underline"
                  >
                    {r.code}
                  </a>
                </td>
                <td className="px-3 py-1.5 text-xs" onClick={e => e.stopPropagation()}>
                  <a
                    href={shikihoUrl(r.code)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-800 hover:text-[var(--accent)] hover:underline"
                  >
                    {r.coname ?? '--'}
                  </a>
                </td>
                <td className="px-3 py-1.5 text-xs text-gray-600">{r.s33nm ?? '--'}</td>
                <td className="px-3 py-1.5 text-center">
                  {r.scalecat && r.scalecat !== '-' ? (
                    <span
                      className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold"
                      style={{ backgroundColor: sc.bg, color: sc.text }}
                    >
                      {r.scalecat}
                    </span>
                  ) : (
                    <span className="text-[10px] text-gray-300">--</span>
                  )}
                </td>
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-gray-100 rounded overflow-hidden">
                      <div className="h-full bg-[var(--accent)] rounded" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="font-mono text-xs tabular-nums w-8 text-right text-gray-700 font-semibold">
                      {r.days_in_top10}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums text-gray-700">{r.best_rank}</td>
                <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums text-gray-700">
                  {r.latest_cs_avg != null && Number.isFinite(r.latest_cs_avg)
                    ? r.latest_cs_avg.toFixed(1)
                    : '--'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {!loading && rows.length === 0 && (
        <div className="py-10 text-center text-gray-400 text-sm">該当する銘柄なし</div>
      )}
      {loading && rows.length === 0 && (
        <div className="py-10 text-center text-gray-400 text-sm">Loading...</div>
      )}
    </div>
  )
}
