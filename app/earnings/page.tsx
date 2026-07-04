'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchEarningsQualitySnapshot,
  type EarningsQualitySnapshot,
} from '@/lib/earningsQualityFetch'
import { classifyFreshness } from '@/types/earningsQuality'
import EarningsQualitySection from '@/components/earnings/EarningsQualitySection'
import ErrorBanner from '@/components/shared/ErrorBanner'
import PageHeader from '@/components/shared/PageHeader'

// 鮮度バッジ: latestDate と本日との営業日差で色分け。
// 閑散期 (3/6/9/12月) では長期間データ更新が無いことが正常なので、
// hint 文言で原因を明示してユーザーの誤読を防ぐ。
function FreshnessBadge({ latestDate }: { latestDate: string }) {
  // 'now' を毎回再計算しないようマウント時にスナップショット
  const fresh = useMemo(() => classifyFreshness(latestDate), [latestDate])
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap"
      style={{
        backgroundColor: fresh.bg,
        color: fresh.text,
        border: `1px solid ${fresh.border}`,
      }}
      title={fresh.hint}
    >
      <span className="text-[9px]">{fresh.icon}</span>
      {fresh.label}
    </span>
  )
}

export default function EarningsPage() {
  const [snapshot, setSnapshot] = useState<EarningsQualitySnapshot>({
    latestDate: null,
    rows: [],
    eventsInDay: 0,
    availableDates: [],
  })
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  // 日付の高速切替時に古い応答が後着して新しい表示を上書きしないためのガード
  const requestIdRef = useRef(0)

  const fetchData = useCallback(async (date?: string) => {
    const reqId = ++requestIdRef.current
    setLoading(true)
    const snap = await fetchEarningsQualitySnapshot(date)
    if (reqId !== requestIdRef.current) return // 古いリクエストの応答は破棄
    setSnapshot(snap)
    setSelectedDate(date ?? snap.latestDate)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])  // eslint-disable-line react-hooks/set-state-in-effect

  const latestAvailable = snapshot.availableDates[0] ?? snapshot.latestDate ?? null
  const isLatest =
    snapshot.availableDates.length === 0 ||
    selectedDate === snapshot.availableDates[0]

  // 「閑散期 + 6営業日以上前」のときだけ画面上部に注意バナーを出す
  const fresh = latestAvailable ? classifyFreshness(latestAvailable) : null
  const showQuietBanner = fresh?.level === 'old' && fresh.inQuietMonth

  return (
    <main className="min-h-screen p-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <PageHeader
        title="Earnings Quality"
        subtitle="決算品質 — 当日決算開示銘柄の品質スコア（0-7）・翌営業日（D+1）寄り買い候補 ※ 1Q-3Q のみ対象（本決算除外）／3・6・9・12月は構造的閑散期"
        onRefresh={() => fetchData(selectedDate ?? undefined)}
        refreshing={loading}
      >
        {latestAvailable && (
          <span className="inline-flex items-center gap-2 text-sm">
            <span className="text-[var(--text-muted)]">最新開示日:</span>
            <span className="font-mono font-semibold text-[var(--text-primary)]">
              {latestAvailable}
            </span>
            <FreshnessBadge latestDate={latestAvailable} />
          </span>
        )}
        {snapshot.availableDates.length > 0 && (
          <select
            value={selectedDate ?? snapshot.latestDate ?? ''}
            onChange={e => fetchData(e.target.value)}
            className={`text-xs font-mono px-2 py-1 rounded border cursor-pointer ${
              isLatest
                ? 'border-gray-200 bg-white text-gray-700'
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
        {!isLatest && snapshot.availableDates[0] && (
          <button
            onClick={() => fetchData(snapshot.availableDates[0])}
            className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500 text-white hover:bg-amber-600 transition-colors font-medium"
          >
            最新に戻る
          </button>
        )}
      </PageHeader>

      {showQuietBanner && fresh && latestAvailable && (
        <div className="mb-4 px-4 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm flex items-start gap-2">
          <span className="text-base leading-tight">⚠️</span>
          <div>
            <p className="font-semibold">
              表示中のデータは {latestAvailable} ({fresh.bdays} 営業日前) のものです
            </p>
            <p className="text-xs text-red-700 mt-0.5">
              現在は決算閑散期 (3/6/9/12 月) のため、本スキャナー対象 (1Q-3Q) の新規開示がありません。
              「直近の開示日」のデータが残り続けるため、「今日のデータ」ではない点にご注意ください。
            </p>
          </div>
        </div>
      )}

      {!isLatest && selectedDate && (
        <div className="mb-4 px-4 py-2 rounded-lg bg-amber-50 border border-amber-300 text-amber-800 text-sm font-medium">
          {selectedDate} のスナップショットを表示中
        </div>
      )}

      {snapshot.error && (
        <ErrorBanner detail={snapshot.error} onRetry={() => fetchData(selectedDate ?? undefined)} />
      )}

      {loading && snapshot.rows.length === 0 && (
        <div
          className="bg-white rounded-xl border border-[#e8eaed] shadow-sm p-8 text-center"
          style={{ color: 'var(--text-muted)' }}
        >
          <p className="text-lg font-medium">読み込み中…</p>
        </div>
      )}

      {!loading && snapshot.rows.length === 0 && (
        <div
          className="bg-white rounded-xl border border-[#e8eaed] shadow-sm p-8 text-center"
          style={{ color: 'var(--text-muted)' }}
        >
          <p className="text-lg font-medium mb-2">データが見つかりません</p>
          <p className="text-sm">
            Supabase の <code className="font-mono">earnings_quality</code> テーブルにデータがあるか確認してください。
            <br />
            毎営業日 18:23 JST に jquants-scanner から自動 push されます。
          </p>
        </div>
      )}

      {/* 再取得中も直前の内容を表示し続ける（初回ロード時のみ Loading 全面表示） */}
      {snapshot.rows.length > 0 && (
        <EarningsQualitySection snapshot={snapshot} />
      )}
    </main>
  )
}
