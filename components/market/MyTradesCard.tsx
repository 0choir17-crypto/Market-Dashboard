'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Modal from '@/components/shared/Modal'
import TickerCell from '@/components/shared/TickerCell'
import LineHistoryChart from '@/components/chart/LineHistoryChart'
import { BREADTH_SERIES } from '@/lib/chartColors'
import { pnlColorClass } from '@/lib/format'
import { RECENT_TRADES, fetchMyTradesState, type EquityPoint, type MyTradesState } from '@/lib/myTradesState'

// 自分の成績。Market Regime の上の列に横いっぱいで置き、資産曲線をカードの中で大きく見せる
// （資産曲線こそ唯一の真実。判断の順番は常に自分から、という考え方）。
// 色の判定は持たない。損益率の符号の緑赤は損益色（docs/DESIGN_DIRECTION.md 3.2）で、判定ではない。
// 成績は損益率（%）。理由は lib/myTradesState.ts 冒頭。
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

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="font-mono tabular-nums text-[var(--text-primary)]">{children}</span>
    </div>
  )
}

/** 金額は万円で（例: +12.3万円）。1 万円未満は円 */
function fmtYen(v: number | null): string {
  if (v == null) return '—'
  const sign = v > 0 ? '+' : v < 0 ? '−' : ''
  const a = Math.abs(v)
  return a >= 10_000 ? `${sign}${(a / 10_000).toFixed(1)}万円` : `${sign}${Math.round(a).toLocaleString('ja-JP')}円`
}

function YenValue({ v }: { v: number | null }) {
  return <span className={pnlColorClass(v)}>{fmtYen(v)}</span>
}

/** 増減の幅（pt）。取りこぼし・ドローダウン用で、損益色は付けない */
const fmtPt = (v: number | null) => (v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(1)}pt`)

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
                    <th className="text-right font-medium py-1" title="HOLD に入ってからの最大上昇率（watchlist_events）">最大</th>
                    <th className="text-right font-medium py-1">現在値の日付</th>
                  </tr>
                </thead>
                <tbody>
                  {s.open.map((o) => (
                    <tr key={o.id} className="border-t border-[var(--border)]">
                      <td className="py-1 max-w-[180px]"><TickerCell code={o.ticker} name={o.company_name} /></td>
                      <td className="py-1 font-mono text-caption text-[var(--text-secondary)]">{o.entry_date}</td>
                      <td className="py-1 text-right font-mono tabular-nums"><PctValue v={o.pct} /></td>
                      <td className="py-1 text-right font-mono tabular-nums"><PctValue v={o.maxRetPct} /></td>
                      <td className="py-1 text-right font-mono text-caption text-[var(--text-muted)]">{o.priceDate ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="text-caption text-[var(--text-muted)] mt-1">
              現在値は watchlist_current の終値（無ければ daily_signals）。最大 = HOLD に入ってからの最大上昇率（その日の終値基準）
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
                    <th className="text-right font-medium py-1" title="保有中の最大含み益（trades.mfe_pct）">最大</th>
                    <th className="text-right font-medium py-1">%</th>
                  </tr>
                </thead>
                <tbody>
                  {s.recent.map((t) => (
                    <tr key={t.id} className="border-t border-[var(--border)]">
                      <td className="py-1 max-w-[200px]"><TickerCell code={t.ticker} name={t.company_name} /></td>
                      <td className="py-1 font-mono text-caption text-[var(--text-secondary)]">{t.exit_date}</td>
                      <td className="py-1 text-right font-mono tabular-nums"><PctValue v={t.mfePct} /></td>
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
  const points = useMemo(() => (s ? byDay(s.equity) : []), [s])
  return (
    <>
      {/* 資産曲線は操作できるチャートなのでボタンの中に入れない。詳細は見出しの「詳細」と左の数字から開く */}
      <section className="card p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-small font-medium text-[var(--text-primary)]">My Trades</h3>
          {s && !s.error && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="text-caption px-2.5 py-1 rounded-md border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]"
            >
              ▸ 詳細
            </button>
          )}
        </div>
        {!s ? (
          <p className="mt-3 text-small text-[var(--text-muted)]">読み込み中…</p>
        ) : s.error ? (
          <p className="mt-3 text-small text-[var(--sem-weak-fg)]">取得エラー: {s.error}</p>
        ) : (
          <div className="mt-3 grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="My Trades の詳細を開く"
              className="text-left space-y-3 text-small rounded-md -m-2 p-2 hover:bg-[var(--bg-card-hover)] cursor-pointer"
            >
              <div className="space-y-1.5">
                <div className="text-caption text-[var(--text-muted)]">保有中（セットアップが余裕をくれているか）</div>
                <Line label="含み益の建玉（平均）">
                  {s.openInProfit} / {s.openPriced}
                  <span className="ml-2"><PctValue v={s.openAvgPct} /></span>
                </Line>
                <Line label="最大含み益からの戻し">
                  {fmtPt(s.openGiveback)}
                  <span className="ml-2 text-caption text-[var(--text-muted)]">{s.openGivebackN} 件の平均</span>
                </Line>
              </div>
              <div className="space-y-1.5 pt-2 border-t border-[var(--border)]">
                <div className="text-caption text-[var(--text-muted)]">直近 {RECENT_TRADES} 件の決済</div>
                <Line label="勝敗（平均）">
                  {s.recentWins}勝 {s.recentLosses}敗
                  <span className="ml-2"><PctValue v={s.recentAvgPct} /></span>
                </Line>
                <Line label="損益">
                  <YenValue v={s.recentPnl} />
                </Line>
                <Line label="最大含み益 → 決済">
                  <PctValue v={s.recentMfeAvg} />
                  <span className="text-[var(--text-muted)]"> → </span>
                  <PctValue v={s.recentMfeExitAvg} />
                  <span className="ml-2 text-caption text-[var(--text-muted)]">{s.recentMfeN} 件</span>
                </Line>
                <Line label="連敗">{s.lossStreak}</Line>
              </div>
              <div className="space-y-1.5 pt-2 border-t border-[var(--border)]">
                <div className="text-caption text-[var(--text-muted)]">資産曲線</div>
                <Line label={`${RECENT_TRADES} 件平均の`}>
                  {last?.ma == null ? '—' : last.cumPct >= last.ma ? '上' : '下'}
                </Line>
                <Line label="高値から">
                  {fmtPt(s.drawdown)}
                  <span className="ml-2 text-caption text-[var(--text-muted)]">
                    {s.tradesSincePeak == null ? '' : s.tradesSincePeak === 0 ? '今が高値' : `${s.tradesSincePeak} 件前が高値`}
                  </span>
                </Line>
                <Line label="累計損益">
                  <YenValue v={s.totalPnl} />
                </Line>
              </div>
            </button>
            {/* 資産曲線はカードの主役なので、クリックしなくても大きく見せる */}
            <div className="min-w-0">
              <LineHistoryChart points={points} lines={EQUITY_LINES} format={(v) => fmtPct(v)} height={340} />
            </div>
          </div>
        )}
      </section>
      {open && s && !s.error && <MyTradesModal s={s} onClose={() => setOpen(false)} />}
    </>
  )
}
