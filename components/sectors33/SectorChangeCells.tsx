'use client'

import {
  CHANGE_PERIODS,
  type SectorIndexChangeEntry,
} from '@/lib/sectorIndexChangeFetch'
import Tooltip from '@/components/shared/Tooltip'

function isNum(v: number | null | undefined): v is number {
  return v !== null && v !== undefined && Number.isFinite(v)
}

// 騰落率は倍率−1（0.067 = +6.7%）なので ×100 で%化。
function fmtSignedPct(v: number | null | undefined, decimals = 1): string {
  if (!isNum(v)) return '—'
  const p = v * 100
  return `${p >= 0 ? '+' : ''}${p.toFixed(decimals)}%`
}

function pctColor(v: number | null | undefined): string {
  if (!isNum(v) || v === 0) return 'var(--text-muted)'
  return v > 0 ? 'var(--positive)' : 'var(--negative)'
}

function tooltipFor(
  label: string,
  tradingDays: number,
  entry: SectorIndexChangeEntry | undefined,
  key: (typeof CHANGE_PERIODS)[number]['key'],
): string {
  const c = entry?.changes[key]
  const base = `${label} 騰落率（${tradingDays}営業日前の業種指数終値との比較）`
  if (!c || !isNum(c.pct)) return `${base} — 指数データなし`
  return `${base}: ${c.fromDate} → ${entry?.baseDate ?? ''}`
}

/**
 * 1D / 1W / 1M / 6M / 1Y の騰落率をインラインで並べる（テーブルの業種名の横用）。
 */
export function SectorChangeInline({
  entry,
}: {
  entry: SectorIndexChangeEntry | undefined
}) {
  return (
    <span className="inline-flex items-center gap-2">
      {CHANGE_PERIODS.map(p => {
        const c = entry?.changes[p.key]
        return (
          <Tooltip key={p.key} content={tooltipFor(p.label, p.tradingDays, entry, p.key)}>
            <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
              <span className="text-[10px] text-[var(--text-muted)] font-mono">{p.label}</span>
              <span
                className="font-mono text-[11px] font-semibold tabular-nums"
                style={{ color: pctColor(c?.pct) }}
              >
                {fmtSignedPct(c?.pct)}
              </span>
            </span>
          </Tooltip>
        )
      })}
    </span>
  )
}

/**
 * 同じ期間を等幅の箱で並べる（チャートカード用）。
 */
export function SectorChangeStrip({
  entry,
}: {
  entry: SectorIndexChangeEntry | undefined
}) {
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {CHANGE_PERIODS.map(p => {
        const c = entry?.changes[p.key]
        return (
          <div
            key={p.key}
            className="rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-1.5 py-1 text-center"
          >
            <Tooltip content={tooltipFor(p.label, p.tradingDays, entry, p.key)}>
              <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">
                {p.label}
              </p>
            </Tooltip>
            <p
              className="text-sm font-mono font-bold tabular-nums"
              style={{ color: pctColor(c?.pct) }}
            >
              {fmtSignedPct(c?.pct)}
            </p>
          </div>
        )
      })}
    </div>
  )
}
