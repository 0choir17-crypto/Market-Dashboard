'use client'

import { useState, useEffect } from 'react'
import { DailySignal } from '@/types/signals'
import { SCREEN_NAME_MAP, getRecommendedScreens, isRecommended } from '@/lib/screenNames'
import Tooltip from '@/components/shared/Tooltip'
import WatchlistModal from '@/components/watchlist/WatchlistModal'
import PositionModal from '@/components/portfolio/PositionModal'
import { WatchlistItem } from '@/types/portfolio'
import { supabase } from '@/lib/supabase'
import { tradingViewUrl, shikihoUrl } from '@/lib/tickerLinks'

// ── Column tooltips ───────────────────────────────────────────────────────────
const COLUMN_TOOLTIPS: Record<string, string> = {
  price_chg_1d: '昨日比変化率（%）',
  price_chg_5d: '直近5日間の変化率（%）',
  rs_composite: '相対強度スコア（複合指標）',
  rvol:         '相対出来高: 当日出来高 ÷ 20日平均出来高',
  adr_pct:      '平均日次値幅（%）: 直近20日の高低差の平均',
  dist_ema21_r: '21日EMAからの乖離率（ATR倍率）',
  dist_10wma_r: '10週WMAからの乖離率（ATR倍率）',
  dist_50sma_r: '50日SMAからの乖離率（ATR倍率）',
  high_52w_pct: '52週高値からの下落率（%）— 0に近いほど高値圏',
  stop_pct:     '推定ストップロス幅（%）— ATRベース',
  hit_count:    'ヒットしたスクリーン数（バッジにホバーで詳細表示）',
}

// ── Types ────────────────────────────────────────────────────────────────────
type SortKey = keyof DailySignal
type SortDir = 'asc' | 'desc'

type EntryTarget = {
  ticker: string
  company_name?: string
  screen_name?: string
  // シグナルスナップショット
  sector_s33?: string
  signal_price?: number
  rs_at_entry?: number
  rvol_at_entry?: number
  adr_at_entry?: number
  dist_ema21_at_entry?: number
  stop_pct_at_entry?: number
  mc_met_at_entry?: boolean
  mc_condition_at_entry?: string
}

type Props = {
  signals: DailySignal[]
  marketRegime?: string | null
  scorecardRegime?: string | null
}

// ── Helper cells ─────────────────────────────────────────────────────────────
function fmt(val: number | null | undefined, decimals = 2): string {
  if (val === null || val === undefined) return '—'
  return val.toFixed(decimals)
}

