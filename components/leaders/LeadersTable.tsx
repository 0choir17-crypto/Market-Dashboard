'use client'

import { useMemo, useState } from 'react'
import {
  MarketLeader,
  volColor,
  csBarColor,
  emergingBarColor,
} from '@/types/marketLeaders'
import type { LeaderHits } from '@/lib/marketLeadersFetch'
import { tradingViewUrl, shikihoUrl } from '@/lib/tickerLinks'
import Tooltip from '@/components/shared/Tooltip'

type SortKey =
  | 'market_rank'
  | 'hits'
  | 'streak'
  | 'code'
  | 's33nm'
  | 'cs_avg'
  | 'emerging_cs'
  | 'vol_5d'
  | 'return_21d'
  | 'return_63d'
  | 'turnover_oku'
  | 'mcap_oku'
type SortDir = 'asc' | 'desc'

const EMPTY_HITS: LeaderHits = { hits: 0, streak: 0, lastBeforeStreak: null }

function isNum(v: number | null | undefined): v is number {
  return v !== null && v !== undefined && Number.isFinite(v)
}

function fmt(v: number | null | undefined, decimals = 1): string {
  return isNum(v) ? v.toFixed(decimals) : '--'
}

// 'YYYY-MM-DD' → 'M/D'
function shortDate(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`
}

function CsAvgCell({ value }: { value: number | null | undefined }) {
  const safe = isNum(value) ? Math.max(0, Math.min(100, value)) : 0
  const color = csBarColor(value)
  return (
    <div className="flex items-center gap-2 min-w-[110px]">
      <span
        className="font-mono text-xs tabular-nums w-9 text-right font-semibold"
        style={{ color: isNum(value) ? '#1f2937' : '#9ca3af' }}
      >
        {isNum(value) ? value.toFixed(1) : '--'}
      </span>
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${safe}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

// 符号付き整形（mom 用）: +緑 / −赤、null は '—'
function fmtSigned(v: number | null | undefined, decimals = 1): string {
  if (!isNum(v)) return '—'
  return `${v > 0 ? '+' : ''}${v.toFixed(decimals)}`
}

// 初動 (emerging_cs): cs_avg と同形式（数値+バー）。加速度で色分け。
// null（本更新前の過去日）は '—' / バー無し。mom_21d/5d は hover で補助表示。
function EmergingCell({
  value,
  mom21,
  mom5,
}: {
  value: number | null | undefined
  mom21: number | null | undefined
  mom5: number | null | undefined
}) {
  const safe = isNum(value) ? Math.max(0, Math.min(100, value)) : 0
  const color = emergingBarColor(value)
  const title = `RS加速度  21d: ${fmtSigned(mom21)}  /  5d: ${fmtSigned(mom5)}`
  return (
    <div className="flex items-center gap-2 min-w-[110px]" title={isNum(value) ? title : undefined}>
      <span
        className="font-mono text-xs tabular-nums w-9 text-right font-semibold"
        style={{ color: isNum(value) ? '#1f2937' : '#9ca3af' }}
      >
        {isNum(value) ? value.toFixed(0) : '—'}
      </span>
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        {isNum(value) && (
          <div className="h-full rounded-full" style={{ width: `${safe}%`, backgroundColor: color }} />
        )}
      </div>
    </div>
  )
}

function VolCell({ value }: { value: number | null | undefined }) {
  const { bg, text, label } = volColor(value)
  return (
    <span
      title={`${label} (${isNum(value) ? value.toFixed(2) : '--'})`}
      className="inline-block min-w-[48px] text-center px-1.5 py-0.5 rounded text-xs font-mono font-semibold tabular-nums"
      style={{ backgroundColor: bg, color: text }}
    >
      {isNum(value) ? value.toFixed(2) : '--'}
    </span>
  )
}

function ReturnCell({ value }: { value: number | null | undefined }) {
  if (!isNum(value)) return <span className="text-gray-400 text-xs">--</span>
  const color = value > 0 ? '#16a34a' : value < 0 ? '#dc2626' : '#6b7280'
  const sign = value > 0 ? '+' : ''
  return (
    <span className="font-mono text-xs tabular-nums" style={{ color }}>
      {sign}{value.toFixed(1)}%
    </span>
  )
}

function PassRouteBadge({ route }: { route: string | null | undefined }) {
  if (route === 'ipo') {
    return (
      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">
        IPO
      </span>
    )
  }
  return null
}

// ヒット数バッジ: Top50 入りした通算営業日数 (実数, キャップ無し)
// 色 (しきい値は据え置き): 30+ 水色 / 20+ 濃緑 / 10+ 緑 / 5+ 黄 / それ未満 灰
function HitsCell({ hits }: { hits: number }) {
  if (hits <= 0) return <span className="text-gray-400 text-xs">--</span>
  const bg =
    hits >= 30 ? '#0ea5e9' : hits >= 20 ? '#16a34a' : hits >= 10 ? '#22c55e' : hits >= 5 ? '#eab308' : '#9ca3af'
  return (
    <span
      className="inline-block min-w-[36px] text-center px-1.5 py-0.5 rounded text-xs font-mono font-semibold tabular-nums text-white"
      title={hits >= 30 ? '通算 30 日以上 Top50 入り' : undefined}
      style={{ backgroundColor: bg }}
    >
      {hits}
    </span>
  )
}

// 連続/直近セル:
// - streak >= 2  → "N日連続" (緑系で持続性をハイライト)
// - streak == 1 && lastBeforeStreak → "前回 M/D" (一度切れた後の復帰)
// - streak == 1 && !lastBeforeStreak → "NEW" (ウィンドウ内で初登場 = 急浮上)
// - その他 → '--'
function StreakCell({ hits }: { hits: LeaderHits }) {
  if (hits.streak >= 2) {
    return (
      <span
        className="inline-block px-1.5 py-0.5 rounded text-xs font-mono font-semibold tabular-nums bg-emerald-100 text-emerald-800"
        title={`${hits.streak} 営業日連続で Top50 入り`}
      >
        {hits.streak}日連続
      </span>
    )
  }
  if (hits.streak === 1) {
    if (hits.lastBeforeStreak) {
      return (
        <span
          className="inline-block px-1.5 py-0.5 rounded text-xs font-mono tabular-nums bg-gray-100 text-gray-700"
          title={`前回 Top50 入り: ${hits.lastBeforeStreak}`}
        >
          前回 {shortDate(hits.lastBeforeStreak)}
        </span>
      )
    }
    return (
      <span
        className="inline-block px-1.5 py-0.5 rounded text-xs font-mono font-semibold bg-rose-100 text-rose-700"
        title="全履歴で初の Top50 入り — 急浮上候補"
      >
        NEW
      </span>
    )
  }
  return <span className="text-gray-400 text-xs">--</span>
}

function SortTh({
  label,
  tooltip,
  sortKey,
  currentKey,
  currentDir,
  onSort,
  align = 'right',
  className = '',
}: {
  label: string
  tooltip?: string
  sortKey: SortKey
  currentKey: SortKey
  currentDir: SortDir
  onSort: (k: SortKey) => void
  align?: 'left' | 'right' | 'center'
  className?: string
}) {
  const active = currentKey === sortKey
  const indicator = active ? (currentDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'
  const alignClass = align === 'left' ? 'text-left' : align === 'center' ? 'text-center' : 'text-right'
  const inner = tooltip ? <Tooltip content={tooltip}>{label}</Tooltip> : <>{label}</>
  return (
    <th
      onClick={() => onSort(sortKey)}
      className={`px-2 py-2 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 transition-colors ${alignClass} ${
        active ? 'text-[var(--accent)]' : 'text-gray-500'
      } ${className}`}
    >
      {inner}
      <span className="text-[10px] opacity-50">{indicator}</span>
    </th>
  )
}

type Props = {
  rows: MarketLeader[]
  hitsMap: Map<string, LeaderHits>
  query: string
}

export default function LeadersTable({ rows, hitsMap, query }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('market_rank')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'market_rank' || key === 'code' || key === 's33nm' ? 'asc' : 'desc')
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      r =>
        r.code.toLowerCase().includes(q) ||
        (r.coname ?? '').toLowerCase().includes(q),
    )
  }, [rows, query])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      if (sortKey === 'code') {
        const cmp = a.code.localeCompare(b.code)
        return sortDir === 'asc' ? cmp : -cmp
      }
      if (sortKey === 's33nm') {
        const cmp = (a.s33nm ?? '').localeCompare(b.s33nm ?? '', 'ja')
        return sortDir === 'asc' ? cmp : -cmp
      }
      let aRaw: number | null | undefined
      let bRaw: number | null | undefined
      if (sortKey === 'hits') {
        aRaw = hitsMap.get(a.code)?.hits ?? 0
        bRaw = hitsMap.get(b.code)?.hits ?? 0
      } else if (sortKey === 'streak') {
        aRaw = hitsMap.get(a.code)?.streak ?? 0
        bRaw = hitsMap.get(b.code)?.streak ?? 0
      } else {
        aRaw = a[sortKey]
        bRaw = b[sortKey]
      }
      const av = isNum(aRaw) ? aRaw : sortDir === 'asc' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY
      const bv = isNum(bRaw) ? bRaw : sortDir === 'asc' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY
      if (av === bv) return 0
      return sortDir === 'asc' ? (av > bv ? 1 : -1) : av < bv ? 1 : -1
    })
    return arr
  }, [filtered, sortKey, sortDir, hitsMap])

  const sp = { currentKey: sortKey, currentDir: sortDir, onSort: handleSort }

  return (
    <div className="bg-white rounded-xl border border-[#e8eaed] shadow-sm overflow-x-auto">
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 flex-wrap">
        <p className="text-sm font-semibold text-gray-500">市場リーダー Top 50</p>
        <span className="text-[11px] text-gray-400">
          cs_avg=確立（資金が向かう度）／ 初動=加速（今RSが伸びてるか）。観測テーブルで売買シグナルではない
        </span>
        <span className="ml-auto text-xs text-gray-400">{sorted.length} 銘柄</span>
      </div>

      <table className="w-full min-w-[1360px] text-sm">
        <thead>
          <tr className="bg-gray-50 border-y border-[#e8eaed]">
            <SortTh label="#" tooltip="market_rank — 当日の市場ランク (1=トップ)" sortKey="market_rank" {...sp} align="center" className="w-10" />
            <SortTh label="ヒット数" tooltip="Top50 に入った通算営業日数 (実数, 表示日まで)" sortKey="hits" {...sp} align="center" className="w-20" />
            <SortTh label="連続/直近" tooltip="現在の連続 Top50 日数 (実数, 全履歴)。連続=1 の銘柄は直近の前回ヒット日 (前回 M/D)、全履歴で初登場は NEW。" sortKey="streak" {...sp} align="center" className="w-24" />
            <SortTh label="Code" tooltip="銘柄コード (TradingView へリンク)" sortKey="code" {...sp} align="left" className="w-16" />
            <th className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap text-left text-gray-500">Name</th>
            <SortTh label="Sector (S33)" tooltip="S33 業種名 (五十音順ソート)" sortKey="s33nm" {...sp} align="left" />
            <th className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap text-right text-gray-500 w-20">Close</th>
            <SortTh label="cs_avg" tooltip="クロスセクション RS 平均 0-100 (主軸スコア=確立度)。99.5=Stage A 上位 0.5%。「どれだけ資金が向かっているか」。rs_topix_avg とは別物。" sortKey="cs_avg" {...sp} align="left" className="w-32" />
            <SortTh label="初動" tooltip="emerging_cs 0-100 (初動スコア=加速度)。高い=今RSが加速中（初動）/ 低い=成熟・失速。cs_avg の鏡像。hover で RS加速度 (21d/5d)。過去日は — (本更新前)。" sortKey="emerging_cs" {...sp} align="left" className="w-32" />
            <SortTh label="vol_5d" tooltip="直近 5 営業日の出来高比。≥1.5 機関買い継続 / <0.7 出来高枯渇" sortKey="vol_5d" {...sp} align="center" className="w-20" />
            <SortTh label="21d %" tooltip="return_21d — 21 営業日リターン" sortKey="return_21d" {...sp} align="right" className="w-20" />
            <SortTh label="63d %" tooltip="return_63d — 63 営業日リターン" sortKey="return_63d" {...sp} align="right" className="w-20" />
            <SortTh label="売買代金" tooltip="turnover_oku — 売買代金 20日平均 (億円)" sortKey="turnover_oku" {...sp} align="right" className="w-20" />
            <SortTh label="時価総額" tooltip="mcap_oku — 時価総額 (億円)" sortKey="mcap_oku" {...sp} align="right" className="w-20" />
            <th className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap text-center text-gray-500">Route</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => {
            const hits = hitsMap.get(r.code) ?? EMPTY_HITS
            return (
              <tr
                key={r.code}
                className={`border-b border-[#f0f2f4] transition-colors ${
                  i % 2 === 0 ? 'bg-white' : 'bg-[#fafafa]'
                } hover:bg-blue-50/40`}
              >
                <td className="px-2 py-1.5 text-center font-mono text-xs text-gray-700 tabular-nums font-semibold">
                  {r.market_rank ?? '--'}
                </td>
                <td className="px-2 py-1.5 text-center">
                  <HitsCell hits={hits.hits} />
                </td>
                <td className="px-2 py-1.5 text-center">
                  <StreakCell hits={hits} />
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap">
                  <a
                    href={tradingViewUrl(r.code)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-[var(--accent)] hover:underline"
                  >
                    {r.code}
                  </a>
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap text-xs">
                  <a
                    href={shikihoUrl(r.code)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-800 hover:text-[var(--accent)] hover:underline"
                  >
                    {r.coname ?? '--'}
                  </a>
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap text-xs text-gray-600">
                  {r.s33nm ?? '--'}
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-xs text-gray-700 tabular-nums">
                  {isNum(r.close) ? r.close.toLocaleString('ja-JP', { maximumFractionDigits: 1 }) : '--'}
                </td>
                <td className="px-2 py-1.5">
                  <CsAvgCell value={r.cs_avg} />
                </td>
                <td className="px-2 py-1.5">
                  <EmergingCell value={r.emerging_cs} mom21={r.rs_topix_mom_21d} mom5={r.rs_topix_mom_5d} />
                </td>
                <td className="px-2 py-1.5 text-center">
                  <VolCell value={r.vol_5d} />
                </td>
                <td className="px-2 py-1.5 text-right">
                  <ReturnCell value={r.return_21d} />
                </td>
                <td className="px-2 py-1.5 text-right">
                  <ReturnCell value={r.return_63d} />
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-xs text-gray-600 tabular-nums">
                  {fmt(r.turnover_oku, 0)}
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-xs text-gray-600 tabular-nums">
                  {fmt(r.mcap_oku, 0)}
                </td>
                <td className="px-2 py-1.5 text-center">
                  <PassRouteBadge route={r.pass_route} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {sorted.length === 0 && (
        <div className="py-10 text-center text-gray-400 text-sm">
          {query ? `"${query}" にマッチする銘柄なし` : 'データなし'}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 py-3 text-[11px] border-t border-[#f0f2f4] flex-wrap">
        <span className="text-gray-500">初動 (emerging):</span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded" style={{ backgroundColor: '#16a34a' }} />
          <span style={{ color: 'var(--text-secondary)' }}>≥80 加速中</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded" style={{ backgroundColor: '#eab308' }} />
          <span style={{ color: 'var(--text-secondary)' }}>55–80 中間</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded" style={{ backgroundColor: '#9ca3af' }} />
          <span style={{ color: 'var(--text-secondary)' }}>&lt;55 成熟・失速</span>
        </span>
        <span className="text-gray-300">|</span>
        <span className="text-gray-500">vol_5d:</span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded" style={{ backgroundColor: '#bbf7d0' }} />
          <span style={{ color: 'var(--text-secondary)' }}>≥1.5 機関買い継続</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded" style={{ backgroundColor: '#dcfce7' }} />
          <span style={{ color: 'var(--text-secondary)' }}>1.0–1.5 通常</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded" style={{ backgroundColor: '#fef3c7' }} />
          <span style={{ color: 'var(--text-secondary)' }}>0.7–1.0 警戒</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded" style={{ backgroundColor: '#fee2e2' }} />
          <span style={{ color: 'var(--text-secondary)' }}>&lt;0.7 出来高枯渇</span>
        </span>
        <span className="text-gray-300">|</span>
        <span className="text-gray-500">ヒット数 (通算 Top50入り日数):</span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded" style={{ backgroundColor: '#0ea5e9' }} />
          <span style={{ color: 'var(--text-secondary)' }}>30+</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded" style={{ backgroundColor: '#16a34a' }} />
          <span style={{ color: 'var(--text-secondary)' }}>20+</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded" style={{ backgroundColor: '#22c55e' }} />
          <span style={{ color: 'var(--text-secondary)' }}>10+</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded" style={{ backgroundColor: '#eab308' }} />
          <span style={{ color: 'var(--text-secondary)' }}>5+</span>
        </span>
      </div>
    </div>
  )
}
