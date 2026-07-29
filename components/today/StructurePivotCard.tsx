'use client'

import type { StructurePivotCardRow } from '@/types/structurePivotEvents'
import { formatPct } from '@/lib/format'
import { tradingViewUrl, shikihoUrl } from '@/lib/tickerLinks'

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

// ヒット日を MM/DD に整形（カード表面）。tooltip では YYYY-MM-DD をそのまま出す。
function fmtHitDate(d: string | null): string {
  if (!d) return '—'
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(d)
  return m ? `${m[1]}/${m[2]}` : d
}

// signal ラベル色（1st=建玉ライン=インディゴ / 2nd=ブレイク=ブルー）。
const SIG_COLOR: Record<'1st' | '2nd', string> = { '1st': '#4f46e5', '2nd': '#2563eb' }

// 1st / 2nd それぞれの直近ヒット日を1マスで表示。本日ヒットは緑で強調。
function HitCell({
  sig,
  date,
  today,
}: {
  sig: '1st' | '2nd'
  date: string | null
  today: boolean
}) {
  const title = date
    ? `直近 ${sig} ヒット日: ${date}${today ? '（本日）' : ''}`
    : `直近 ${sig} ヒット: なし`
  return (
    <div
      className="rounded px-1.5 py-1 border"
      style={{
        backgroundColor: today ? 'var(--positive-bg, #ecfdf5)' : 'transparent',
        borderColor: today ? '#86efac' : '#f0f2f4',
      }}
      title={title}
    >
      <span className="text-[10px] font-bold" style={{ color: SIG_COLOR[sig] }}>
        {sig}
      </span>
      <span
        className="ml-1 font-mono text-xs font-semibold tabular-nums"
        style={{ color: today ? 'var(--positive)' : 'var(--text-primary)' }}
      >
        {fmtHitDate(date)}
      </span>
      {today && <span className="ml-1 text-[9px] font-bold" style={{ color: 'var(--positive)' }}>●</span>}
    </div>
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
  // 枠/背景: 複数シグナル重複（黄）を最優先 → hotセクター（緑）→ 既定。
  const borderColor = multiHit ? '#fbbf24' : hot ? '#86efac' : '#e8eaed'
  const backgroundColor = multiHit ? '#fef9c3' : hot ? '#f0fdf4' : '#ffffff'

  // 本日ヒットしたシグナルのラベル（複数可）。カード上部に明示する。
  const todayTags: ('1st' | '2nd')[] = []
  if (row.today_1st) todayTags.push('1st')
  if (row.today_2nd) todayTags.push('2nd')

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
      {/* 銘柄 */}
      <div className="px-3 py-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {/* 1行目は銘柄名にできるだけ幅を割く（コードのみ右に固定）。
              バッジ類は2行目へ逃がさないと名前が数文字で切れる。 */}
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
          <div className="mt-0.5 flex items-center gap-1.5 min-w-0">
            <span
              className="text-[11px] truncate min-w-0"
              style={{ color: hot ? 'var(--positive)' : 'var(--text-secondary)' }}
              title={row.sector_s33 ?? ''}
            >
              {hot ? '🟢 ' : ''}
              {row.sector_s33 ?? '—'}
            </span>
            {/* 本日どのシグナルにヒットしたか（1st / 2nd）を明示 */}
            <span className="flex items-center gap-1 flex-shrink-0" title="本日ヒットしたシグナル">
              {todayTags.map(sig => (
                <span
                  key={sig}
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold leading-none"
                  style={{ backgroundColor: '#ecfdf5', color: SIG_COLOR[sig], border: `1px solid ${SIG_COLOR[sig]}33` }}
                >
                  本日{sig}
                </span>
              ))}
            </span>
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

      {/* 直近ヒット日: 1st / 2nd それぞれのヒット日（本日ヒットは緑で強調） */}
      <div className="px-3 pt-2">
        <div className="rounded bg-[var(--bg-card-hover)] border border-[#f0f2f4] px-2 py-1.5">
          <p className="text-[9px] font-medium uppercase tracking-wide text-[var(--text-secondary)] leading-tight">
            直近ヒット日
          </p>
          <div className="mt-1 grid grid-cols-2 gap-1.5">
            <HitCell sig="1st" date={row.last_1st_date} today={row.today_1st} />
            <HitCell sig="2nd" date={row.last_2nd_date} today={row.today_2nd} />
          </div>
        </div>
      </div>

      {/* 共通指標: RS / 52w高 / ADR% / 出来高比 */}
      <div className="px-3 pt-2 grid grid-cols-2 gap-2">
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
        <Metric
          label="出来高比"
          value={isNum(row.vol_ratio) ? `${fmt(row.vol_ratio, 1)}x` : '—'}
          title="ヒット日 出来高/平均。大きいほど需要が強い"
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