function ChangePill({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return <span className="text-gray-400">—</span>
  const pos = value >= 0
  return (
    <span
      className="font-mono text-xs font-semibold"
      style={{ color: pos ? 'var(--positive)' : 'var(--negative)' }}
    >
      {pos ? '+' : ''}{value.toFixed(2)}%
    </span>
  )
}

function RvolCell({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return <span className="text-gray-400">—</span>
  const high = value >= 2.0
  return (
    <span
      className={`font-mono text-xs ${high ? 'font-bold' : ''}`}
      style={{ color: high ? 'var(--positive)' : 'inherit' }}
    >
      {value.toFixed(2)}
    </span>
  )
}

function HitTooltip({
  value,
  screenName,
  recommended,
}: {
  value: number | null | undefined
  screenName: string
  recommended: string[]
}) {
  const count = value ?? 0
  const isOverlap = count >= 2
  const isHigh = count >= 3
  return (
    <div className="relative group inline-flex items-center gap-1">
      {/* バッジ */}
      <span
        className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold cursor-default ${
          isHigh
            ? 'bg-amber-100 text-amber-700 border border-amber-400'
            : isOverlap
            ? 'bg-amber-50 text-amber-600 border border-amber-300'
            : 'bg-gray-100 text-gray-600'
        }`}
      >
        {value ?? '—'}
      </span>
      {/* ツールチップ */}
      <div className="absolute z-10 right-0 bottom-full mb-2 hidden group-hover:block bg-gray-900 text-white text-xs rounded-lg py-2 px-3 whitespace-nowrap shadow-lg">
        <p className="font-semibold mb-1">Hit Screens</p>
        {screenName.split('|').map(name => {
          const short = SCREEN_NAME_MAP[name.trim()] ?? name.trim()
          const isRec = recommended.includes(short)
          return (
            <p key={name} className={isRec ? 'text-amber-400' : 'text-gray-300'}>
              {isRec ? '★ ' : '\u3000'}{short}
            </p>
          )
        })}
        {/* 矢印 */}
        <div className="absolute right-3 top-full border-4 border-transparent border-t-gray-900" />
      </div>
    </div>
  )
}

// ── Sortable header ──────────────────────────────────────────────────────────
function SortTh({
  label,
  tooltip,
  sortKey: key,
  currentKey,
  currentDir,
  onSort,
  align = 'right',
}: {
  label: string
  tooltip?: string
  sortKey: SortKey
  currentKey: SortKey
  currentDir: SortDir
  onSort: (k: SortKey) => void
  align?: 'left' | 'right'
}) {
  const active = currentKey === key
  const indicator = active ? (currentDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'
  const labelEl = tooltip ? <Tooltip content={tooltip}>{label}</Tooltip> : <>{label}</>
  return (
    <th
      onClick={() => onSort(key)}
      className={`px-3 py-2.5 text-xs font-semibold uppercase tracking-wide whitespace-nowrap cursor-pointer select-none hover:bg-gray-100 transition-colors ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${active ? 'text-[var(--accent)]' : 'text-gray-500'}`}
    >
      {labelEl}<span className="text-[10px] opacity-50">{indicator}</span>
    </th>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function SignalsTable({ signals, marketRegime, scorecardRegime }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('hit_count')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [watchTarget, setWatchTarget] = useState<Partial<WatchlistItem> | null>(null)
  const [entryTarget, setEntryTarget] = useState<EntryTarget | null>(null)
  const [openTickers, setOpenTickers] = useState<Set<string>>(new Set())

  // OPENポジションの銘柄を取得
  useEffect(() => {
    async function fetchOpen() {
      const { data } = await supabase
        .from('trades')
        .select('ticker')
        .eq('status', 'open')
      if (data) {
        setOpenTickers(new Set(data.map(d => d.ticker)))
      }
    }
    fetchOpen()
  }, [entryTarget]) // entryTarget変更時（保存後）にリフレッシュ

  const recommended = getRecommendedScreens(marketRegime, scorecardRegime)

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const sorted = [...signals].sort((a, b) => {
    // 文字列ソート（セクター）
    if (sortKey === 'sector_s33') {
      const av = a.sector_s33 ?? ''
      const bv = b.sector_s33 ?? ''
      return sortDir === 'asc'
        ? av.localeCompare(bv, 'ja')
        : bv.localeCompare(av, 'ja')
    }
    // 数値ソート
    const av = (a[sortKey] as number | null | undefined) ?? null
    const bv = (b[sortKey] as number | null | undefined) ?? null
    // null は昇順・降順に関わらず常に末尾
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    if (av === bv) return 0
    return sortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
  })

  if (sorted.length === 0) {
    return (
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-8 text-center text-gray-400">
        <p className="text-sm">シグナルが見つかりません</p>
      </div>
    )
  }

  const sp = { currentKey: sortKey, currentDir: sortDir, onSort: handleSort }

  return (
    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[var(--bg-card-hover)] border-b border-[var(--border)]">
            <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">Name</th>
            <SortTh label="Sector"    sortKey="sector_s33"   {...sp} align="left" />
            <SortTh label="RS"        sortKey="rs_composite" tooltip={COLUMN_TOOLTIPS.rs_composite} {...sp} />
            <SortTh label="1D%"       sortKey="price_chg_1d" tooltip={COLUMN_TOOLTIPS.price_chg_1d} {...sp} />
            <SortTh label="5D%"       sortKey="price_chg_5d" tooltip={COLUMN_TOOLTIPS.price_chg_5d} {...sp} />
            <SortTh label="RVOL"      sortKey="rvol"         tooltip={COLUMN_TOOLTIPS.rvol}         {...sp} />
            <SortTh label="ADR%"      sortKey="adr_pct"      tooltip={COLUMN_TOOLTIPS.adr_pct}      {...sp} />
            <SortTh label="EMA21(R)"  sortKey="dist_ema21_r" tooltip={COLUMN_TOOLTIPS.dist_ema21_r} {...sp} />
            <SortTh label="10WMA(R)"  sortKey="dist_10wma_r" tooltip={COLUMN_TOOLTIPS.dist_10wma_r} {...sp} />
            <SortTh label="50SMA(R)"  sortKey="dist_50sma_r" tooltip={COLUMN_TOOLTIPS.dist_50sma_r} {...sp} />
            <SortTh label="52W高値%"  sortKey="high_52w_pct" tooltip={COLUMN_TOOLTIPS.high_52w_pct} {...sp} />
            <SortTh label="Stop%"     sortKey="stop_pct"     tooltip={COLUMN_TOOLTIPS.stop_pct}     {...sp} />
            <SortTh label="HIT"       sortKey="hit_count"    tooltip={COLUMN_TOOLTIPS.hit_count}    {...sp} />
            <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">WL</th>
            <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">Entry</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((sig, i) => {
            const rec = isRecommended(sig.screen_name, recommended)
            const mcNotMet = sig.mc_met === false
            return (
              <tr
                key={`${sig.code}-${sig.screen_name}-${i}`}
                className={`border-b border-[var(--border-subtle)] hover:bg-[var(--bg-card-hover)] transition-colors ${
                  rec ? 'border-l-2 border-l-amber-400' : ''
                } ${i % 2 === 0 ? 'bg-[var(--bg-card)]' : 'bg-[var(--bg-card-hover)]'} ${
                  mcNotMet ? 'opacity-50' : ''
                }`}
              >
                {/* 銘柄 + Watch button */}
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <a
                    href={tradingViewUrl(sig.code)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono font-bold text-blue-600 hover:underline text-sm leading-tight block"
                  >
                    {sig.code}
                  </a>
                  <a
                    href={shikihoUrl(sig.code)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-xs text-gray-400 hover:underline mt-0.5 max-w-[130px] truncate"
                  >
                    {sig.company_name ?? '—'}
                  </a>
                </td>
                {/* セクター */}
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <span className="text-xs text-gray-500 block max-w-[120px] truncate">{sig.sector_s33 ?? '—'}</span>
                </td>
                {/* RS */}
                <td className="px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap">{fmt(sig.rs_composite, 1)}</td>
                {/* 1D% */}
                <td className="px-3 py-2.5 text-right whitespace-nowrap"><ChangePill value={sig.price_chg_1d} /></td>
                {/* 5D% */}
                <td className="px-3 py-2.5 text-right whitespace-nowrap"><ChangePill value={sig.price_chg_5d} /></td>
                {/* RVOL */}
                <td className="px-3 py-2.5 text-right whitespace-nowrap"><RvolCell value={sig.rvol} /></td>
                {/* ADR% */}
                <td className="px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap">{fmt(sig.adr_pct)}</td>
                {/* EMA21(R) */}
                <td className="px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap">{fmt(sig.dist_ema21_r)}</td>
                {/* 10WMA(R) */}
                <td className="px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap">{fmt(sig.dist_10wma_r)}</td>
                {/* 50SMA(R) */}
                <td className="px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap">{fmt(sig.dist_50sma_r)}</td>
                {/* 52W高値% */}
                <td className="px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap">{fmt(sig.high_52w_pct)}</td>
                {/* Stop% */}
                <td className="px-3 py-2.5 text-right font-mono text-xs whitespace-nowrap">{fmt(sig.stop_pct)}</td>
                {/* HIT — 丸バッジのみ。詳細はホバーツールチップで */}
                <td className="px-3 py-3 text-right">
                  <div className="flex items-center justify-end">
                    <HitTooltip
                      value={sig.hit_count}
                      screenName={sig.screen_name}
                      recommended={recommended}
                    />
                  </div>
                </td>
                {/* WL (Watch) */}
                <td className="px-3 py-2.5 text-center whitespace-nowrap">
                  <button
                    onClick={() => setWatchTarget({
                      ticker: sig.code,
                      company_name: sig.company_name ?? undefined,
                      screen_tag: sig.screen_name ?? undefined,
                      // シグナルスナップショット
                      rs_composite: sig.rs_composite ?? undefined,
                      rvol: sig.rvol ?? undefined,
                      adr_pct: sig.adr_pct ?? undefined,
                      dist_ema21_r: sig.dist_ema21_r ?? undefined,
                      stop_pct: sig.stop_pct ?? undefined,
                      mc_met: sig.mc_met ?? undefined,
                      mc_condition: sig.mc_condition ?? undefined,
                      sector_s33: sig.sector_s33 ?? undefined,
                      signal_price: sig.close ?? undefined,
                    } as Partial<WatchlistItem>)}
                    className="text-[10px] font-medium text-indigo-500 hover:text-indigo-700 hover:underline leading-none"
                  >
                    + Watch
                  </button>
                </td>
                {/* Entry */}
                <td className="px-3 py-2.5 text-center whitespace-nowrap">
                  {openTickers.has(sig.code) ? (
                    <span className="text-[10px] font-medium text-gray-400">Holding</span>
                  ) : (
                    <button
                      onClick={() => setEntryTarget({
                        ticker: sig.code,
                        company_name: sig.company_name ?? undefined,
                        screen_name: sig.screen_name ?? undefined,
                        sector_s33: sig.sector_s33 ?? undefined,
                        signal_price: sig.close ?? undefined,
                        rs_at_entry: sig.rs_composite ?? undefined,
                        rvol_at_entry: sig.rvol ?? undefined,
                        adr_at_entry: sig.adr_pct ?? undefined,
                        dist_ema21_at_entry: sig.dist_ema21_r ?? undefined,
                        stop_pct_at_entry: sig.stop_pct ?? undefined,
                        mc_met_at_entry: sig.mc_met ?? undefined,
                        mc_condition_at_entry: sig.mc_condition ?? undefined,
                      })}
                      className="text-[10px] font-medium text-emerald-600 hover:text-emerald-800 hover:underline leading-none"
                    >
                      Entry
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* WatchlistModal: fixed-position overlay, safe to mount inside any container */}
      <WatchlistModal
        open={watchTarget !== null}
        onClose={() => setWatchTarget(null)}
        onSaved={() => setWatchTarget(null)}
        initial={watchTarget ?? undefined}
      />

      {/* PositionModal: Entry button からの新規トレード */}
      <PositionModal
        open={entryTarget !== null}
        onClose={() => setEntryTarget(null)}
        onSaved={() => setEntryTarget(null)}
        initial={entryTarget ?? undefined}
      />
    </div>
  )
}
