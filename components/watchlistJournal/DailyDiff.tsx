'use client'

// §3.2 今日の差分 — 選択日の enter / 昇格 / 降格 / exit を時系列で並べる。
//
// move は from_state / to_state の優先度を比べて昇格・降格を判定する
// （types/watchlistJournal.ts の classifyMove）。リスト跨ぎも同じラダーに乗せ、
// READY → HOLD（実際に買った）が最も強い昇格として出る。

import type { WatchlistEvent } from '@/types/watchlistJournal'
import { MOVE_CLASS, MOVE_LABEL, classifyMove } from '@/types/watchlistJournal'
import { formatJstTime } from '@/lib/dates'
import { NumCell, ScannerTags, StateBadge, TickerCell } from './atoms'

type Props = {
  events: WatchlistEvent[]
  date: string | null
}

export default function DailyDiff({ events, date }: Props) {
  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          差分
          {date && <span className="ml-2 font-mono text-sm text-[var(--text-muted)]">{date}</span>}
        </h2>
        <p className="text-xs text-[var(--text-muted)]">
          {events.length} 件 — 時刻は JST。平日は 18〜23 時、週末はまとめて整理した記録
        </p>
      </div>

      {events.length === 0 ? (
        <div
          className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-6 text-center"
          style={{ color: 'var(--text-muted)' }}
        >
          <p className="text-sm">この日はリストを動かしていません</p>
        </div>
      ) : (
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm divide-y divide-[var(--border)]">
          {events.map(ev => {
            const kind = classifyMove(ev)
            return (
              <div
                key={`${ev.snapshot_id}-${ev.code}`}
                className="px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 hover:bg-[var(--bg-card-hover)] transition-colors"
              >
                <span className="font-mono text-[11px] text-[var(--text-muted)] w-11 shrink-0">
                  {formatJstTime(ev.ts)}
                </span>

                <span
                  className={`inline-block px-2 py-0.5 rounded border text-[11px] font-semibold w-14 text-center shrink-0 ${MOVE_CLASS[kind]}`}
                >
                  {MOVE_LABEL[kind]}
                </span>

                <span className="w-52 shrink-0">
                  <TickerCell code={ev.code} name={ev.co_name} />
                </span>

                <span className="inline-flex items-center gap-1.5 shrink-0">
                  {ev.from_state && <StateBadge state={ev.from_state} />}
                  <span className="text-[var(--text-muted)] text-xs">→</span>
                  {ev.to_state ? (
                    <StateBadge state={ev.to_state} />
                  ) : (
                    <span className="text-xs text-[var(--text-muted)]">（リストから削除）</span>
                  )}
                </span>

                {/* dwell_days は enter では NULL（直前の状態が無い）。0 日と混同させない。 */}
                {ev.dwell_days != null && (
                  <span className="text-[11px] text-[var(--text-muted)] shrink-0">
                    ({ev.dwell_days}日滞在)
                  </span>
                )}

                {/* 指標は「そのイベントが起きた日」の値で以後不変。
                    enter のときだけ出して「どういう姿の銘柄を拾ったか」を残す。 */}
                {ev.event === 'enter' && (
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] ml-auto">
                    <span className="text-[var(--text-muted)]">
                      ADR <NumCell value={ev.adr_pct_20} suffix="%" />
                    </span>
                    <span className="text-[var(--text-muted)]">
                      RS <NumCell value={ev.rs_vs_topix_avg} digits={0} />
                    </span>
                    <span className="text-[var(--text-muted)]">
                      高値 <NumCell value={ev.dist_from_high_pct} suffix="%" />
                    </span>
                    <span className="text-[var(--text-muted)]">
                      代金 <NumCell value={ev.turnover_oku} suffix="億" />
                    </span>
                    <ScannerTags names={ev.scanner_names} />
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ind_date は「指標を引いた営業日」で date（判断した日）とは別物。
          土日に整理した日は金曜終値を見て判断していることを明示する。 */}
      {events.some(ev => ev.ind_date && ev.ind_date !== ev.date) && (
        <p className="text-[11px] text-[var(--text-muted)] mt-2">
          この日の指標は {events.find(ev => ev.ind_date && ev.ind_date !== ev.date)?.ind_date} 時点の値です
          （土日祝に整理した場合、直近営業日の終値を見て判断していることになります）。
        </p>
      )}
    </section>
  )
}
