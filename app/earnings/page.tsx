'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchEarningsQualitySnapshot,
  type EarningsQualitySnapshot,
} from '@/lib/earningsQualityFetch'
import { classifyFreshness } from '@/types/earningsQuality'
import { toneVars } from '@/types/semantic'
import EarningsQualitySection from '@/components/earnings/EarningsQualitySection'
import ErrorBanner from '@/components/shared/ErrorBanner'
import PageHeader from '@/components/shared/PageHeader'

// 鮮度バッジ: latestDate と本日との営業日差で色分け。
// 開示ピークは 5月(FY)/8月(1Q)/11月(2Q)/2月(3Q) に偏るため、その翌月にあたる
// 閑散期 (3/6/9/12月) では長期間データ更新が無いことが正常。
// hint 文言で原因を明示してユーザーの誤読を防ぐ。
function FreshnessBadge({ latestDate }: { latestDate: string }) {
  // 'now' を毎回再計算しないようマウント時にスナップショット
  const fresh = useMemo(() => classifyFreshness(latestDate), [latestDate])
  const tone = toneVars(fresh.tone)
  const plain = fresh.tone === 'idle' // 正常は面を持たない（異常だけが目に入る）
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-caption whitespace-nowrap"
      style={
        plain
          ? { color: 'var(--text-muted)' }
          : { backgroundColor: tone.bg, color: tone.fg, border: `0.5px solid ${tone.bd}` }
      }
      title={fresh.hint}
    >
      <span
        aria-hidden
        className="inline-block w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: plain ? 'var(--sem-idle-bd)' : tone.fg }}
      />
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
        subtitle="決算品質 — 当日決算開示銘柄の品質スコア（0-9、1Q と FY は構造的に最大 7）・翌営業日（D+1）寄り買い候補 ※ 1Q-3Q + FY 通期本決算が対象／3・6・9・12月は構造的閑散期"
        onRefresh={() => fetchData(selectedDate ?? undefined)}
        refreshing={loading}
      >
        {latestAvailable && (
          <span className="inline-flex items-center gap-2 text-small">
            <span className="text-[var(--text-muted)]">最新開示日:</span>
            <span className="font-mono font-medium text-[var(--text-primary)]">
              {latestAvailable}
            </span>
            <FreshnessBadge latestDate={latestAvailable} />
          </span>
        )}
        {snapshot.availableDates.length > 0 && (
          <select
            value={selectedDate ?? snapshot.latestDate ?? ''}
            onChange={e => fetchData(e.target.value)}
            className={`text-caption font-mono px-2 py-1 rounded border cursor-pointer ${
              isLatest
                ? 'border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)]'
                : 'border-[var(--sem-watch-bd)] bg-[var(--sem-watch-bg)] text-[var(--sem-watch-fg)] font-medium'
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
            className="text-caption px-1.5 py-0.5 rounded bg-[var(--sem-watch-fg)] text-white hover:brightness-110 transition-colors font-medium"
          >
            最新に戻る
          </button>
        )}
      </PageHeader>

      {showQuietBanner && fresh && latestAvailable && (
        <div className="mb-4 px-4 py-2.5 rounded-lg bg-[var(--sem-weak-bg)] border border-[var(--sem-weak-bd)] text-[var(--sem-weak-fg)] text-small flex items-start gap-2">
          <span className="text-lead leading-tight">⚠️</span>
          <div>
            <p className="font-medium">
              表示中のデータは {latestAvailable} ({fresh.bdays} 営業日前) のものです
            </p>
            <p className="text-caption text-[var(--sem-weak-fg)] mt-0.5">
              現在は決算閑散期 (3/6/9/12 月) のため、本スキャナー対象 (1Q-3Q + FY) の新規開示がありません。
              「直近の開示日」のデータが残り続けるため、「今日のデータ」ではない点にご注意ください。
            </p>
          </div>
        </div>
      )}

      {!isLatest && selectedDate && (
        <div className="mb-4 px-4 py-2 rounded-lg bg-[var(--sem-watch-bg)] border border-[var(--sem-watch-bd)] text-[var(--sem-watch-fg)] text-small font-medium">
          {selectedDate} のスナップショットを表示中
        </div>
      )}

      {snapshot.error && (
        <ErrorBanner detail={snapshot.error} onRetry={() => fetchData(selectedDate ?? undefined)} />
      )}

      {loading && snapshot.rows.length === 0 && (
        <div
          className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-8 text-center"
          style={{ color: 'var(--text-muted)' }}
        >
          <p className="text-title font-medium">読み込み中…</p>
        </div>
      )}

      {!loading && snapshot.rows.length === 0 && (
        <div
          className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-8 text-center"
          style={{ color: 'var(--text-muted)' }}
        >
          <p className="text-title font-medium mb-2">データが見つかりません</p>
          <p className="text-small">
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
