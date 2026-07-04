'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useDate } from '@/contexts/DateContext'
import { fetchToday, type TodayResponse } from '@/lib/todayFetch'
import PullbackSetupsSection from '@/components/today/PullbackSetupsSection'
import VolumeIgnitionSection from '@/components/today/VolumeIgnitionSection'
import ErrorBanner from '@/components/shared/ErrorBanner'
import PageHeader from '@/components/shared/PageHeader'

export default function TodayPage() {
  const { selectedDate, isLatest } = useDate()
  const [data, setData] = useState<TodayResponse>({
    coilDate: null,
    coil: [],
    maDate: null,
    ma: [],
    igniteDate: null,
    ignite: [],
    hotSectors: [],
    error: null,
  })
  const [loading, setLoading] = useState(true)
  // fetchToday は最大 4 往復。日付を素早く切り替えた際に古い応答が
  // 新しいバナーの下に残らないよう、最後のリクエストだけを採用する。
  const requestIdRef = useRef(0)

  const fetchData = useCallback(async () => {
    const reqId = ++requestIdRef.current
    setLoading(true)
    const result = await fetchToday({
      date: !isLatest && selectedDate ? selectedDate : undefined,
    })
    if (reqId !== requestIdRef.current) return // 古いリクエストの応答は破棄
    setData(result)
    setLoading(false)
  }, [selectedDate, isLatest])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const displayDate = data.coilDate ?? data.maDate ?? data.igniteDate ?? selectedDate
  const total = data.coil.length + data.ma.length + data.ignite.length

  return (
    <main className="min-h-screen p-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <PageHeader
        title="Daily Watch"
        subtitle={`高値圏の押し目"候補"（収縮ベース + momentum 押し目）${total} 件 ／ 買いシグナルではありません`}
        date={displayDate}
        isLatest={isLatest}
        onRefresh={fetchData}
        refreshing={loading}
      />

      {!isLatest && selectedDate && (
        <div className="mb-4 px-4 py-2 rounded-lg bg-amber-50 border border-amber-300 text-amber-800 text-sm font-medium">
          {selectedDate} のスナップショットを表示中
          {displayDate && displayDate !== selectedDate && (
            <span className="ml-2 font-normal text-amber-700">
              （押し目テーブルは {displayDate} の最近値にフォールバック）
            </span>
          )}
        </div>
      )}

      {data.error && <ErrorBanner detail={data.error} onRetry={fetchData} />}

      {loading && total === 0 ? (
        <div
          className="bg-white rounded-xl border border-[#e8eaed] shadow-sm p-8 text-center"
          style={{ color: 'var(--text-muted)' }}
        >
          <p className="text-lg font-medium">読み込み中…</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <PullbackSetupsSection
            kind="coil"
            rows={data.coil}
            hotSectors={data.hotSectors}
            title="Coil — 高値圏の静かなベース（収縮）"
            subtitle="高値圏で値幅が収縮（iqr5 小）した銘柄。ブレイク前の蓄積。小さいほどタイト。"
          />
          <PullbackSetupsSection
            kind="ma"
            rows={data.ma}
            hotSectors={data.hotSectors}
            title="MA — 高値圏 momentum の押し目"
            subtitle="走行中の強い銘柄が移動平均まで押した局面。バッジ＝深さ(MA)×位置(52週高値)。A(50)×A++ が最上位。"
          />
          <VolumeIgnitionSection
            rows={data.ignite}
            hotSectors={data.hotSectors}
            title="出来高イグニッション — 枯れ→点火の初動"
            subtitle="上昇トレンド中に出来高が枯れた後、上昇日に出来高2倍で再点火した初動。高ADRの瞬発系（直近5営業日以内に点火）。"
          />
        </div>
      )}
    </main>
  )
}
