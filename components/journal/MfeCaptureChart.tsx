'use client'

// MFE（保有中の最大含み益）と実際の決済 R の散布図。
//   対角線 y = x に近い … 伸ばしきって降りた
//   対角線より下で y > 0 … 早降り（取り逃し）
//   x ≥ +2R なのに y ≤ 0 … 含み益を全部吐き出した（最優先で直す負け方）
// MFE は daily_signals の終値ベース（lib/mfeMae.ts）なので日中高値は入らず、やや小さめに出る。

import { useMemo, useState } from 'react'
import { Trade } from '@/types/trades'
import { R_BASIS_LABEL, R_UNIT, rOf, RBasis } from '@/lib/rStats'
import { mfeReliable } from '@/lib/tradeFlags'

/** この MFE(R) に達したのに損で終わったものを「吐き出し」と数える */
const GAVE_BACK_MFE_R = 2

type Pt = { id: number; ticker: string; exitDate: string | null; mfeR: number; r: number; gaveBack: boolean }

/** MFE を縦軸と同じ基準に直す（縦軸と単位を揃えないと y = x が意味を失う） */
function mfeIn(t: Trade, basis: RBasis): number | null {
  if (basis === 'atr') {
    return t.mfe_price != null && t.atr_at_entry != null && t.atr_at_entry > 0
      ? (t.mfe_price - t.entry_price) / t.atr_at_entry
      : null
  }
  const stop = t.initial_stop ?? null
  if (t.mfe_price != null && stop != null && t.entry_price > stop) {
    return (t.mfe_price - t.entry_price) / (t.entry_price - stop)
  }
  if (t.mfe_pct != null && t.init_risk_pct != null && t.init_risk_pct > 0) {
    return t.mfe_pct / t.init_risk_pct
  }
  return null
}

