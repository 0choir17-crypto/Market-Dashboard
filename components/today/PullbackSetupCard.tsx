'use client'

import type { CoilPullbackRow, MaPullbackRow } from '@/types/pullbackSetups'
import { maGrade, type MaPositionGrade, type MaDepthGrade } from '@/types/pullbackSetups'
import { formatPct } from '@/lib/format'
import { tradingViewUrl, shikihoUrl } from '@/lib/tickerLinks'

type Props =
  | {
      kind: 'coil'
      row: CoilPullbackRow
      hot?: boolean
      multiHit?: boolean
      onAddWatchlist?: (row: CoilPullbackRow) => void
      onAddPosition?: (row: CoilPullbackRow) => void
    }
  | {
      kind: 'ma'
      row: MaPullbackRow
      hot?: boolean
      multiHit?: boolean
      onAddWatchlist?: (row: MaPullbackRow) => void
      onAddPosition?: (row: MaPullbackRow) => void
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

const DEPTH_PALETTE: Record<MaDepthGrade, { bg: string; fg: string; border: string }> = {
  A: { bg: '#dcfce7', fg: '#166534', border: '#86efac' }, // 50MA（深い）
  B: { bg: '#dbeafe', fg: '#1e40af', border: '#93c5fd' }, // 21MA
  C: { bg: '#f3f4f6', fg: '#475569', border: '#cbd5e1' }, // 10MA（浅い）
}

const POSITION_PALETTE: Record<MaPositionGrade, { bg: string; fg: string; border: string }> = {
  'A++': { bg: '#dcfce7', fg: '#166534', border: '#86efac' },
  'A+': { bg: '#ecfccb', fg: '#3f6212', border: '#bef264' },
  base: { bg: '#f3f4f6', fg: '#6b7280', border: '#d1d5db' },
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

export default function PullbackSetupCard(props: Props) {
  const { kind, row, hot = false, multiHit = false } = props

  return (
    <div
      className="bg-white rounded-lg border shadow-sm hover:shadow-md transition-shadow flex flex-col"
      style={{
        borderColor: multiHit ? '#fbbf24' : hot ? '#86efac' : '#e8eaed',
        backgroundColor: multiHit ? '#fef9c3' : hot ? '#f0fdf4' : '#ffffff',
      }}
    >
      {/* バッジ行 */}
      <div className="px-3 py-2 border-b border-[#f0f2f4] flex items-center gap-1.5 flex-wrap">
        {kind === 'ma' && <MaGradeBadges row={props.row} />}
        {row.mkt && <span className="ml-auto text-[10px] text-[var(--text-muted)] font-mono">{row.mkt}</span>}
      </div>

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

      {/* 指標（最低限）*/}
      <div className="px-3 grid grid-cols-2 gap-2">
        {kind === 'coil' ? <CoilMetrics row={props.row} /> : <MaMetrics row={props.row} />}
      </div>

      {/* アクション */}
      <SetupActions
        row={row}
        // 判別済みハンドラを AnyRow 受けに正規化（呼び出し側で型は一致）
        onAddWatchlist={props.onAddWatchlist as ((row: CoilPullbackRow | MaPullbackRow) => void) | undefined}
        onAddPosition={props.onAddPosition as ((row: CoilPullbackRow | MaPullbackRow) => void) | undefined}
      />
    </div>
  )
}

function SetupActions({
  row,
  onAddWatchlist,
  onAddPosition,
}: {
  row: CoilPullbackRow | MaPullbackRow
  onAddWatchlist?: (row: CoilPullbackRow | MaPullbackRow) => void
  onAddPosition?: (row: CoilPullbackRow | MaPullbackRow) => void
}) {
  if (!onAddWatchlist && !onAddPosition) return null
  return (
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
  )
}

function MaGradeBadges({ row }: { row: MaPullbackRow }) {
  const g = maGrade(row)
  return (
    <>
      {g.depth ? (
        <Chip
          text={g.depth.label}
          palette={DEPTH_PALETTE[g.depth.grade]}
          title={`深さ: ${g.depth.ma}日線まで押した（乖離 ${g.depth.adr.toFixed(2)} ADR）`}
        />
      ) : (
        <Chip text="深—" palette={{ bg: '#f3f4f6', fg: '#9ca3af', border: '#e5e7eb' }} title="深さ: 0〜0.5 ADR を満たすMAなし" />
      )}
      {g.position ? (
        <Chip text={g.position} palette={POSITION_PALETTE[g.position]} title="位置: 52週高値への近さ" />
      ) : (
        <Chip text="位—" palette={{ bg: '#f3f4f6', fg: '#9ca3af', border: '#e5e7eb' }} title="位置: データなし" />
      )}
    </>
  )
}

// 共通4枠: 固有指標① / 52w高 / ADR% / 強さ(RS)
function CoilMetrics({ row }: { row: CoilPullbackRow }) {
  // iqr5 は小さいほどタイト（良）。視認用に緑/通常で色分け。
  const iqrColor = isNum(row.iqr5)
    ? row.iqr5 <= 1.5
      ? 'var(--positive)'
      : row.iqr5 <= 3
        ? 'var(--text-primary)'
        : 'var(--text-secondary)'
    : 'var(--text-muted)'
  return (
    <>
      <Metric label="収縮 iqr5" value={fmt(row.iqr5, 2)} color={iqrColor} title="終値の収縮度（小さいほどタイト）" />
      <Metric label="52w高" value={fmtSignedPct(row.dist_from_high_pct)} title="52週高値からの距離(%)" />
      <Metric label="ADR%" value={fmt(row.adr_pct)} title="平均日中変動率(%) = ボラの目安" />
      <Metric label="RS" value={fmt(row.rs_topix_avg, 0)} color={rsColor(row.rs_topix_avg)} title="対TOPIX 相対強度" />
    </>
  )
}

function MaMetrics({ row }: { row: MaPullbackRow }) {
  const g = maGrade(row)
  const depthVal = g.depth ? `${g.depth.adr.toFixed(2)} (${g.depth.ma})` : '—'
  return (
    <>
      <Metric label="深さ ADR" value={depthVal} title="採用MAからの乖離（ADR単位, 0〜0.5）／括弧内はMA" />
      <Metric label="52w高" value={fmtSignedPct(row.dist_from_high_pct)} title="52週高値からの距離(%)【位置軸】" />
      <Metric label="ADR%" value={fmt(row.adr_pct)} title="平均日中変動率(%) = ボラの目安" />
      <Metric label="RS" value={fmt(row.rs, 0)} color={rsColor(row.rs)} title="対TOPIX 相対強度" />
    </>
  )
}
