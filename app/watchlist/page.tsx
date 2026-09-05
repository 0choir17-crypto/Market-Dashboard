'use client'

// Watchlist Journal — TradingView の操作記録を振り返る画面。
//
// 旧 /watchlist（Supabase の watchlist テーブルへの手入力）は 0 行のまま使われず、
// テーブルごと 2026-09-05 に drop された。銘柄選定は TradingView 上で行い、
// Chrome 拡張が 30 分おきにスナップショットを撮って差分から遷移イベントを
// 復元して Supabase に配信する。この画面はその記録を読むだけの読み取り専用で、
// 追加・編集・削除の導線は持たない（Supabase 側にも write policy が無い）。
//
// この画面の目的は 2 つだけ:
//   1. 上昇・下降する銘柄の特徴を掴めているか（自分が拾った銘柄はどういう姿だったか）
//   2. 見逃したのはなぜか（入れたのに買わずに落とした銘柄がその後どうなったか）
//
// 日付は DateContext（営業日ピッカー）を使わない。記録は土日祝にも発生するため、
// 営業日で絞ると週末のイベントが丸ごと消える。/leaders や /earnings と同じく
// ページ独自のセレクトにし、選択肢は watchlist_events の date の distinct から作る。

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  EMPTY_SNAPSHOT,
  fetchWatchlistJournal,
  type WatchlistJournalSnapshot,
} from '@/lib/watchlistJournalFetch'
import CurrentStateTable from '@/components/watchlistJournal/CurrentStateTable'
import DailyDiff from '@/components/watchlistJournal/DailyDiff'
import MissedBoard from '@/components/watchlistJournal/MissedBoard'
import SnapshotFreshnessBadge from '@/components/watchlistJournal/SnapshotFreshnessBadge'
import ErrorBanner from '@/components/shared/ErrorBanner'
import PageHeader from '@/components/shared/PageHeader'

export default function WatchlistJournalPage() {
  const [snapshot, setSnapshot] = useState<WatchlistJournalSnapshot>(EMPTY_SNAPSHOT)
  const [loading, setLoading] = useState(true)

  // 日付の高速切替時に古い応答が後着して新しい表示を上書きしないためのガード
  const requestIdRef = useRef(0)

  const load = useCallback(async (date?: string) => {
    const reqId = ++requestIdRef.current
    setLoading(true)
    const snap = await fetchWatchlistJournal(date)
    if (reqId !== requestIdRef.current) return // 古いリクエストの応答は破棄
    setSnapshot(snap)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])  // eslint-disable-line react-hooks/set-state-in-effect

  const latestAvailable = snapshot.availableDates[0] ?? null
  const isLatest =
    snapshot.availableDates.length === 0 || snapshot.selectedDate === snapshot.availableDates[0]

  const hasAnything =
    snapshot.current.length > 0 || snapshot.events.length > 0 || snapshot.missed.length > 0

  return (
    <main className="min-h-screen p-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <PageHeader
        title="Watchlist Journal"
        subtitle="TradingView の操作記録 — 何を拾い、何を落としたか"
        onRefresh={() => load(snapshot.selectedDate ?? undefined)}
        refreshing={loading}
      >
        <SnapshotFreshnessBadge lastTs={snapshot.lastTs} />

        {snapshot.availableDates.length > 0 && (
          <select
            value={snapshot.selectedDate ?? ''}
            onChange={e => load(e.target.value)}
            aria-label="差分を表示する日"
            className={`text-xs font-mono px-2 py-1 rounded border cursor-pointer ${
              isLatest
                ? 'border-gray-200 bg-[var(--bg-card)] text-gray-700'
                : 'border-amber-400 bg-amber-100 text-amber-800 font-semibold'
            }`}
          >
            {snapshot.availableDates.map(d => (
              <option key={d} value={d}>
                {d}{d === snapshot.availableDates[0] ? '（最新）' : ''}
              </option>
            ))}
          </select>
        )}
        {!isLatest && latestAvailable && (
          <button
            onClick={() => load(latestAvailable)}
            className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500 text-white hover:bg-amber-600 transition-colors font-medium"
          >
            最新に戻る
          </button>
        )}
      </PageHeader>

      {/* 過去日を選んでいるのは「差分」セクションだけで、現在の状態と
          見逃しボードは常に最新を出す。取り違えないよう明示する。 */}
      {!isLatest && snapshot.selectedDate && (
        <div className="mb-4 px-4 py-2 rounded-lg bg-amber-50 border border-amber-300 text-amber-800 text-sm font-medium">
          {snapshot.selectedDate} の差分を表示中
          <span className="ml-2 font-normal text-amber-700">
            （「現在の状態」と「見逃しボード」は常に最新です）
          </span>
        </div>
      )}

      {snapshot.error && (
        <ErrorBanner
          detail={snapshot.error}
          onRetry={() => load(snapshot.selectedDate ?? undefined)}
        />
      )}

      {loading && !hasAnything ? (
        <div
          className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-8 text-center"
          style={{ color: 'var(--text-muted)' }}
        >
          <p className="text-lg font-medium">読み込み中…</p>
        </div>
      ) : !hasAnything ? (
        <div
          className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-8 text-center"
          style={{ color: 'var(--text-muted)' }}
        >
          <p className="text-lg font-medium mb-2">記録がまだありません</p>
          <p className="text-sm">
            Supabase の <code className="font-mono">watchlist_events</code> /{' '}
            <code className="font-mono">watchlist_current</code> にデータがあるか確認してください。
            <br />
            毎日 23:30（土日祝も）に WatchlistJournal-Ingest から自動 push されます。
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          <CurrentStateTable rows={snapshot.current} />
          <DailyDiff events={snapshot.events} date={snapshot.selectedDate} />
          <MissedBoard rows={snapshot.missed} />
        </div>
      )}

      {/* 読み取り専用であることと、記録の性格を明示しておく。
          リストを動かした日は約定日ではなく、損益の正本は trades（Trading）。 */}
      <p className="mt-10 text-[11px] leading-relaxed text-[var(--text-muted)]">
        この画面は読み取り専用です。銘柄の追加・移動・削除は TradingView 側で行い、毎日 23:30
        （手動更新はデスクトップのショートカット）に自動で記録されます。日中は更新されません。
        <br />
        HOLD → SOLD はリストを動かした日であって約定日ではありません。損益は Trading（trades）が正本です。
        記録開始日 2026-08-13 に HOLD / SOLD として現れた 4 銘柄（3697 / 5857 / 6326 / 8136）は
        それ以前から保有していた建玉で、日付も滞在日数も実際のエントリーとは無関係です。
      </p>
    </main>
  )
}
