'use client'

import type { VahBreakoutRow } from '@/types/vahBreakouts'
import { formatPct } from '@/lib/format'
import { tradingViewUrl, shikihoUrl } from '@/lib/tickerLinks'
import CopyTickerButton from '@/components/shared/CopyTickerButton'

type Props = {
  row: VahBreakoutRow
  multiHit?: boolean
  onAddPosition?: (row: VahBreakoutRow) => void
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

// YYYY-MM-DD → M/D
function shortDate(d: string | null): string {
  if (!d) return '—'
  const [, m, day] = d.split('-')
  return `${Number(m)}/${Number(day)}`
}

// v9 のシグナル種別バッジ。配色は Chrome overlay 拡張と同じ（▲ベース初回 = 緑 / ◆切替直後 = 赤紫 / 他 = 灰）。
// 色は優劣ではなく種類の区別（検証上、どの種類も買いシグナルになるほどの差は無い）。
const BADGE_GREEN = '#1f6f4a'
const BADGE_MAGENTA = '#8a2350'
const BADGE_GRAY = '#3a4150'

function badgeFor(row: VahBreakoutRow): { label: string; bg: string; title: string } | null {
  const n = row.cross_n
  switch (row.signal) {
    case 'base': {
      const first = n === 1
      return {
        label: first ? '▲ベース 初回' : isNum(n) ? `▲ベース ${n}回目` : '▲ベース',
        bg: first ? BADGE_GREEN : BADGE_GRAY,
        title: first
          ? '▲ベースのブレイク（起点から5本以上たって、起点〜前日の VAH を終値で初めて上抜けた）'
          : `▲ベースのブレイク ${isNum(n) ? `${n}回目` : ''}（失敗＝20本以内にベース VAH の下で2日 のあとの再ブレイク）`,
      }
    }
    case 'prev':
      return {
        label: '▲前日VAH',
        bg: BADGE_GRAY,
        title: '▲前日までの VAH の上抜け（前日終値 ≤ 起点〜前々日の VAH、当日終値 > 起点〜前日の VAH）',
      }
    case 'switch':
      return {
        label: '◆切替直後',
        bg: BADGE_MAGENTA,
        title: '◆出来高急増で起点が切り替わってから5本以内に、前の期間の VAH を終値で上抜けた',
      }
    default:
      return null
  }
}

function SignalBadge({ row }: { row: VahBreakoutRow }) {
  const b = badgeFor(row)
  if (!b) return <LegacyCrossBadge n={row.cross_n} />
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-caption font-medium tabular-nums"
      style={{ backgroundColor: b.bg, color: '#ffffff' }}
      title={b.title}
    >
      {b.label}
    </span>
  )
}

// 2026-11-08 より前の行（V35 = 全上抜け、signal が null）の表示。同じ期間の中で何回目の上抜けか。
function LegacyCrossBadge({ n }: { n: number | null }) {
  const first = n === 1
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-caption font-medium tabular-nums border"
      style={{
        backgroundColor: first ? 'var(--sem-ok-bg)' : 'transparent',
        color: first ? 'var(--sem-strong-fg)' : 'var(--text-secondary)',
        borderColor: first ? 'var(--sem-strong-bd)' : 'var(--border-strong)',
      }}
      title={
        first
          ? '（旧定義）この期間で初めて VAH を上抜けた'
          : `（旧定義）この期間で ${n ?? '—'} 回目の上抜け（一度 VAH の下に戻ってから再び上抜けた）`
      }
    >
      {first ? '初回' : isNum(n) ? `${n}回目` : '—'}
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
    <div className="rounded bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] px-2 py-1.5" title={title}>
      <p className="text-caption font-medium uppercase tracking-wide text-[var(--text-secondary)] leading-tight">{label}</p>
      <p
        className="mt-0.5 font-mono text-small font-medium leading-tight tabular-nums"
        style={{ color: color ?? 'var(--text-primary)' }}
      >
        {value}
      </p>
    </div>
  )
}

