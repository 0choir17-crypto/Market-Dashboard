'use client'

import type { BoxBreakoutRow } from '@/types/boxBreakout'
import { boxStatusMeta } from '@/types/boxBreakout'
import { formatPct } from '@/lib/format'
import { tradingViewUrl, shikihoUrl } from '@/lib/tickerLinks'

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

// 売買代金（億円）。「○○億」表記。
function fmtOku(v: number | null | undefined): string {
  if (!isNum(v)) return '—'
  return `${v >= 100 ? Math.round(v).toLocaleString('ja-JP') : v.toFixed(1)}億`
}

// MM-DD 表記（仮ブレイク日など）。
function fmtMd(v: string | null | undefined): string {
  if (!v) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v)
  return m ? `${m[2]}-${m[3]}` : v
}

// 箱形成 → ブレイクまでの営業日数。フル箱長(base_len) と 実効ベース長(eff_base_len) を
// 「フル→実効」で併記する（両方あれば base→eff、片方だけならその値）。
function fmtFormationDays(base: number | null | undefined, eff: number | null | undefined): string {
  const b = isNum(base) ? Math.round(base) : null
  const e = isNum(eff) ? Math.round(eff) : null
  if (b !== null && e !== null) return b === e ? `${b}日` : `${b}→${e}日`
  if (b !== null) return `${b}日`
  if (e !== null) return `${e}日`
  return '—'
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

export default function BoxBreakoutCard({ row, hot = false, multiHit = false, onAddWatchlist, onAddPosition }: Props) {
  const meta = boxStatusMeta(row.status)
  const confirmed = row.status === 'CONFIRMED'

  // 上抜幅: 仮ブレイク終値が天井(pivot)をどれだけ超えたか（%）。
  const breakPct =
    isNum(row.close_break) && isNum(row.pivot) && row.pivot !== 0
      ? (row.close_break / row.pivot - 1) * 100
      : null

  // 枠/背景: 複数シグナル重複（黄）を最優先 → 確定（緑）→ hotセクター（緑）。既存カードと同方針。
  const borderColor = multiHit ? '#fbbf24' : confirmed ? '#86efac' : hot ? '#86efac' : '#e8eaed'
  const backgroundColor = multiHit ? '#fef9c3' : confirmed ? '#f0fdf4' : hot ? '#f0fdf4' : '#ffffff'

  return (
    <div
      className="bg-white rounded-lg border shadow-sm hover:shadow-md transition-shadow flex flex-col"
      style={{ borderColor, backgroundColor }}
    >
      {/* バッジ行: ステータス / 150日線トレンド / 上抜日 */}
      <div className="px-3 py-2 border-b border-[#f0f2f4] flex items-center gap-1.5 flex-wrap">
        <Chip text={meta.label} palette={meta.palette} title={meta.title} />
        {row.trend_150 === true && (
          <Chip
            text="150↑"
            palette={{ bg: '#dbeafe', fg: '#1e40af', border: '#93c5fd' }}
            title="trend_150=true: 終値>150日線 かつ 傾き上向き（より強いトレンドの目印）"
          />
        )}
        <span
          className="ml-auto text-[10px] text-[var(--text-muted)] font-mono"
          title={
            confirmed
              ? `確定日: ${row.confirm_date ?? '—'}`
              : '仮ブレイク日（この日に天井を上抜けた）。status は後日 CONFIRMED / FAILED に更新される'
          }
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

      {/* 共通4枠: 固有指標①(上抜線) / 52w高 / 固有指標②(防衛線, ADR の代わり) / 強さ(RS) */}
      <div className="px-3 grid grid-cols-2 gap-2">
        <Metric
          label="上抜線"
          value={fmtPrice(row.pivot)}
          color="var(--positive)"
          title={`pivot: 箱の天井＝上抜けた基準線。チャートに引く上側の線${
            isNum(breakPct) ? `（終値は +${breakPct.toFixed(1)}% 上）` : ''
          }`}
        />
        <Metric label="52w高" value={fmtSignedPct(row.dist_from_high_pct)} title="52週高値からの距離(%)。0付近=新高値接近（上場1年未満は null）" />
        <Metric
          label="防衛線"
          value={fmtPrice(row.eff_box_low)}
          color="var(--negative)"
          title="eff_box_low: 実効下限＝直近40本の最安値。いま機能している防衛ライン（チャート下側の線 / ストップ目安）"
        />
        <Metric
          label="RS"
          value={fmt(row.rs_topix_avg, 0)}
          color={rsColor(row.rs_topix_avg)}
          title="対TOPIX 相対強度（50=市場並み）。box では選抜に未使用の注釈値"
        />
      </div>

      {/* 参考: 実効ベースの高さ / 箱形成→ブレイクまでの営業日数 / 売買代金 / 跳ね返され回数。
          形成日数はフル箱長(base_len)→実効ベース長(eff_base_len)。base_len ≫ eff_base_len は
          ジリ上げトレンド途中の踊り場（質の見分け用）。 */}
      <div
        className="px-3 mt-2 text-[10px] text-[var(--text-secondary)] tabular-nums flex items-center gap-x-2 gap-y-0.5 flex-wrap"
        title={`実効ベース高 ${fmt(row.eff_height_pct)}% / 箱形成→ブレイク: フル箱 ${fmt(
          row.base_len,
          0,
        )}営業日（成立 ${row.armed_date ?? '—'}）→ 実効ベース ${fmt(
          row.eff_base_len,
          0,
        )}営業日（起点 ${row.eff_low_date ?? '—'}）/ 20日平均代金 ${fmtOku(row.turnover_oku)} / 失敗 ${fmt(
          row.n_fail,
          0,
        )}回`}
      >
        <span>高 {fmt(row.eff_height_pct)}%</span>
        <span className="text-[var(--text-muted)]">·</span>
        <span title="箱形成→ブレイクまでの営業日数（フル箱長→実効ベース長）">
          形成 {fmtFormationDays(row.base_len, row.eff_base_len)}
        </span>
        <span className="text-[var(--text-muted)]">·</span>
        <span>{fmtOku(row.turnover_oku)}</span>
        {isNum(row.n_fail) && row.n_fail > 0 && (
          <>
            <span className="text-[var(--text-muted)]">·</span>
            <span className="text-[var(--negative)]" title="このベース内で天井に跳ね返された回数">
              失敗{row.n_fail}
            </span>
          </>
        )}
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
