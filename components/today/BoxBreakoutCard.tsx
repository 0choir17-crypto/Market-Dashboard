'use client'

import type { BoxBreakoutRow } from '@/types/boxBreakout'
import { formatPct } from '@/lib/format'
import { tradingViewUrl, shikihoUrl } from '@/lib/tickerLinks'
import ChartButton from '@/components/today/ChartButton'
import LazyChart from '@/components/today/LazyChart'

type Props = {
  row: BoxBreakoutRow
  hot?: boolean
  multiHit?: boolean
  onAddWatchlist?: (row: BoxBreakoutRow) => void
  onAddPosition?: (row: BoxBreakoutRow) => void
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

// 価格系（pivot / close_break / eff_box_low）は銘柄の桁に合わせて 3桁区切り。
function fmtPrice(v: number | null | undefined): string {
  return isNum(v) ? v.toLocaleString('ja-JP', { maximumFractionDigits: 1 }) : '—'
}

// MM-DD 表記（仮ブレイク日など）。
function fmtMd(v: string | null | undefined): string {
  if (!v) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v)
  return m ? `${m[2]}-${m[3]}` : v
}

// ベースの長さ表記。主表示は eff_base_len（今見えている直近ベース）、スパン（箱追跡全体の
// base_len）が異なる場合のみ「(全○日)」で括弧併記する。例「21日(全84日)」。
function fmtBaseLen(eff: number | null | undefined, span: number | null | undefined): string {
  const e = isNum(eff) ? Math.round(eff) : null
  const s = isNum(span) ? Math.round(span) : null
  if (e === null) return s !== null ? `全${s}日` : '—'
  if (s === null || s === e) return `${e}日`
  return `${e}日(全${s}日)`
}

// rs (0–100 目安, 高いほど強い)。box では選抜未使用の注釈値。
function rsColor(v: number | null | undefined): string {
  if (!isNum(v)) return 'var(--text-muted)'
  if (v >= 80) return 'var(--positive)'
  if (v >= 60) return 'var(--accent)'
  if (v >= 40) return 'var(--text-secondary)'
  return 'var(--negative)'
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

// 1 タイルに 2 情報を積んで表示（レジスタンス/サポート、length/armed など）。
function DualMetric({
  a,
  b,
  title,
}: {
  a: { k: string; v: string; color?: string }
  b: { k: string; v: string; color?: string }
  title?: string
}) {
  return (
    <div className="rounded bg-[var(--bg-card-hover)] border border-[#f0f2f4] px-2 py-1.5" title={title}>
      {[a, b].map((r, i) => (
        <div key={i} className={i === 0 ? '' : 'mt-1'}>
          <p className="text-[9px] font-medium uppercase tracking-wide text-[var(--text-secondary)] leading-tight">{r.k}</p>
          <p
            className="font-mono text-[13px] font-semibold leading-tight tabular-nums"
            style={{ color: r.color ?? 'var(--text-primary)' }}
          >
            {r.v}
          </p>
        </div>
      ))}
    </div>
  )
}

export default function BoxBreakoutCard({ row, hot = false, multiHit = false, onAddWatchlist, onAddPosition }: Props) {
  // 上抜幅: 仮ブレイク終値がレジスタンス(pivot)をどれだけ超えたか（%）。
  const breakPct =
    isNum(row.close_break) && isNum(row.pivot) && row.pivot !== 0
      ? (row.close_break / row.pivot - 1) * 100
      : null

  // テスト回数（このベース内で天井に跳ね返された回数）。
  const testCount = isNum(row.n_fail) ? Math.round(row.n_fail) : null

  // 間延び: スパン(base_len) がベース(eff_base_len) より大きく開く＝じわ上げトレンド途中の
  // 踊り場の目印。綺麗なベースでは両者ほぼ同じ。
  const drawnOut =
    isNum(row.base_len) &&
    isNum(row.eff_base_len) &&
    row.base_len >= row.eff_base_len * 2 &&
    row.base_len - row.eff_base_len >= 20

  // 枠/背景: 複数シグナル重複（黄）を最優先 → hotセクター（緑）。既存カードと同方針。
  const borderColor = multiHit ? '#fbbf24' : hot ? '#86efac' : '#e8eaed'
  const backgroundColor = multiHit ? '#fef9c3' : hot ? '#f0fdf4' : '#ffffff'

  return (
    <div
      className="bg-white rounded-lg border shadow-sm hover:shadow-md transition-shadow flex flex-col"
      style={{ borderColor, backgroundColor }}
    >
      {/* バッジ行: テスト回数 / 間延び / 上抜日 */}
      <div className="px-3 py-2 border-b border-[#f0f2f4] flex items-center gap-1.5 flex-wrap">
        <Chip
          text={`テスト ${testCount ?? '—'}`}
          palette={{ bg: '#f3f4f6', fg: '#4b5563', border: '#d1d5db' }}
          title="このベース内で天井（レジスタンス）に跳ね返された回数（テスト回数）"
        />
        {drawnOut && (
          <Chip
            text="間延び"
            palette={{ bg: '#fef3c7', fg: '#92400e', border: '#fcd34d' }}
            title="スパン（箱追跡全体）がベース（直近の揉み合い）より大きく開いている＝じわ上げトレンド途中の踊り場の目印"
          />
        )}
        <span
          className="ml-auto text-[10px] text-[var(--text-muted)] font-mono"
          title="仮ブレイク日（この日にレジスタンスを上抜けた）"
        >
          上抜 {fmtMd(row.date)}
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
          <p className="font-mono text-sm font-semibold text-[var(--text-primary)] tabular-nums leading-tight">
            {fmtPrice(row.close_break)}
          </p>
        </div>
      </div>

      {/* 4枠: レジスタンス/サポート（2値1枠）/ 52w高 / length・armed（2値1枠）/ 強さ(RS) */}
      <div className="px-3 grid grid-cols-2 gap-2">
        <DualMetric
          a={{ k: 'レジスタンス', v: fmtPrice(row.pivot), color: 'var(--positive)' }}
          b={{ k: 'サポート', v: fmtPrice(row.eff_box_low), color: 'var(--negative)' }}
          title={`レジスタンス(pivot): 箱の天井＝上抜けた基準線（チャート上側の線）${
            isNum(breakPct) ? `。終値は +${breakPct.toFixed(1)}% 上` : ''
          } / サポート(eff_box_low): 実効下限＝直近40本の最安値。いま機能している防衛ライン（チャート下側の線 / ストップ目安）`}
        />
        <Metric label="52w高" value={fmtSignedPct(row.dist_from_high_pct)} title="52週高値からの距離(%)。0付近=新高値接近（上場1年未満は null）" />
        <DualMetric
          a={{ k: '起点', v: row.eff_low_date ?? '—' }}
          b={{ k: 'ベース', v: fmtBaseLen(row.eff_base_len, row.base_len) }}
          title="起点: 今見えている直近ベースの起点＝直近40本の安値を付けた日（eff_low_date）。ベース: そのベースの長さ（eff_base_len 営業日）。括弧内はスパン＝箱追跡全体の長さ（base_len）"
        />
        <Metric
          label="RS"
          value={fmt(row.rs_topix_avg, 0)}
          color={rsColor(row.rs_topix_avg)}
          title="対TOPIX 相対強度（50=市場並み）。box では選抜に未使用の注釈値"
        />
      </div>

      {/* インライン・チャート（遅延読込・操作不要） */}
      <div className="px-3 pt-2">
        <LazyChart code={row.code} />
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