export default function VahBreakoutCard({ row, multiHit = false, onAddPosition }: Props) {
  const prevLabel =
    row.vah_vs_prev === 'above' ? '線より下' : row.vah_vs_prev === 'below' ? '線以上' : ''
  return (
    <div
      className="bg-[var(--bg-card)] rounded-lg border shadow-sm hover:shadow-md transition-shadow flex flex-col"
      style={{
        borderColor: multiHit ? 'var(--sem-watch-bd)' : 'var(--border)',
        backgroundColor: multiHit ? 'var(--sem-watch-bg)' : 'var(--bg-card)',
      }}
    >
      {/* シグナルの種類 / 期間 */}
      <div className="px-3 py-2 border-b border-[var(--border-subtle)] flex items-center gap-1.5 flex-wrap">
        <SignalBadge row={row} />
        <span
          className="ml-auto text-caption text-[var(--text-muted)] tabular-nums font-mono"
          title="抜けた線の期間の起点（出来高の多い局面の始まり）と、その期間の本数"
        >
          起点 {shortDate(row.period_start)}・{isNum(row.period_bars) ? row.period_bars : '—'}本
        </span>
      </div>

      {/* 銘柄 */}
      <div className="px-3 py-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 min-w-0">
            <a
              href={shikihoUrl(row.code)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-small font-medium text-[var(--text-primary)] hover:underline truncate min-w-0 flex-1"
              title={`${row.co_name ?? '—'}（四季報を開く）`}
            >
              {row.co_name ?? '—'}
            </a>
            <a
              href={tradingViewUrl(row.code)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-small font-medium text-[var(--accent)] hover:underline flex-shrink-0"
              title={`${row.code}（TradingView を開く）`}
            >
              {row.code}
            </a>
          </div>
          <div className="mt-0.5 text-caption truncate text-[var(--text-secondary)]" title={row.sector_s33 ?? ''}>
            {row.sector_s33 ?? '—'}
          </div>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="text-caption font-medium uppercase tracking-wide text-[var(--text-muted)] leading-tight">Close</p>
          <p className="font-mono text-small font-medium text-[var(--text-primary)] tabular-nums leading-tight">
            {fmtPrice(row.close)}
          </p>
          <p
            className="font-mono text-caption tabular-nums leading-tight text-[var(--text-secondary)]"
            title="VAH からの上抜け幅 = 100 × (終値 / VAH − 1)"
          >
            VAH {fmtSignedPct(row.breakout_pct, 2)}
          </p>
          {isNum(row.r_atr) && (
            <p
              className="font-mono text-caption tabular-nums leading-tight text-[var(--text-secondary)]"
              title="R = (終値 − 抜けた線) ÷ 前日 ATR14（チャートの R と同じ）。線を損切りにしたときの距離の目安"
            >
              {row.r_atr >= 0 ? '+' : ''}
              {row.r_atr.toFixed(2)}R
            </p>
          )}
        </div>
      </div>

      {/* 線（前日までの足で作った値・配当調整なし） */}
      <div className="px-3 space-y-0.5 text-caption text-[var(--text-secondary)] tabular-nums">
        {(
          [
            ['VAH', row.vah, '上抜けた線（その期間の Value Area 上限）。◆切替直後は前の期間の VAH'],
            ['POC', row.poc, '抜けた線の期間で最も出来高が多かった価格帯'],
            ['VAL', row.val, '抜けた線の期間の Value Area 下限'],
          ] as const
        ).map(([label, v, title]) => (
          <div key={label} className="flex items-baseline justify-between gap-2" title={title}>
            <span className="font-mono">{label}</span>
            <span className="font-mono">{fmtPrice(v)}</span>
          </div>
        ))}
        <div
          className="flex items-baseline justify-between gap-2 text-[var(--text-muted)]"
          title="抜けた線の 1 つ前の期間の VAH。検証上、抜けた線より上か下かで成績差は無い"
        >
          <span className="font-mono">前VAH</span>
          <span className="font-mono">
            {fmtPrice(row.prev_vah)}
            {prevLabel && <span className="ml-1 font-sans">（{prevLabel}）</span>}
          </span>
        </div>
      </div>

      {/* 指標 */}
      <div className="px-3 pt-2 grid grid-cols-3 gap-2">
        <Metric
          label="売買代金"
          value={isNum(row.turnover_oku) ? `${row.turnover_oku.toFixed(1)}億` : '—'}
          title="売買代金 20日平均（億円/日）"
        />
        <Metric label="ADR%" value={fmt(row.adr_pct)} title="ADR%（20日）= 日中ボラの目安" />
        <Metric label="52w高" value={fmtSignedPct(row.dist_from_high_pct)} title="52週高値からの乖離(%)。0 に近いほど高値圏" />
      </div>

      {/* アクション */}
      <div className="px-3 pt-2 pb-2 mt-2 border-t border-[var(--border-subtle)] flex items-center justify-end gap-1.5">
        <CopyTickerButton code={row.code} />
        {onAddPosition && (
          <button
            onClick={() => onAddPosition(row)}
            className="px-2 py-1 text-caption font-medium text-[var(--sem-strong-fg)] bg-[var(--sem-ok-bg)] hover:brightness-95 border border-[var(--sem-strong-bd)] rounded transition-colors"
            title="Position として保存"
          >
            ＋ Position
          </button>
        )}
      </div>
    </div>
  )
}
