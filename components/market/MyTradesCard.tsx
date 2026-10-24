'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Modal from '@/components/shared/Modal'
import TickerCell from '@/components/shared/TickerCell'
import LineHistoryChart from '@/components/chart/LineHistoryChart'
import { BREADTH_SERIES } from '@/lib/chartColors'
import { pnlColorClass } from '@/lib/format'
import { RECENT_TRADES, fetchMyTradesState, type EquityPoint, type MyTradesState } from '@/lib/myTradesState'
import { CardButton } from './trendAtoms'

// 自分の成績。Market Regime の上の列に置く（混乱したら自分の資産曲線だけ見ればいい、という考え方）。
// 色の判定は持たない。損益率の符号の緑赤は損益色（docs/DESIGN_DIRECTION.md 3.2）で、判定ではない。
// 成績は損益率（%）。初期ストップの記録がたまったら R に切り替える（lib/myTradesState.ts 冒頭）。
// トレード記録は日付ピッカーに連動させず、常に最新を出す。

const fmtPct = (v: number | null) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`)

const EQUITY_LINES = [
  { key: 'cumPct', label: '損益率の累計', color: BREADTH_SERIES.sma50, width: 2 },
  { key: 'ma', label: `直近 ${RECENT_TRADES} 件の平均`, color: BREADTH_SERIES.sma150 },
] as const

/** 同じ日に複数決済があるとチャートの時刻が重なるので、日ごとの最後の値にまとめる */
function byDay(points: EquityPoint[]): EquityPoint[] {
  const m = new Map<string, EquityPoint>()
  for (const p of points) m.set(p.date, p)
  return [...m.values()]
}

/** 損益率の累計の小さな折れ線（直近 20 点） */
function Sparkline({ points }: { points: EquityPoint[] }) {
  const pts = points.slice(-20)
  if (pts.length < 2) return null
  const vals = pts.map((p) => p.cumPct)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = max - min || 1
  const d = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${(i / (pts.length - 1)) * 100},${28 - ((p.cumPct - min) / span) * 26 - 1}`)
    .join(' ')
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="w-full h-7" aria-hidden>
      <path d={d} fill="none" stroke="var(--text-secondary)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="font-mono tabular-nums text-[var(--text-primary)]">{children}</span>
    </div>
  )
}

function PctValue({ v }: { v: number | null }) {
  return <span className={`font-medium ${pnlColorClass(v)}`}>{fmtPct(v)}</span>
}

function MyTradesModal({ s, onClose }: { s: MyTradesState; onClose: () => void }) {
  const points = useMemo(() => byDay(s.equity), [s.equity])
  return (
    <Modal open onClose={onClose} title="My Trades" size="xl">
      <div className="p-6 space-y-5">
        <div>
          <p className="text-small font-medium text-[var(--text-primary)] mb-2">資産曲線（損益率の累計・決済順）</p>
          <LineHistoryChart points={points} lines={EQUITY_LINES} format={(v) => fmtPct(v)} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div>
            <p className="text-small font-medium text-[var(--text-primary)] mb-2">
              保有中 <span className="font-mono text-[var(--text-muted)]">{s.open.length}</span>
            </p>
            {s.open.length === 0 ? (
              <p className="text-caption text-[var(--text-muted)]">なし</p>
            ) : (
              <table className="w-full text-small">
                <thead className="text-caption text-[var(--text-muted)]">
                  <tr>
                    <th className="text-left font-medium py-1">Code / Name</th>
                    <th className="text-left font-medium py-1">Entry</th>
                    <th className="text-right font-medium py-1">%</th>
                    <th className="text-right font-medium py-1">現在値の日付</th>
                  </tr>
                </thead>
                <tbody>
                  {s.open.map((o) => (
                    <tr key={o.id} className="border-t border-[var(--border)]">
                      <td className="py-1 max-w-[180px]"><TickerCell code={o.ticker} name={o.company_name} /></td>
                      <td className="py-1 font-mono text-caption text-[var(--text-secondary)]">{o.entry_date}</td>
                      <td className="py-1 text-right font-mono tabular-nums"><PctValue v={o.pct} /></td>
                      <td className="py-1 text-right font-mono text-caption text-[var(--text-muted)]">{o.priceDate ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="text-caption text-[var(--text-muted)] mt-1">
              現在値は daily_signals の直近の終値。スキャナーに出なくなった銘柄は日付が古くなる
            </p>
          </div>

          <div>
            <p className="text-small font-medium text-[var(--text-primary)] mb-2">直近 {RECENT_TRADES} 件の決済</p>
            {s.recent.length === 0 ? (
              <p className="text-caption text-[var(--text-muted)]">なし</p>
            ) : (
              <table className="w-full text-small">
                <thead className="text-caption text-[var(--text-muted)]">
                  <tr>
                    <th className="text-left font-medium py-1">Code / Name</th>
                    <th className="text-left font-medium py-1">Exit</th>
                    <th className="text-right font-medium py-1">%</th>
                  </tr>
                </thead>
                <tbody>
                  {s.recent.map((t) => (
                    <tr key={t.id} className="border-t border-[var(--border)]">
                      <td className="py-1 max-w-[200px]"><TickerCell code={t.ticker} name={t.company_name} /></td>
                      <td className="py-1 font-mono text-caption text-[var(--text-secondary)]">{t.exit_date}</td>
                      <td className="py-1 text-right font-mono tabular-nums"><PctValue v={t.pct} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <p className="text-caption">
          <Link href="/journal" className="text-[var(--accent)] hover:underline">
            Trading の画面を開く →
          </Link>
        </p>
      </div>
    </Modal>
  )
}

export default function MyTradesCard() {
  const [s, setS] = useState<MyTradesState | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchMyTradesState().then((res) => {
      if (!cancelled) setS(res)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const last = s?.equity.at(-1)
  return (
    <>
      <CardButton onClick={() => setOpen(true)} label="My Trades" className="p-5">
        <h3 className="text-small font-medium text-[var(--text-primary)]">My Trades</h3>
        {!s ? (
          <p className="mt-3 text-small text-[var(--text-muted)]">読み込み中…</p>
        ) : s.error ? (
          <p className="mt-3 text-small text-[var(--sem-weak-fg)]">取得エラー: {s.error}</p>
        ) : (
          <div className="mt-3 space-y-1.5 text-small">
            <Line label="保有中の含み益（平均）">
              {s.openInProfit} / {s.openPriced}
              <span className="ml-2"><PctValue v={s.openAvgPct} /></span>
            </Line>
            <Line label={`直近 ${RECENT_TRADES} 件（平均）`}>
              {s.recentWins}勝 {s.recentLosses}敗
              <span className="ml-2"><PctValue v={s.recentAvgPct} /></span>
            </Line>
            <Line label="連敗">{s.lossStreak}</Line>
            <div className="pt-2 mt-1 border-t border-[var(--border)]">
              <div className="flex items-baseline justify-between gap-2 text-caption">
                <span className="text-[var(--text-muted)]">資産曲線（損益率の累計）</span>
                <span className="font-mono text-[var(--text-secondary)]">
                  {last?.ma == null ? '—' : `${RECENT_TRADES} 件平均の${last.cumPct >= last.ma ? '上' : '下'}`}
                </span>
              </div>
              <Sparkline points={s.equity} />
            </div>
          </div>
        )}
      </CardButton>
      {open && s && !s.error && <MyTradesModal s={s} onClose={() => setOpen(false)} />}
    </>
  )
}
