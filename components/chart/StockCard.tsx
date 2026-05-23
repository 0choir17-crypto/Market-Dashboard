'use client'

import { useMemo } from 'react'
import type { OhlcvBar, StructurePivotPhase } from '@/types/chart'
import { ema, sma } from '@/lib/indicators'
import { tradingViewUrl, shikihoUrl } from '@/lib/tickerLinks'
import MiniChart from './MiniChart'

export interface CardOverrides {
  /** Cockpit RS (0–100). When provided, used as-is — otherwise omitted from the card. */
  rs?: number | null
  /** ADR % (preferred over computed when available). */
  adrPct?: number | null
  /** Pivot % (= pct_from_20d_high). */
  pivotPct?: number | null
  /** Distance from SMA50 in %. */
  distSma50?: number | null
}

interface Props {
  code: string
  name?: string | null
  sector?: string | null
  bars: OhlcvBar[]
  structurePivotPhases?: StructurePivotPhase[]
  overrides?: CardOverrides
  selected?: boolean
  onSelect?: (code: string) => void
  /** When provided, renders a "+ Watch" button in the card header. */
  onWatch?: (code: string) => void
}

const TRADINGVIEW_URL = tradingViewUrl
const SHIKIHO_URL = shikihoUrl

function fmtSignedPct(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`
}

function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return `${v.toFixed(digits)}%`
}

function fmtNum(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return v.toFixed(digits)
}

function metricColor(label: string, v: number | null | undefined): string | undefined {
  if (v == null || !Number.isFinite(v)) return undefined
  switch (label) {
    case 'ADR':
      return v >= 3.5 && v <= 8 ? 'var(--positive)' : 'var(--negative)'
    case 'RS':
      return v >= 80 ? 'var(--positive)' : v >= 60 ? 'var(--accent)' : 'var(--text-secondary)'
    case 'Pivot':
      return v >= -2 && v <= 2 ? 'var(--neutral-color)' : v < -2 ? 'var(--text-muted)' : 'var(--positive)'
    case '21EMA%':
      return v < 0 ? 'var(--negative)' : v <= 5 ? 'var(--positive)' : v <= 8 ? '#a16207' : 'var(--negative)'
    case '50sma%':
      return v < 0 ? 'var(--negative)' : 'var(--positive)'
    case '3WT':
      return v <= 1.5 ? 'var(--positive)' : 'var(--text-secondary)'
    default:
      return undefined
  }
}

/**
 * Compact metrics derived from OHLCV bars (subset of full Cockpit).
 * VCP page can pass `overrides` to short-circuit some of these with the
 * pre-computed values from `daily_vcp_screen`.
 */
function deriveCompactMetrics(bars: OhlcvBar[], overrides?: CardOverrides) {
  if (bars.length === 0) {
    return {
      adrPct: null as number | null,
      pivotPct: null as number | null,
      ema21LowPct: null as number | null,
      distSma50: null as number | null,
      threeWkSpread: null as number | null,
      lastClose: null as number | null,
      dailyPct: null as number | null,
    }
  }

  const i = bars.length - 1
  const close = bars[i].close
  const prev = i > 0 ? bars[i - 1].close : close
  const dailyPct = prev > 0 ? ((close - prev) / prev) * 100 : null

  // ADR% from H/L ratio over last 20 bars
  let adrPct: number | null = overrides?.adrPct ?? null
  if (adrPct == null && bars.length >= 20) {
    let s = 0
    for (let k = bars.length - 20; k < bars.length; k++) {
      if (bars[k].low > 0) s += bars[k].high / bars[k].low
    }
    adrPct = 100 * (s / 20 - 1)
  }

  // Pivot% = (close - max(high, last 20)) / max(high, last 20) * 100
  let pivotPct: number | null = overrides?.pivotPct ?? null
  if (pivotPct == null && bars.length >= 20) {
    let mx = -Infinity
    for (let k = bars.length - 20; k < bars.length; k++) {
      if (bars[k].high > mx) mx = bars[k].high
    }
    if (mx > 0) pivotPct = ((close - mx) / mx) * 100
  }

  // 21EMA(low) %
  const ema21Lo = ema(bars.map(b => b.low), 21)
  const eLo = ema21Lo[i]
  const ema21LowPct = eLo != null && eLo > 0 ? ((close - eLo) / eLo) * 100 : null

  // dist SMA50
  let distSma50: number | null = overrides?.distSma50 ?? null
  if (distSma50 == null) {
    const s50 = sma(bars.map(b => b.close), 50)[i]
    distSma50 = s50 != null && s50 > 0 ? ((close - s50) / s50) * 100 : null
  }

  // 3-week tight spread % (high-low range over last 15 trading days as a proxy)
  let threeWkSpread: number | null = null
  if (bars.length >= 15) {
    const window = bars.slice(-15).map(b => b.close)
    const mn = Math.min(...window)
    const mx = Math.max(...window)
    threeWkSpread = mn > 0 ? ((mx - mn) / mn) * 100 : null
  }

  return {
    adrPct,
    pivotPct,
    ema21LowPct,
    distSma50,
    threeWkSpread,
    lastClose: close,
    dailyPct,
  }
}

export default function StockCard({
  code,
  name,
  sector,
  bars,
  structurePivotPhases,
  overrides,
  selected,
  onSelect,
  onWatch,
}: Props) {
  const m = useMemo(() => deriveCompactMetrics(bars, overrides), [bars, overrides])
  const rs = overrides?.rs ?? null

  const stopClick = (e: React.MouseEvent) => e.stopPropagation()
  const handleWatch = (e: React.MouseEvent) => {
    e.stopPropagation()
    onWatch?.(code)
  }

  return (
    <div
      onClick={() => onSelect?.(code)}
      className={`card p-3 flex flex-col gap-2 cursor-pointer transition-all ${
        selected ? 'ring-2 ring-[var(--accent)] -translate-y-0.5' : ''
      }`}
    >
      {/* Header */}
      <div className="flex items-baseline justify-between gap-2 min-w-0">
        <div className="flex items-baseline gap-2 min-w-0">
          <a
            href={TRADINGVIEW_URL(code)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={stopClick}
            className="font-mono font-bold text-[var(--accent)] hover:underline text-base shrink-0"
          >
            {code}
          </a>
          {name && (
            <a
              href={SHIKIHO_URL(code)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={stopClick}
              className="text-xs text-[var(--text-secondary)] hover:underline truncate"
              title={name}
            >
              {name}
            </a>
          )}
          {sector && (
            <span className="text-[10px] text-[var(--text-muted)] shrink-0 hidden lg:inline">
              {sector}
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-1.5 shrink-0">
          {m.lastClose != null && (
            <span className="font-mono text-sm font-semibold text-[var(--text-primary)]">
              {m.lastClose.toLocaleString('ja-JP', { maximumFractionDigits: 2 })}
            </span>
          )}
          {m.dailyPct != null && (
            <span
              className="font-mono text-xs font-semibold"
              style={{
                color: m.dailyPct >= 0 ? 'var(--positive)' : 'var(--negative)',
              }}
            >
              {fmtSignedPct(m.dailyPct, 2)}
            </span>
          )}
          {onWatch && (
            <button
              onClick={handleWatch}
              title="Watchlist に追加"
              className="ml-1 text-[10px] font-medium px-1.5 py-0.5 rounded border border-indigo-200 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 leading-none"
            >
              + Watch
            </button>
          )}
        </div>
      </div>

      {/* Compact metrics — 6 cells, 2 rows of 3 */}
      <div className="grid grid-cols-3 gap-x-2 gap-y-0.5 text-[10px]">
        <Metric label="ADR" value={fmtPct(m.adrPct)} color={metricColor('ADR', m.adrPct)} />
        <Metric label="RS" value={fmtNum(rs)} color={metricColor('RS', rs)} />
        <Metric label="Pivot" value={fmtSignedPct(m.pivotPct)} color={metricColor('Pivot', m.pivotPct)} />
        <Metric
          label="21EMA%"
          value={fmtSignedPct(m.ema21LowPct)}
          color={metricColor('21EMA%', m.ema21LowPct)}
        />
        <Metric
          label="50sma%"
          value={fmtSignedPct(m.distSma50)}
          color={metricColor('50sma%', m.distSma50)}
        />
        <Metric
          label="3WT"
          value={
            m.threeWkSpread != null
              ? `${m.threeWkSpread <= 1.5 ? 'YES ' : ''}${m.threeWkSpread.toFixed(1)}%`
              : '—'
          }
          color={metricColor('3WT', m.threeWkSpread)}
        />
      </div>

      {/* Mini chart */}
      <MiniChart
        bars={bars}
        structurePivotPhases={structurePivotPhases}
        height={180}
      />
    </div>
  )
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-[var(--text-muted)] uppercase tracking-wide">{label}</span>
      <span className="font-mono font-semibold" style={color ? { color } : undefined}>
        {value}
      </span>
    </div>
  )
}
