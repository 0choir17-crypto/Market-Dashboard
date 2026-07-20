'use client'

import type { StructurePivotCardRow } from '@/types/structurePivotEvents'
import { signalMeta, statusMeta } from '@/types/structurePivotEvents'
import { formatPct } from '@/lib/format'
import { tradingViewUrl, shikihoUrl } from '@/lib/tickerLinks'
import ChartButton from '@/components/today/ChartButton'

type Props = {
  row: StructurePivotCardRow
  hot?: boolean
  multiHit?: boolean
  onAddWatchlist?: (row: StructurePivotCardRow) => void
  onAddPosition?: (row: StructurePivotCardRow) => void
}

function isNum(v: number | null | undefined): v is number {
  return v !== null && v !== undefined && Number.isFinite(v)
}

function fmt(v: number | null | undefined, decimals = 1): string {
  return isNum(v) ? v.toFixed(decimals) : '—'
}

function fmtSignedPct(v: number | null | undefined, decimals = 1): string {
  return formatPct(v, { digits: decimals, sign: true })
}

function fmtPrice(v: number | null | undefined): string {
  return isNum(v) ? v.toLocaleString('ja-JP', { maximumFractionDigits: 1 }) : '—'
}

// rs (0–100, 高いほど強い)。他スキャナーと同じ配色。
function rsColor(v: number | null): string {
  if (!isNum(v)) return 'var(--text-muted)'
  if (v >= 80) return 'var(--positive)'
  if (v >= 60) return 'var(--accent)'
  if (v >= 40) return 'var(--text-secondary)'
  return 'var(--negative)'
}

// 直近ヒットからの営業日数。新しい（0 に近い）ほど強調。
function daysColor(v: number | null): string {
  if (!isNum(v)) return 'var(--text-muted)'
  if (v <= 0) return 'var(--positive)'
  if (v <= 2) return 'var(--accent)'
  if (v <= 5) return 'var(--text-primary)'
  return 'var(--text-secondary)'
}

function daysLabel(v: number | null): string {
  if (!isNum(v)) return '—'
  if (v <= 0) return '本日'
  return `${v}営業日前`
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

export default function StructurePivotCard({
  row,
  hot = false,
  multiHit = false,
  onAddWatchlist,
  onAddPosition,
}: Props) {
  const sMeta = signalMeta(row.recent_hit_signal)
  const stMeta = statusMeta(row.status)

  // 1st→2nd 進行: 直近で 1st と 2nd を両方ヒット済み（別日）＝構造が前進中。
  const progressed =
    !!row.last_1st_date && !!row.last_2nd_date && row.last_2nd_date >= row.last_1st_date

  // 枠/背景: 複数シグナル重複（黄）を最優先 → hotセクター（緑）→ 既定。
  const borderColor = multiHit ? '#fbbf24' : hot ? '#86efac' : '#e8eaed'
  const backgroundColor = multiHit ? '#fef9c3' : hot ? '#f0fdf4' : '#ffffff'

  // 建玉ライン / 2nd / TP をチャート判断用にツールチップへまとめる。
  const levelsTitle = [
    isNum(row.first_pivot) ? `建玉ライン(1st): ${fmtPrice(row.first_pivot)}` : null,
    isNum(row.pivot_2nd) ? `2nd Pivot: ${fmtPrice(row.pivot_2nd)}` : null,
    isNum(row.tp1) ? `TP1: ${fmtPrice(row.tp1)}` : null,
    isNum(row.tp2) ? `TP2: ${fmtPrice(row.tp2)}` : null,
    isNum(row.hl_price) ? `HL(起点): ${fmtPrice(row.hl_price)}` : null,
  ]
    .filter(Boolean)
    .join(' / ')

  return (
    <div
      className="bg-white rounded-lg border shadow-sm hover:shadow-md transition-shadow flex flex-col"
      style={{ borderColor, backgroundColor }}
    >
      {/* バッジ行: signal（1st/2nd）+ status + 1st→2nd 進行 */}
      <div className="px-3 py-2 border-b border-[#f0f2f4] flex items-center gap-1.5 flex-wrap">
        <Chip text={sMeta.label} palette={sMeta.palette} title={sMeta.title} />
        <Chip text={stMeta.label} palette={stMeta.palette} title={stMeta.title} />
        {progressed && (
          <Chip
            text="1st→2nd"
            palette={{ bg: '#faf5ff', fg: '#7e22ce', border: '#e9d5ff' }}
            title={`1st(${row.last_1st_date}) → 2nd(${row.last_2nd_date}) と構造が前進中。`}
          />
        )}
      </div>

      {/* 銘柄 */}
      <div className="px-3 py-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 min-w-0">
            <a
              href={shikihoUrl(row.code)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-[var(--text-primary)] hover:underline truncate"
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
            <ChartButton code={row.code} name={row.co_name} />
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
          <p
            className="font-mono text-sm font-semibold text-[var(--text-primary)] tabular-nums leading-tight cursor-help"
            title={levelsTitle || undefined}
          >
            {fmtPrice(row.close)}
          </p>
        </div>
      </div>

      {/* 共通4枠: 直近ヒット(何営業日前) / RS / 52w高 / ADR% */}
      <div className="px-3 grid grid-cols-2 gap-2">
        <Metric
          label="直近ヒット"
          value={daysLabel(row.days_since_hit)}
          color={daysColor(row.days_since_hit)}
          title={`直近で ${row.recent_hit_signal} をヒットした日: ${row.recent_hit_date}（窓内の営業日で換算）`}
        />
        <Metric
          label="RS"
          value={fmt(row.rs_topix_avg, 0)}
          color={rsColor(row.rs_topix_avg)}
          title={`対TOPIX 相対強さ（21/63/126平均, 0–100）。63日: ${fmt(row.rs_topix_63d, 0)}`}
        />
        <Metric
          label="52w高"
          value={fmtSignedPct(row.dist_from_high_pct)}
          title="52週高値からの乖離(%)。0 に近いほど高値圏で質が上がる傾向"
        />
        <Metric
          label="ADR%"
          value={fmt(row.adr_pct)}
          title="ADR%（20日）。日中ボラ容量"
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
