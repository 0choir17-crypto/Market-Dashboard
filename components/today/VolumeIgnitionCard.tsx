'use client'

import type { VolumeIgnitionRow } from '@/types/volumeIgnition'
import { formatPct } from '@/lib/format'
import { tradingViewUrl, shikihoUrl } from '@/lib/tickerLinks'

type Props = {
  row: VolumeIgnitionRow
  hot?: boolean
  multiHit?: boolean
  onAddWatchlist?: (row: VolumeIgnitionRow) => void
  onAddPosition?: (row: VolumeIgnitionRow) => void
}

function isNum(v: number | null | undefined): v is number {
  return v !== null && v !== undefined && Number.isFinite(v)
}

function fmt(v: number | null | undefined, decimals = 1): string {
  return isNum(v) ? v.toFixed(decimals) : '—'
}

// 符号付き % は lib/format.ts に委譲
function fmtSignedPct(v: number | null | undefined, decimals = 1): string {
  return formatPct(v, { digits: decimals, sign: true })
}

function fmtClose(v: number | null | undefined): string {
  return isNum(v) ? v.toLocaleString('ja-JP', { maximumFractionDigits: 1 }) : '—'
}

// rs (0–100, 高いほど強い)
function rsColor(v: number | null): string {
  if (!isNum(v)) return 'var(--text-muted)'
  if (v >= 80) return 'var(--positive)'
  if (v >= 60) return 'var(--accent)'
  if (v >= 40) return 'var(--text-secondary)'
  return 'var(--negative)'
}

// 出来高比（大きいほど点火が強い）
function volColor(v: number | null): string {
  if (!isNum(v)) return 'var(--text-muted)'
  if (v >= 4) return 'var(--positive)'
  if (v >= 2) return 'var(--text-primary)'
  return 'var(--text-secondary)'
}

function Chip({
  text,
  palette,
  title,
}: {
  text: string
  palette: { bg: string; fg: string; border: string }
  title?: string
}) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums"
      style={{ backgroundColor: palette.bg, color: palette.fg, border: `1px solid ${palette.border}` }}
      title={title}
    >
      {text}
    </span>
  )
}

// ADR>12 = 大負け多発帯。減サイズ警告（赤）。
function AdrExtremeChip() {
  return (
    <Chip
      text="⚠ ADR>12 減サイズ"
      palette={{ bg: 'var(--negative-bg)', fg: '#991b1b', border: '#fca5a5' }}
      title="adr_extreme=true（ADR>12）は大負け多発帯。ポジションサイズを減らす警告。"
    />
  )
}

function Metric({
  label,
  value,
  color,
  title,
}: {
  label: string
  value: string
  color?: string
  title?: string
}) {
  return (
    <div className="rounded bg-[var(--bg-card-hover)] border border-[#f0f2f4] px-2 py-1.5" title={title}>
      <p className="text-[9px] font-medium uppercase tracking-wide text-[var(--text-secondary)] leading-tight">{label}</p>
      <p
        className="mt-0.5 font-mono text-sm font-semibold leading-tight tabular-nums"
        style={{ color: color ?? 'var(--text-primary)' }}
      >
        {value}
      </p>
    </div>
  )
}

export default function VolumeIgnitionCard({ row, hot = false, multiHit = false, onAddWatchlist, onAddPosition }: Props) {
  const extreme = row.adr_extreme === true

  // 枠/背景: 複数シグナル重複（黄）を最優先 → ⚠ADR極端（赤）→ hotセクター（緑）
  const borderColor = multiHit ? '#fbbf24' : extreme ? '#fca5a5' : hot ? '#86efac' : '#e8eaed'
  const backgroundColor = multiHit ? '#fef9c3' : extreme ? '#fffafa' : hot ? '#f0fdf4' : '#ffffff'

  return (
    <div
      className="bg-white rounded-lg border shadow-sm hover:shadow-md transition-shadow flex flex-col"
      style={{ borderColor, backgroundColor }}
    >
      {/* バッジ行（内容がある時のみ表示） */}
      {(extreme || row.mkt) && (
        <div className="px-3 py-2 border-b border-[#f0f2f4] flex items-center gap-1.5 flex-wrap">
          {extreme && <AdrExtremeChip />}
          {row.mkt && <span className="ml-auto text-[10px] text-[var(--text-muted)] font-mono">{row.mkt}</span>}
        </div>
      )}

      {/* 銘柄 */}
      <div className="px-3 py-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 min-w-0">
            <a
              href={shikihoUrl(row.code)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-[var(--text-primary)] hover:underline truncate min-w-0 flex-1"
              title={`${row.co_name ?? '—'}（四季報を開く）`}
            >
              {row.co_name ?? '—'}
            </a>
            <a
              href={tradingViewUrl(row.code)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-sm font-bold text-[var(--accent)] hover:underline flex-shrink-0"
              title={`${row.code}（TradingView を開く）`}
            >
              {row.code}
            </a>
          </div>
          <div
            className="mt-0.5 text-[11px] truncate"
            style={{ color: hot ? 'var(--positive)' : 'var(--text-secondary)' }}
            title={row.sector_s33 ?? ''}
          >
            {hot ? '🟢 ' : ''}
            {row.sector_s33 ?? '—'}
          </div>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="text-[9px] font-medium uppercase tracking-wide text-[var(--text-muted)] leading-tight">Close</p>
          <p className="font-mono text-sm font-semibold text-[var(--text-primary)] tabular-nums leading-tight">
            {fmtClose(row.close)}
          </p>
        </div>
      </div>

      {/* 共通4枠: 固有指標①(出来高比) / 52w高 / ADR% / 強さ(RS) */}
      <div className="px-3 grid grid-cols-2 gap-2">
        <Metric
          label="出来高比"
          value={isNum(row.vol_ratio) ? `${fmt(row.vol_ratio, 1)}x` : '—'}
          color={volColor(row.vol_ratio)}
          title="点火日 出来高/20日平均（≥2）。大きいほど点火が強い"
        />
        <Metric
          label="52w高"
          value={fmtSignedPct(row.dist_from_high_pct)}
          title="52週高値からの距離(%)"
        />
        <Metric
          label="ADR%"
          value={fmt(row.adr_pct)}
          color={extreme ? 'var(--negative)' : undefined}
          title="ADR%（20本）。日中ボラ容量。>12 は減サイズ警告帯"
        />
        <Metric
          label="RS"
          value={fmt(row.rs_topix_avg, 0)}
          color={rsColor(row.rs_topix_avg)}
          title="対TOPIX 相対強さ（21/63/126平均, 0–100）"
        />
      </div>

      {/* アクション */}
      {(onAddWatchlist || onAddPosition) && (
        <div className="px-3 pt-2 pb-2 mt-2 border-t border-[#f0f2f4] flex items-center justify-end gap-1.5">
          {onAddWatchlist && (
            <button
              onClick={() => onAddWatchlist(row)}
              className="px-2 py-1 text-[10px] font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded transition-colors"
              title="Watchlist に追加"
            >
              ＋ Watch
            </button>
          )}
          {onAddPosition && (
            <button
              onClick={() => onAddPosition(row)}
              className="px-2 py-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded transition-colors"
              title="Position として保存"
            >
              ＋ Position
            </button>
          )}
        </div>
      )}
    </div>
  )
}
