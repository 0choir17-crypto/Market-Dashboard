'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDate } from '@/contexts/DateContext'
import { fetchToday, type TodayResponse } from '@/lib/todayFetch'
import EmaSetupsSection from '@/components/today/EmaSetupsSection'
import StructurePivotSection from '@/components/today/StructurePivotSection'
import ErrorBanner from '@/components/shared/ErrorBanner'
import PageHeader from '@/components/shared/PageHeader'

const EMPTY: TodayResponse = {
  emaDate: null,
  ema: [],
  emaTableMissing: false,
  structDate: null,
  struct: [],
  hotSectors: [],
  error: null,
}

export default function TodayPage() {
  const { selectedDate, isLatest } = useDate()
  const [data, setData] = useState<TodayResponse>(EMPTY)
  const [loading, setLoading] = useState(true)
  // 日付を素早く切り替えた際に古い応答が新しいバナーの下に残らないよう、
  // 最後のリクエストだけを採用する。
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

  // ページ見出しの日付は現役スキャナーの最大 date のみから決める
  // （2026-08-29 に廃止された6テーブルは参照しない。参照すると 2026-08-28 で
  //   止まった日付を「最終更新日」として出し続けてしまう）。
  const displayDate = data.structDate ?? data.emaDate ?? selectedDate

  const total = data.ema.length + data.struct.length

  // 複数シグナル重複: 同一 code が 2 つ以上のスキャナーに当日出た銘柄。
  // 各スキャナーのカード背景を黄色で強調するために code の集合を作る。
  const multiHitCodes = useMemo(() => {
    const counts = new Map<string, number>()
    const addList = (rows: { code: string }[]) => {
      const local = new Set<string>()
      for (const r of rows) {
        if (!r.code || local.has(r.code)) continue // 同一リスト内の重複はカウントしない
        local.add(r.code)
        counts.set(r.code, (counts.get(r.code) ?? 0) + 1)
      }
    }
    addList(data.ema)
    addList(data.struct)
    const set = new Set<string>()
    for (const [code, n] of counts) if (n >= 2) set.add(code)
    return set
  }, [data])

  return (
    <main className="min-h-screen p-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <PageHeader
        title="Daily Watch"
        date={displayDate}
        isLatest={isLatest}
        onRefresh={fetchData}
        refreshing={loading}
      />

      {!isLatest && selectedDate && (
        <div className="mb-4 px-4 py-2 rounded-lg bg-[var(--sem-watch-bg)] border border-[var(--sem-watch-bd)] text-[var(--sem-watch-fg)] text-sm font-medium">
          {selectedDate} のスナップショットを表示中
          {displayDate && displayDate !== selectedDate && (
            <span className="ml-2 font-normal text-[var(--sem-watch-fg)]">
              （各テーブルは {displayDate} の最近値にフォールバック）
            </span>
          )}
        </div>
      )}

      {data.error && <ErrorBanner detail={data.error} onRetry={fetchData} />}

      {loading && total === 0 ? (
        <div
          className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-8 text-center"
          style={{ color: 'var(--text-muted)' }}
        >
          <p className="text-lg font-medium">読み込み中…</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <StructurePivotSection
            rows={data.struct}
            hotSectors={data.hotSectors}
            multiHitCodes={multiHitCodes}
            title="Structure Pivot"
            subtitle="押し安値切り上がり（HL）から作る構造の 1st（建玉ライン=HL+0.618戻し）/ 2nd（スイングハイ）ヒット。本日ヒットした銘柄のみ表示。本日どちら（1st/2nd）にヒットしたかを明示し、1st・2nd それぞれの直近ヒット日を併記（本日ヒットは緑で強調）。終了済み（TP2/Stop）は除外。買い指示ではなくウォッチリスト（執行は手動チャート判断）。"
          />
          <EmaSetupsSection
            rows={data.ema}
            tableMissing={data.emaTableMissing}
            hotSectors={data.hotSectors}
            multiHitCodes={multiHitCodes}
            title="EMA Setups"
            subtitle="下落してきて EMA 9 / 21 / 50 にちょうど到達し、安値が「EMA のすぐ下 0.1ATR」の帯に収まって踏みとどまった日。EMA を明確に割った日は含まない。同じ銘柄が複数の EMA に同日タッチすると EMA バッジが並ぶ。※このスキャナーに統計的エッジは無い（勝率 23.6% に対しベースライン 23.1%、耐えの深さ・ヒゲ/実体・EMA の別はいずれも AUC 0.50）。買いシグナルではなく、毎朝チャートを開く銘柄を機械的に絞り込んだリストとして使う。"
          />
        </div>
      )}
    </main>
  )
}
