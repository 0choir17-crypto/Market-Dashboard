'use client'

import type { SpringSetupRow } from '@/types/springSetups'
import { springTypeMeta } from '@/types/springSetups'
import { formatPct } from '@/lib/format'
import { tradingViewUrl, shikihoUrl } from '@/lib/tickerLinks'

type Props = {
  row: SpringSetupRow
  hot?: boolean
  onAddWatchlist?: (row: SpringSetupRow) => void
  onAddPosition?: (row: SpringSetupRow) => void
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

function fmtClose(v: number | null | undefined): string {
  return isNum(v) ? v.toLocaleString('ja-JP', { maximumFractionDigits: 1 }) : '—'
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

// 防衛ライン（ignition_level）は「◯◯円・現在+X%で死守中」とチャート判断に直結するので目立たせる。
// ③ swing_low のみの行は ignition_level=null → 防衛ラインなしの注記を出す。
function DefenseLine({ row }: { row: SpringSetupRow }) {
  if (!isNum(row.ignition_level)) {
    return (
      <div className="mx-3 mb-1 px-2.5 py-1.5 rounded-lg bg-violet-50 border border-violet-200 text-[11px] text-violet-800">
        直近10日安値をリクレイム（点火ライン無し）
      </div>
    )
  }
  const defended = row.defended_pct
  return (
    <div className="mx-3 mb-1 px-2.5 py-2 rounded-lg bg-emerald-50 border border-emerald-200">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">防衛ライン</span>
        {isNum(defended) && (
          <span
            className="text-[10px] font-semibold text-emerald-700"
            title="(close/ignition_level−1)×100。小さいほどライン際で死守"
          >
            現在 {fmtSignedPct(defended)} で死守中
          </span>
        )}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className="font-mono text-base font-bold text-emerald-800 tabular-nums leading-none">
          {fmtClose(row.ignition_level)}
        </span>
        <span className="text-[10px] text-emerald-700">円（点火日始値）</span>
      </div>
    </div>
  )
}

export default function SpringSetupCard({ row, hot = false, onAddWatchlist, onAddPosition }: Props) {
  const meta = springTypeMeta(row.type)

  return (
    <div
      className="bg-white rounded-lg border shadow-sm hover:shadow-md transition-shadow flex flex-col"
      style={{
        borderColor: hot ? '#86efac' : '#e8eaed',
        backgroundColor: hot ? '#f0fdf4' : '#ffffff',
      }}
    >
      {/* バッジ行 */}
      <div className="px-3 py-2 border-b border-[#f0f2f4] flex items-center gap-1.5 flex-wrap">
        <Chip text={meta.label} palette={meta.palette} title={meta.title} />
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

      {/* 防衛ライン（目立たせる） */}
      <DefenseLine row={row} />

      {/* 共通枠: 固有(防衛ライン=上部) / 52w高 / ADR% / 強さ(126d) */}
      <div className="px-3 grid grid-cols-2 gap-2">
        <Metric label="52w高" value={fmtSignedPct(row.dist_from_high_pct)} title="52週高値からの距離(%)" />
        <Metric label="ADR%" value={fmt(row.adr_pct)} title="平均日中変動率(%) = ボラの目安" />
        <Metric
          label="126d"
          value={fmtSignedPct(row.m126, 0)}
          color={isNum(row.m126) && row.m126 >= 0 ? 'var(--positive)' : 'var(--negative)'}
          title="126日上昇率(%)。なぜリーダー判定されたか（長期モメンタム）"
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
