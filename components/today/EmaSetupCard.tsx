'use client'

import type { EmaSetupCardRow, EmaTouch } from '@/types/emaSetups'
import { resolveTouchType } from '@/types/emaSetups'
import { formatPct } from '@/lib/format'
import { tradingViewUrl, shikihoUrl } from '@/lib/tickerLinks'
import CopyTickerButton from '@/components/shared/CopyTickerButton'

type Props = {
  row: EmaSetupCardRow
  hot?: boolean
  multiHit?: boolean
  onAddPosition?: (row: EmaSetupCardRow) => void
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

// rs (0–100, 高いほど強い)。他カードと同じ配色。
function rsColor(v: number | null): string {
  if (!isNum(v)) return 'var(--text-muted)'
  if (v >= 80) return 'var(--positive)'
  if (v >= 60) return 'var(--accent)'
  if (v >= 40) return 'var(--text-secondary)'
  return 'var(--negative)'
}

// EMA バッジは「どの EMA にタッチしたか」という事実の表示であって優劣ではない。
// 9 / 21 / 50 を色で格付けせず、全て同じ中立色。ヒゲ / 実体は塗りの有無だけで区別する
// （検証上どちらが有利という情報は無い ＝ AUC 0.50）。
function TouchBadge({ touch }: { touch: EmaTouch }) {
  const type = resolveTouchType(touch)
  const filled = type === 'BODY'
  const typeLabel = type === 'BODY' ? '実体' : type === 'WICK' ? 'ヒゲ' : '—'
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-caption font-medium tabular-nums border"
      style={{
        backgroundColor: filled ? 'var(--sem-idle-bd)' : 'transparent',
        color: 'var(--text-secondary)',
        borderColor: 'var(--border-strong)',
      }}
      title={
        `EMA${touch.ema} にタッチ（${typeLabel}）\n` +
        `EMA値 ${fmtPrice(touch.ema_value)} / 安値ATR ${fmt(touch.low_atr, 3)}` +
        (touch.fresh ? '\n直近10営業日で同じ EMA へのタッチは初回' : '')
      }
    >
      <span className="font-mono">{touch.ema}</span>
      <span className="font-normal opacity-70">{typeLabel}</span>
      {touch.fresh && <span className="text-caption text-[var(--sem-watch-fg)]" title="初回">初</span>}
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

export default function EmaSetupCard({
  row,
  hot = false,
  multiHit = false,
  onAddPosition,
}: Props) {
  return (
    <div
      className="bg-[var(--bg-card)] rounded-lg border shadow-sm hover:shadow-md transition-shadow flex flex-col"
      style={{
        borderColor: multiHit ? 'var(--sem-watch-bd)' : hot ? 'var(--sem-strong-bd)' : 'var(--border)',
        backgroundColor: multiHit ? 'var(--sem-watch-bg)' : hot ? 'var(--sem-ok-bg)' : 'var(--bg-card)',
      }}
    >
      {/* タッチした EMA（同日に複数 EMA へタッチした銘柄はここに並ぶ） */}
      <div className="px-3 py-2 border-b border-[var(--border-subtle)] flex items-center gap-1 flex-wrap">
        {row.touches.map(t => (
          <TouchBadge key={t.ema} touch={t} />
        ))}
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
          <div
            className="mt-0.5 text-caption truncate"
            style={{ color: hot ? 'var(--positive)' : 'var(--text-secondary)' }}
            title={row.sector_s33 ?? ''}
          >
            {row.sector_s33 ?? '—'}
          </div>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="text-caption font-medium uppercase tracking-wide text-[var(--text-muted)] leading-tight">Close</p>
          <p className="font-mono text-small font-medium text-[var(--text-primary)] tabular-nums leading-tight">
            {fmtPrice(row.close)}
          </p>
        </div>
      </div>

      {/* タッチの内訳（EMA 値 / 安値ATR）。安値ATR は (安値 − EMA) / ATR14(前日)。 */}
      <div className="px-3 space-y-0.5">
        {row.touches.map(t => (
          <div
            key={t.ema}
            className="flex items-baseline justify-between gap-2 text-caption text-[var(--text-secondary)] tabular-nums"
          >
            <span className="font-mono">EMA{t.ema}</span>
            <span className="font-mono">{fmtPrice(t.ema_value)}</span>
            <span className="font-mono" title="安値ATR = (安値 − EMA) / ATR14(前日)。定義上 0 〜 −0.10">
              安値ATR {fmt(t.low_atr, 3)}
            </span>
          </div>
        ))}
      </div>

      {/* 指標 */}
      <div className="px-3 pt-2 grid grid-cols-2 gap-2">
        <Metric
          label="売買代金"
          value={isNum(row.turnover_oku) ? `${row.turnover_oku.toFixed(1)}億` : '—'}
          title="売買代金 20日平均（億円/日）"
        />
        <Metric
          label="RS"
          value={fmt(row.rs_topix_avg, 0)}
          color={rsColor(row.rs_topix_avg)}
          title="対TOPIX RS 平均（21/63/126d）0-100"
        />
        <Metric label="52w高" value={fmtSignedPct(row.dist_from_high_pct)} title="52週高値からの乖離(%)。0 に近いほど高値圏" />
        <Metric label="ADR%" value={fmt(row.adr_pct)} title="ADR%（20日）= 日中ボラの目安" />
      </div>

      {/* 補助情報 */}
      <div className="px-3 pt-1.5 flex items-center justify-between gap-2 text-caption text-[var(--text-muted)] tabular-nums">
        <span className="font-mono" title="出来高比（対 20日平均）">
          出来高比 {fmt(row.vol_ratio, 2)}
        </span>
        <span className="font-mono" title="終値の 150SMA からの乖離(%)">
          150SMA {fmtSignedPct(row.ext_sma150_pct)}
        </span>
      </div>

      {/* アクション */}
      <div className="px-3 pt-2 pb-2 mt-2 border-t border-[var(--border-subtle)] flex items-center justify-end gap-1.5">
        {/* ウォッチリストの管理は TradingView 側。ここからできるのは
            TradingView に貼れる形でティッカーを渡すことまで。 */}
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