function fmtU(v: number, u: string): string {
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}${u}`
}

const W = 640
const H = 300
const PAD = { l: 44, r: 12, t: 12, b: 32 }

function niceTicks(min: number, max: number): number[] {
  const span = max - min
  const step = span <= 6 ? 1 : span <= 15 ? 2 : span <= 40 ? 5 : 10
  const out: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(v)
  return out
}

export default function MfeCaptureChart({
  trades,
  basis,
  onSelect,
}: {
  trades: Trade[]
  basis: RBasis
  onSelect?: (tradeId: number) => void
}) {
  const [hover, setHover] = useState<Pt | null>(null)
  const u = R_UNIT[basis]
  const fmtR = (v: number) => fmtU(v, u)

  const pts = useMemo<Pt[]>(() => trades
    .filter(t => t.status === 'closed' && rOf(t, basis) != null && mfeReliable(t))
    .map(t => {
      const mfeR = mfeIn(t, basis)
      if (mfeR == null || !Number.isFinite(mfeR)) return null
      const r = rOf(t, basis) as number
      return { id: t.id, ticker: t.ticker, exitDate: t.exit_date, mfeR, r, gaveBack: mfeR >= GAVE_BACK_MFE_R && r <= 0 }
    })
    .filter((p): p is Pt => p != null), [trades, basis])

  if (pts.length === 0) return null

  // 捕獲率は MFE が +1R 以上あったものだけ（小さい MFE で割ると値が暴れる）
  const capt = pts.filter(p => p.mfeR >= 1).map(p => p.r / p.mfeR)
  const avgCapture = capt.length > 0 ? capt.reduce((a, b) => a + b, 0) / capt.length * 100 : null
  const gaveBack = pts.filter(p => p.gaveBack).length
  const earlyExit = pts.filter(p => p.r > 0 && p.mfeR >= 2 * p.r && p.mfeR >= 2).length

  const xMin = Math.min(0, ...pts.map(p => p.mfeR))
  const xMax = Math.max(1, ...pts.map(p => p.mfeR)) * 1.05
  const yMin = Math.min(-1.2, ...pts.map(p => p.r))
  const yMax = Math.max(1, ...pts.map(p => p.r)) * 1.05
  const x = (v: number) => PAD.l + (v - xMin) / (xMax - xMin) * (W - PAD.l - PAD.r)
  const y = (v: number) => H - PAD.b - (v - yMin) / (yMax - yMin) * (H - PAD.t - PAD.b)
  const diagEnd = Math.min(xMax, yMax)
  const diagStart = Math.max(xMin, yMin, 0)

  return (
    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <h3 className="text-small font-medium text-[var(--text-primary)]">
          MFE vs 決済 {u}（伸ばしきれたか）
          <span className="ml-2 text-caption font-normal text-[var(--text-muted)]">{R_BASIS_LABEL[basis]}</span>
        </h3>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-[var(--text-secondary)] num">
          <span>平均捕獲率 <strong className="text-[var(--text-primary)]">{avgCapture != null ? `${avgCapture.toFixed(0)}%` : '—'}</strong></span>
          <span>早降り <strong className="text-[var(--text-primary)]">{earlyExit}</strong></span>
          <span>
            +{GAVE_BACK_MFE_R}{u}→損 <strong className={gaveBack > 0 ? 'text-[var(--negative)]' : 'text-[var(--text-primary)]'}>{gaveBack}</strong>
          </span>
          <span className="text-[var(--text-muted)]">n={pts.length}</span>
        </div>
      </div>

      <div className="relative max-w-[720px] mx-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="MFE と決済 R の散布図">
          {/* grid + ticks */}
          {niceTicks(yMin, yMax).map(v => (
            <g key={`y${v}`}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth={v === 0 ? 1 : 0.5} />
              <text x={PAD.l - 6} y={y(v) + 3} textAnchor="end" fontSize="10" fill="var(--text-muted)">{v}{u}</text>
            </g>
          ))}
          {niceTicks(xMin, xMax).map(v => (
            <g key={`x${v}`}>
              <line x1={x(v)} x2={x(v)} y1={PAD.t} y2={H - PAD.b} stroke="var(--border)" strokeWidth={v === 0 ? 1 : 0.5} />
              <text x={x(v)} y={H - PAD.b + 14} textAnchor="middle" fontSize="10" fill="var(--text-muted)">{v}{u}</text>
            </g>
          ))}
          <text x={(W + PAD.l) / 2} y={H - 4} textAnchor="middle" fontSize="10" fill="var(--text-secondary)">MFE（最大含み益, {u}）</text>
          <text x={10} y={(H - PAD.b + PAD.t) / 2} textAnchor="middle" fontSize="10" fill="var(--text-secondary)"
                transform={`rotate(-90 10 ${(H - PAD.b + PAD.t) / 2})`}>決済 {u}</text>

          {/* y = x: 最大含み益で降りた線 */}
          <line x1={x(diagStart)} y1={y(diagStart)} x2={x(diagEnd)} y2={y(diagEnd)}
                stroke="var(--text-muted)" strokeWidth={1} strokeDasharray="4 3" />
          <text x={x(diagEnd) - 4} y={y(diagEnd) + 12} textAnchor="end" fontSize="10" fill="var(--text-muted)">y = x</text>

          {/* points */}
          {pts.map(p => {
            const color = p.r > 0 ? 'var(--positive)' : p.r < 0 ? 'var(--negative)' : 'var(--sem-idle-fg)'
            const active = hover?.id === p.id
            return (
              <g key={p.id}
                 onMouseEnter={() => setHover(p)}
                 onMouseLeave={() => setHover(h => (h?.id === p.id ? null : h))}
                 onClick={() => onSelect?.(p.id)}
                 style={{ cursor: onSelect ? 'pointer' : undefined }}>
                {/* 当たり判定は点より大きく */}
                <circle cx={x(p.mfeR)} cy={y(p.r)} r={10} fill="transparent" />
                <circle cx={x(p.mfeR)} cy={y(p.r)} r={active ? 6 : 4.5}
                        fill={color} fillOpacity={p.gaveBack ? 1 : 0.75}
                        stroke={p.gaveBack ? 'var(--text-primary)' : 'var(--bg-card)'} strokeWidth={p.gaveBack ? 1.5 : 2} />
              </g>
            )
          })}
        </svg>

        {hover && (
          <div
            className="absolute pointer-events-none bg-[var(--bg-card)] border border-[var(--border-strong)] rounded-md shadow-sm px-2 py-1 text-caption num text-[var(--text-primary)] whitespace-nowrap"
            style={{
              left: `${(x(hover.mfeR) / W) * 100}%`,
              top: `${(y(hover.r) / H) * 100}%`,
              transform: `translate(${x(hover.mfeR) > W * 0.7 ? 'calc(-100% - 10px)' : '10px'}, -50%)`,
            }}
          >
            <span className="font-mono font-medium">{hover.ticker}</span>
            <span className="text-[var(--text-muted)] ml-1">{hover.exitDate ?? ''}</span>
            <div>MFE {fmtR(hover.mfeR)} → 決済 {fmtR(hover.r)}</div>
            {hover.mfeR >= 1 && <div className="text-[var(--text-muted)]">捕獲率 {(hover.r / hover.mfeR * 100).toFixed(0)}%</div>}
          </div>
        )}
      </div>

      <p className="text-caption text-[var(--text-muted)] mt-1">
        捕獲率 = 決済 ÷ MFE（MFE +1{u} 以上のみ）。早降り = 勝ちだが MFE が決済の 2 倍以上（MFE +2{u} 以上）。
        縁取りの点 = +{GAVE_BACK_MFE_R}{u} 以上の含み益を出してから損で終了。同日決済は買う前の高値と区別できないため除外。
        {onSelect && ' 点をクリックで振り返りを開く。'}
      </p>
    </div>
  )
}
