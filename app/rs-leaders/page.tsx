'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDate } from '@/contexts/DateContext'
import { fetchRsLeadersSnapshot, type RsLeadersSnapshot } from '@/lib/rsLeadersFetch'
import { RS_MIN } from '@/types/rsLeaders'
import SectorBoard from '@/components/rsLeaders/SectorBoard'
import PullbackBoard from '@/components/rsLeaders/PullbackBoard'
import ErrorBanner from '@/components/shared/ErrorBanner'
import PageHeader from '@/components/shared/PageHeader'

type Tab = 'sector' | 'pullback'

const TABS: { key: Tab; label: string }[] = [
  { key: 'sector', label: 'Sector Board' },
  { key: 'pullback', label: 'Pullback Board' },
]

export default function RsLeadersPage() {
  const [snapshot, setSnapshot] = useState<RsLeadersSnapshot>({ date: null, rows: [], sectorDays: [] })
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('sector')
  const requestIdRef = useRef(0)

  const load = useCallback(async () => {
    const reqId = ++requestIdRef.current
    setLoading(true)
    const snap = await fetchRsLeadersSnapshot()
    if (reqId !== requestIdRef.current) return
    setSnapshot(snap)
    setLoading(false)
  }, [])

  useEffect(() => {
    load() // eslint-disable-line react-hooks/set-state-in-effect
  }, [load])

  // 他のテーブルより古いかの確認: market_conditions の最新日 (ナビの日付ピッカーと同じ) と比べる
  const { availableDates } = useDate()
  const marketLatest = availableDates[0] ?? null
  const stale = !!snapshot.date && !!marketLatest && snapshot.date < marketLatest

  const sectorRank = useMemo(() => {
    const latest = snapshot.sectorDays[snapshot.sectorDays.length - 1]?.date
    const m = new Map<string, number>()
    for (const r of snapshot.sectorDays) {
      if (r.date === latest && r.sector_rank !== null) m.set(r.sector_code, r.sector_rank)
    }
    return m
  }, [snapshot.sectorDays])

  const nShown = useMemo(() => snapshot.rows.filter(r => (r.rs_rating ?? 0) >= RS_MIN).length, [snapshot.rows])

  return (
    <main className="min-h-screen p-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <PageHeader
        title="RS Leaders"
        subtitle="RS リーダー — TOPIX 比で強い銘柄を、業種の強さと移動平均線までの押しで並べる。チャートを確認する銘柄を絞るための画面（売買シグナルではない）"
        date={snapshot.date}
        onRefresh={load}
        refreshing={loading}
      >
        {stale && (
          <span
            className="text-caption px-2 py-0.5 rounded border-[0.5px] border-[var(--sem-watch-bd)] bg-[var(--sem-watch-bg)] text-[var(--sem-watch-fg)] font-medium"
            title="rs_leaders の更新が market_conditions より遅れています"
          >
            ⚠ 他のデータ（{marketLatest}）より古い日付です
          </span>
        )}
      </PageHeader>

      {snapshot.error && <ErrorBanner detail={snapshot.error} onRetry={load} />}

      {loading && snapshot.rows.length === 0 ? (
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-8 text-center text-[var(--text-muted)]">
          <p className="text-title font-medium">読み込み中…</p>
        </div>
      ) : snapshot.rows.length === 0 ? (
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-8 text-center text-[var(--text-muted)]">
          <p className="text-title font-medium mb-2">データが見つかりません</p>
          <p className="text-small">
            Supabase の <code className="font-mono">rs_leaders</code> /{' '}
            <code className="font-mono">rs_leaders_sector</code> テーブルにデータがあるか確認してください。
            <br />
            毎平日の夜に run_daily (Step1l) が直近 10 営業日を更新します。
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="inline-flex gap-1 bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-1">
              {TABS.map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  aria-pressed={tab === t.key}
                  className={`px-4 py-2 min-w-fit text-small font-medium rounded-lg transition-colors ${
                    tab === t.key
                      ? 'bg-[var(--sem-focus-fg)] text-white'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <span className="text-caption text-[var(--text-muted)] num">
              全体RS {RS_MIN} 以上の {nShown} 銘柄
            </span>
          </div>

          {tab === 'sector' ? (
            <SectorBoard rows={snapshot.rows} sectorDays={snapshot.sectorDays} sectorRank={sectorRank} />
          ) : (
            <PullbackBoard rows={snapshot.rows} sectorRank={sectorRank} />
          )}
        </>
      )}
    </main>
  )
}
