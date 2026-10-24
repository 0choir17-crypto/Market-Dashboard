'use client'

import { useEffect, useMemo, useState } from 'react'
import { useDate } from '@/contexts/DateContext'
import { fetchSectorTrends, type SectorTrend, type SectorTrendResult } from '@/lib/sectorTrendFetch'
import type { TrendSignal } from '@/lib/trendState'
import { CautionMark, TValue } from '@/components/sectors33/SelfStrength'
import { Position, Row, SIGNAL_ORDER, SIGNAL_STYLE, SLOPE_NOTE, Slope } from './trendAtoms'

// 33 業種の地合い判定カード。判定は指数カードと同じ（日足 EMA9 / EMA21 の位置と向き）。
// 並びは 緑 → 黄 → 赤、同じ色の中は self_t21 の高い順（null は最後）。
// 33 枚あるので 1 枚は指数カードより小さく、EMA の位置・乖離・向きを 1 行にまとめる。

function bySignalThenSelfT21(a: SectorTrend, b: SectorTrend): number {
  // 判定できない業種は最後
  const sa = a.state ? SIGNAL_ORDER[a.state.signal] : 3
  const sb = b.state ? SIGNAL_ORDER[b.state.signal] : 3
  if (sa !== sb) return sa - sb
  return (b.selfT21 ?? -Infinity) - (a.selfT21 ?? -Infinity)
}

function SectorCard({ s }: { s: SectorTrend }) {
  const st = s.state
  const sig = st ? SIGNAL_STYLE[st.signal] : null
  return (
    <div
      className="card p-3.5 border-l-4"
      style={{ borderLeftColor: sig ? sig.fg : 'var(--sem-idle-bd)' }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-small font-medium text-[var(--text-primary)] truncate" title={s.sector}>
          {s.sector}
        </h3>
        <CautionMark row={{ self_t63: s.selfT63 }} />
      </div>

      {st && sig ? (
        <>
          <p className="text-caption mt-1" style={{ color: sig.fg }}>
            <span className="font-medium">{sig.name}</span> {st.label}
          </p>
          <div className="mt-2 space-y-1 text-caption">
            <Row label="EMA9" title={SLOPE_NOTE}>
              <Position above={st.close > st.ema9} dist={st.distEma9Pct} />
              <span className="ml-1.5">
                <Slope up={st.ema9Up} short />
              </span>
            </Row>
            <Row label="EMA21" title={SLOPE_NOTE}>
              <Position above={st.close > st.ema21} dist={st.distEma21Pct} />
              <span className="ml-1.5">
                <Slope up={st.ema21Up} short />
              </span>
            </Row>
          </div>
        </>
      ) : (
        <p className="text-caption text-[var(--text-muted)] mt-1">データが足りません</p>
      )}

      <div className="mt-2 pt-2 border-t border-[var(--border)] grid grid-cols-2 gap-2 text-caption">
        <div className="flex justify-between gap-1">
          <span className="text-[var(--text-muted)]">t21</span>
          <TValue v={s.selfT21} strong />
        </div>
        <div className="flex justify-between gap-1">
          <span className="text-[var(--text-muted)]">t63</span>
          <TValue v={s.selfT63} />
        </div>
      </div>
    </div>
  )
}

export default function SectorStateCards() {
  const { selectedDate, isLatest } = useDate()
  const [result, setResult] = useState<SectorTrendResult | null>(null)

  // 過去スナップショット選択時はその日以前のデータで判定する
  const endDate = isLatest ? undefined : selectedDate || undefined

  useEffect(() => {
    let cancelled = false
    fetchSectorTrends(endDate).then((res) => {
      if (!cancelled) setResult(res)
    })
    return () => {
      cancelled = true
    }
  }, [endDate])

  const sorted = useMemo(
    () => (result ? [...result.sectors].sort(bySignalThenSelfT21) : []),
    [result],
  )
  const counts = useMemo(() => {
    const c: Record<TrendSignal, number> = { green: 0, yellow: 0, red: 0 }
    for (const s of sorted) if (s.state) c[s.state.signal]++
    return c
  }, [sorted])

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
        <div>
          <h2 className="text-title font-medium text-[var(--text-primary)]">業種</h2>
          <p className="text-caption text-[var(--text-muted)] mt-0.5">
            TOPIX-33 業種指数の EMA9 / EMA21 判定。並びは 緑 → 黄 → 赤、同じ色の中は自力 t21 の高い順。
            t21 / t63 = 業種の自力（TOPIX につられた分を除いた強さ）
            {result?.latestDate && <span className="ml-2 font-mono">{result.latestDate}</span>}
          </p>
        </div>
        {sorted.length > 0 && (
          <div className="flex items-center gap-3 text-small font-mono tabular-nums">
            {(['green', 'yellow', 'red'] as const).map((k) => (
              <span key={k} className="flex items-center gap-1.5" style={{ color: SIGNAL_STYLE[k].fg }}>
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: SIGNAL_STYLE[k].fg }}
                />
                {SIGNAL_STYLE[k].name} {counts[k]}
              </span>
            ))}
          </div>
        )}
      </div>

      {result?.error ? (
        <div className="card p-5 text-small text-[var(--sem-weak-fg)]">
          業種データ取得エラー: {result.error}
        </div>
      ) : !result ? (
        <div className="card p-5 text-small text-[var(--text-muted)]">読み込み中…</div>
      ) : sorted.length === 0 ? (
        <div className="card p-5 text-small text-[var(--text-muted)]">業種データがありません</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {sorted.map((s) => (
            <SectorCard key={s.sector} s={s} />
          ))}
        </div>
      )}
    </section>
  )
}
