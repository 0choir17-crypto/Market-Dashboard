'use client'

import type { ScanResultRow } from '@/types/scanResults'
import { tradingViewUrl, shikihoUrl } from '@/lib/tickerLinks'

type Props = {
  row: ScanResultRow
  hot?: boolean
}

const SIGNAL_PALETTE: Record<string, { bg: string; fg: string; border: string }> = {
  vcp: { bg: '#dbeafe', fg: '#1e40af', border: '#93c5fd' },
  pivot: { bg: '#ede9fe', fg: '#5b21b6', border: '#c4b5fd' },
  hl_break: { bg: '#dcfce7', fg: '#166534', border: '#86efac' },
  setup_long: { bg: '#fef3c7', fg: '#92400e', border: '#fcd34d' },
  breakout: { bg: '#dcfce7', fg: '#166534', border: '#86efac' },
  momentum: { bg: '#fce7f3', fg: '#9d174d', border: '#f9a8d4' },
}

const DEFAULT_PALETTE = { bg: '#f3f4f6', fg: '#374151', border: '#d1d5db' }

function signalPalette(signal: string | null) {
  if (!signal) return DEFAULT_PALETTE
  return SIGNAL_PALETTE[signal.toLowerCase()] ?? DEFAULT_PALETTE
}

function fmtNum(v: number | null | undefined, decimals = 1): string {
  if (v === null || v === undefined) return '—'
  return v.toFixed(decimals)
}

function fmtSigned(v: number | null | undefined, decimals = 2): string {
  if (v === null || v === undefined) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(decimals)}`
}

function rsColor(v: number | null): string {
  if (v == null) return 'var(--text-muted)'
  if (v >= 80) return 'var(--positive)'
  if (v >= 60) return 'var(--accent)'
  if (v >= 40) return 'var(--text-secondary)'
  return 'var(--negative)'
}

function atrColor(v: number | null): string {
  if (v == null) return 'var(--text-muted)'
  if (v >= 3) return '#92400e'
  if (v >= 1.5) return '#a16207'
  return 'var(--text-secondary)'
}

export default function ScanResultCard({ row, hot = false }: Props) {
  const palette = signalPalette(row.signal)

  return (
    <div
      className="bg-white rounded-lg border shadow-sm hover:shadow-md transition-shadow flex flex-col"
      style={{
        borderColor: hot ? '#86efac' : '#e8eaed',
        backgroundColor: hot ? '#f0fdf4' : '#ffffff',
      }}
    >
      <div className="px-3 py-2 flex items-start justify-between gap-2 border-b border-[#f0f2f4]">
        <span
          className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide"
          style={{
            backgroundColor: palette.bg,
            color: palette.fg,
            border: `1px solid ${palette.border}`,
          }}
          title={row.signal ?? ''}
        >
          {row.signal ?? '—'}
        </span>
        <a
          href={tradingViewUrl(row.code)}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-sm font-bold text-blue-600 hover:underline flex-shrink-0"
          title={`${row.code}（TradingView を開く）`}
        >
          {row.code}
        </a>
      </div>

      <div className="px-3 py-2">
        <a
          href={shikihoUrl(row.code)}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-sm font-semibold text-[var(--text-primary)] hover:underline truncate"
          title={`${row.name ?? '—'}（四季報を開く）`}
        >
          {row.name ?? '—'}
        </a>
        <div
          className="mt-0.5 text-[11px] truncate"
          style={{ color: hot ? '#16a34a' : '#6b7280' }}
          title={row.sector ?? ''}
        >
          {hot ? '🟢 ' : ''}
          {row.sector ?? '—'}
        </div>
      </div>

      <div className="px-3 pb-3 grid grid-cols-3 gap-2">
        <Metric
          label="RS-TOPIX 21d"
          value={fmtNum(row.rs_topix_21d, 1)}
          color={rsColor(row.rs_topix_21d)}
        />
        <Metric
          label="RS-Sector 21d"
          value={fmtNum(row.rs_sector_21d, 1)}
          color={rsColor(row.rs_sector_21d)}
        />
        <Metric
          label="ATR ext 50sma"
          value={fmtSigned(row.atr_ext_sma50, 2)}
          color={atrColor(row.atr_ext_sma50)}
        />
      </div>
    </div>
  )
}

function Metric({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color: string
}) {
  return (
    <div className="rounded bg-[#fafafa] border border-[#f0f2f4] px-2 py-1.5">
      <p className="text-[9px] uppercase tracking-wide text-gray-500 leading-tight">
        {label}
      </p>
      <p
        className="mt-0.5 font-mono text-sm font-semibold leading-tight"
        style={{ color }}
      >
        {value}
      </p>
    </div>
  )
}
