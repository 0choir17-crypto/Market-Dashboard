'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchLiquidLeaderDates,
  fetchLiquidLeadersSnapshot,
  type LiquidLeadersSnapshot,
} from '@/lib/liquidLeadersFetch'
import { DIFF_DAYS, TIERS, type LiquidLeader } from '@/types/liquidLeaders'
import LiquidLeadersTable from '@/components/leaders/LiquidLeadersTable'
import SectorWeekHeatmap from '@/components/leaders/SectorWeekHeatmap'
import LeaderDayHeatmap from '@/components/leaders/LeaderDayHeatmap'
import ErrorBanner from '@/components/shared/ErrorBanner'
import PageHeader from '@/components/shared/PageHeader'

export default function LeadersPage() {
  const [snapshot, setSnapshot] = useState<LiquidLeadersSnapshot>({ date: null, rows: [] })
  const [loading, setLoading] = useState(true)
  // 日付ピッカーの選択肢は表示日と無関係に全履歴。マウント時に 1 回だけ取る
  // （表示日ごとに取り直すと、過去日を選んだ後に新しい日付へ戻れなくなる）。
  const [dates, setDates] = useState<string[]>([])
  const [datesError, setDatesError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  // 日付の高速切替時に古い応答が後着して新しい表示を上書きしないためのガード
  const requestIdRef = useRef(0)

  const loadSnapshot = useCallback(async (date?: string) => {
    const reqId = ++requestIdRef.current
    setLoading(true)
    const snap = await fetchLiquidLeadersSnapshot(date)
    if (reqId !== requestIdRef.current) return // 古いリクエストの応答は破棄
    setSnapshot(snap)
    setLoading(false)
  }, [])

  const loadDates = useCallback(async () => {
    const res = await fetchLiquidLeaderDates()
    setDates(res.dates)
    setDatesError(res.error)
  }, [])

  useEffect(() => {
    loadSnapshot() // eslint-disable-line react-hooks/set-state-in-effect
    loadDates()
  }, [loadSnapshot, loadDates])

  const selectedDate = snapshot.date
  const latestDate = dates[0] ?? null
  const isLatest = !latestDate || !selectedDate || selectedDate === latestDate

  // 5 日比の基準日 = 表示日から数えて 5 営業日前 (liquid_leaders にある日付で数える)
  const prevDate = useMemo(() => {
    if (!selectedDate) return null
    const i = dates.indexOf(selectedDate)
    return i >= 0 ? dates[i + DIFF_DAYS] ?? null : null
  }, [dates, selectedDate])
  const [prevData, setPrevData] = useState<{ date: string; map: Map<string, LiquidLeader> } | null>(null)
  useEffect(() => {
    if (!prevDate) return
    let alive = true
    fetchLiquidLeadersSnapshot(prevDate).then(res => {
      if (alive) setPrevData({ date: prevDate, map: new Map(res.rows.map(r => [r.code, r])) })
    })
    return () => {
      alive = false
    }
  }, [prevDate])
  // undefined = 読み込み中 / null = 比べる日が無い (履歴が 5 営業日に満たない)
  const prev: Map<string, LiquidLeader> | null | undefined =
    dates.length === 0 ? undefined
      : !prevDate ? null
        : prevData?.date === prevDate ? prevData.map : undefined

  const byTier = useMemo(() => {
    const m = new Map<string, typeof snapshot.rows>()
    for (const t of TIERS) m.set(t.key, [])
    for (const r of snapshot.rows) {
      const k = r.tier === 'large' ? 'large' : 'mid'
      m.get(k)!.push(r)
    }
    return m
  }, [snapshot])

  return (
    <main className="min-h-screen p-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <PageHeader
        title="Liquid Leaders"
        subtitle="リキッド・リーダー — 機関投資家が大量に売買できる銘柄のうち、市場平均を上回る買いが入り続けている銘柄。市場の状況の確認用（売買タイミングではない）"
        onRefresh={() => {
          loadSnapshot(selectedDate ?? undefined)
          loadDates()
        }}
        refreshing={loading}
      >
        {dates.length > 0 && (
          <select
            value={selectedDate ?? ''}
            onChange={e => loadSnapshot(e.target.value)}
            aria-label="表示する営業日"
            className={`text-caption font-mono px-2 py-1 rounded border cursor-pointer ${
              isLatest
                ? 'border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)]'
                : 'border-[var(--sem-watch-bd)] bg-[var(--sem-watch-bg)] text-[var(--sem-watch-fg)] font-medium'
            }`}
          >
            {selectedDate && !dates.includes(selectedDate) && (
              <option value={selectedDate}>{selectedDate}</option>
            )}
            {dates.map(d => (
              <option key={d} value={d}>
                {d}{d === latestDate ? '（最新）' : ''}
              </option>
            ))}
          </select>
        )}
        {!isLatest && latestDate && (
          <button
            onClick={() => loadSnapshot(latestDate)}
            className="text-caption px-1.5 py-0.5 rounded bg-[var(--sem-watch-fg)] text-white hover:brightness-110 transition-colors font-medium"
          >
            最新に戻る
          </button>
        )}
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="検索: 銘柄コード / 銘柄名"
          className="text-caption px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] w-56 focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
        />
      </PageHeader>

      {!isLatest && selectedDate && (
        <div className="mb-4 px-4 py-2 rounded-lg bg-[var(--sem-watch-bg)] border border-[var(--sem-watch-bd)] text-[var(--sem-watch-fg)] text-small font-medium">
          {selectedDate} の一覧を表示中
        </div>
      )}

      {(snapshot.error || datesError) && (
        <ErrorBanner detail={[snapshot.error, datesError].filter(Boolean).join(' / ')} />
      )}

      {loading && snapshot.rows.length === 0 && (
        <div
          className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-8 text-center"
          style={{ color: 'var(--text-muted)' }}
        >
          <p className="text-title font-medium">読み込み中…</p>
        </div>
      )}

      {!loading && snapshot.rows.length === 0 ? (
        <div
          className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-8 text-center"
          style={{ color: 'var(--text-muted)' }}
        >
          <p className="text-title font-medium mb-2">データが見つかりません</p>
          <p className="text-small">
            Supabase の <code className="font-mono">liquid_leaders</code> テーブルにデータがあるか確認してください。
            <br />
            毎平日の引け後に scan_liquid_leaders.py が直近 5 営業日を更新します。
          </p>
        </div>
      ) : snapshot.rows.length > 0 && (
        <>
          <ReadingNotes />

          {selectedDate && (
            <div className="mt-6 space-y-6">
              <SectorWeekHeatmap endDate={selectedDate} />
              <LeaderDayHeatmap rows={snapshot.rows} dates={dates} selectedDate={selectedDate} prev={prev} />
            </div>
          )}

          <div className="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-x-6 gap-y-8 items-start">
            {TIERS.map(t => (
              <LiquidLeadersTable
                key={t.key}
                rows={byTier.get(t.key) ?? []}
                prev={prev}
                title={t.label}
                hint={t.hint}
                enter={t.enter}
                query={query}
              />
            ))}
          </div>
        </>
      )}
    </main>
  )
}

// 読み方の注記
function ReadingNotes() {
  return (
    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-5 text-caption text-[var(--text-secondary)]">
      <ul className="list-disc pl-5 space-y-1">
        <li>
          t 値 = TOPIX につられた分を除いた強さが毎日どれだけ安定しているか。大型は 2.0 以上・中小は 1.5 以上で一覧に入り、入った後の最高値から 1 下がるまで残る（そのため入る線を割った銘柄も一覧にいる）。
        </li>
        <li>
          段に入るのは 1 日の平均値幅（ADR%・20 日）が大型 2% 以上・中小 3% 以上の日だけ。値動きのほとんど無い銘柄が「TOPIX が下げた日に下げなかっただけ」で入るのを防ぐため。その日の ADR で判定するので、下限を割った日は一覧からも業種ヒートマップの母数からも外れる。
        </li>
        <li>
          括弧内は 5 営業日前からの t の増減。<span style={{ color: 'var(--positive)' }}>+0.1 以上</span> /{' '}
          <span style={{ color: 'var(--negative)' }}>−0.1 以下</span> / それ以外は灰。5 営業日前に一覧にいなかった銘柄は「新規」。
        </li>
        <li>赤が何日も続く = 強さが落ちてきている。1〜2 日だけの色は日々の揺れのことが多い。</li>
        <li>t63 が高いのに t21 の 5 日比が赤 = 3 か月の先導は続いているが、直近 1 か月で勢いが落ちている。</li>
        <li>
          代金の勢い = 直近 20 日の売買代金 ÷ いつもの売買代金（1.0 = いつもどおり、2.0 = 倍）。高いほど「商いが膨らんで一覧に入った」銘柄。こうした銘柄は一覧には長く残るが、その後 3 か月の伸びは小さい傾向がある（10 年の検証で一貫）。高い = 良い、ではない。
        </li>
        <li>件数そのものは、実力ゼロでも偶然で入る件数とほぼ同じ。同じ業種が固まっているかを見る。</li>
        <li>TOPIX が 3 か月で 5% 以上下げている時期は、t21 の一覧の 3〜4 割が「下げが小さいだけの防御株」になる。</li>
        <li>一覧に入った銘柄が、その後も強さを保つとは限らない（記述用。予測用ではない）。</li>
        <li>
          ヒートマップの件数や濃さも「実力ゼロでも偶然で入る分」を含む。業種 × 週は差で補正しているが、1〜2 週だけの濃淡は偶然のことが多い。何週も続く塊を読む。
        </li>
      </ul>
    </div>
  )
}
