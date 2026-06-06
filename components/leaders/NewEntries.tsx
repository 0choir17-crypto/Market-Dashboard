'use client'

import { useMemo } from 'react'
import type { MarketLeader } from '@/types/marketLeaders'
import { tradingViewUrl, shikihoUrl } from '@/lib/tickerLinks'
import { csBarColor } from '@/types/marketLeaders'

type Props = {
  todayRows: MarketLeader[]
  prevCodes: Set<string>      // 前営業日に top50 に居た銘柄コード
  prevDate: string | null
  onSelectCode?: (code: string) => void
}

function isNum(v: number | null | undefined): v is number {
  return v !== null && v !== undefined && Number.isFinite(v)
}

export default function NewEntries({ todayRows, prevCodes, prevDate, onSelectCode }: Props) {
  const newcomers = useMemo(
    () => todayRows.filter(r => !prevCodes.has(r.code)).sort((a, b) => (a.market_rank ?? 999) - (b.market_rank ?? 999)),
    [todayRows, prevCodes],
  )

  return (
    <div className="bg-white rounded-xl border border-[#e8eaed] shadow-sm overflow-x-auto">
      <div className="flex items-center justify-between px-4 pt-4 pb-3 flex-wrap gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-700">新顔リスト — 急浮上候補</p>
          <p className="text-xs text-gray-500 mt-0.5">
            前営業日 {prevDate ? `(${prevDate})` : ''} に Top50 に居なかったが、本日 Top50 入りした銘柄。
          </p>
        </div>
        <span className="text-xs text-gray-400">{newcomers.length} 銘柄</span>
      </div>

      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="bg-gray-50 border-y border-[#e8eaed]">
            <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-center text-gray-500 w-10">Rank</th>
            <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-left text-gray-500 w-16">Code</th>
            <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-left text-gray-500">Name</th>
            <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-left text-gray-500">Sector</th>
            <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-right text-gray-500 w-24">cs_avg</th>
            <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-right text-gray-500 w-20">21d %</th>
            <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-center text-gray-500 w-16">Route</th>
          </tr>
        </thead>
        <tbody>
          {newcomers.map((r, i) => {
            const csColor = csBarColor(r.cs_avg)
            return (
              <tr
                key={r.code}
                className={`border-b border-[#f0f2f4] cursor-pointer ${
                  i % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'
                } hover:bg-blue-50/40`}
                onClick={() => onSelectCode?.(r.code)}
              >
                <td className="px-3 py-1.5 text-center font-mono text-xs font-semibold tabular-nums text-gray-700">
                  {r.market_rank ?? '--'}
                </td>
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
                <td className="px-3 py-1.5 text-right">
                  <div className="inline-flex items-center gap-2">
                    <span className="font-mono text-xs tabular-nums font-semibold text-gray-700">
                      {isNum(r.cs_avg) ? r.cs_avg.toFixed(1) : '--'}
                    </span>
                    <div className="w-10 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, Math.max(0, r.cs_avg ?? 0))}%`,
                          backgroundColor: csColor,
                        }}
                      />
                    </div>
                  </div>
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums" style={{
                  color: isNum(r.return_21d) ? (r.return_21d > 0 ? '#16a34a' : '#dc2626') : '#9ca3af',
                }}>
                  {isNum(r.return_21d) ? `${r.return_21d > 0 ? '+' : ''}${r.return_21d.toFixed(1)}%` : '--'}
                </td>
                <td className="px-3 py-1.5 text-center">
                  {r.pass_route === 'ipo' && (
                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">
                      IPO
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {newcomers.length === 0 && (
        <div className="py-10 text-center text-gray-400 text-sm">
          {prevDate
            ? '新顔なし — 全銘柄が連続入賞 (高い安定性)'
            : '前営業日のデータがないため判定不可'}
        </div>
      )}
    </div>
  )
}
