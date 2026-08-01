'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchMomentumSnapshot, type MomentumSnapshot } from '@/lib/momentumLeadersFetch'
import { HORIZONS } from '@/types/momentumLeaders'
import MomentumBoard from '@/components/momentum/MomentumBoard'
import ErrorBanner from '@/components/shared/ErrorBanner'
import PageHeader from '@/components/shared/PageHeader'

const EMPTY: MomentumSnapshot = {
  latestDate: null,
  byHorizon: { 21: [], 63: [], 126: [] },
  error: null,
}

export default function MomentumPage() {
  const [snapshot, setSnapshot] = useState<MomentumSnapshot>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [newOnly, setNewOnly] = useState(false)

  // 連打時に古い応答が新しい表示を上書きしないためのガード
  const requestIdRef = useRef(0)

  const load = useCallback(async () => {
    const reqId = ++requestIdRef.current
    setLoading(true)
    const snap = await fetchMomentumSnapshot()
    if (reqId !== requestIdRef.current) return // 古いリクエストの応答は破棄
    setSnapshot(snap)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load]) // eslint-disable-line react-hooks/set-state-in-effect

  const total = HORIZONS.reduce((n, h) => n + snapshot.byHorizon[h].length, 0)

  return (
    <main className="min-h-screen p-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <PageHeader
        title="Momentum"
        subtitle="生の上昇率ランキング（全窓・無フィルタ）— 21/63/126 日窓を横並びで見比べ。market_leaders（厳選版）が弾く小型・126日超長期・トレンド未成立の急騰株を拾う発掘用"
        date={snapshot.latestDate}
        isLatest
        onRefresh={load}
        refreshing={loading}
      >
        <button
          onClick={() => setNewOnly(v => !v)}
          className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
            newOnly
              ? 'bg-rose-500 text-white border-rose-500'
              : 'bg-[var(--bg-card)] text-rose-700 border-rose-200 hover:bg-rose-50'
          }`}
          title="前日圏外＝新規ランクインした銘柄だけ表示"
        >
          NEW のみ
        </button>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="検索: コード / 銘柄名 / セクター"
          className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] w-56 focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
        />
      </PageHeader>

      {snapshot.error && <ErrorBanner detail={snapshot.error} onRetry={load} />}

      {loading && total === 0 ? (
        <div
          className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-8 text-center"
          style={{ color: 'var(--text-muted)' }}
        >
          <p className="text-lg font-medium">読み込み中…</p>
        </div>
      ) : !loading && total === 0 ? (
        <div
          className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-8 text-center"
          style={{ color: 'var(--text-muted)' }}
        >
          <p className="text-lg font-medium mb-2">データが見つかりません</p>
          <p className="text-sm">
            Supabase の <code className="font-mono">momentum_leaders</code> テーブルにデータがあるか確認してください。
            <br />
            毎営業日 18:00 JST（引け後）に jquants-scanner から自動 push されます。
          </p>
        </div>
      ) : (
        <MomentumBoard snapshot={snapshot} query={query} newOnly={newOnly} />
      )}
    </main>
  )
}
