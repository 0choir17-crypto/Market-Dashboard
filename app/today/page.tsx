'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDate } from '@/contexts/DateContext'
import { fetchToday, type TodayResponse } from '@/lib/todayFetch'
import PullbackSetupsSection from '@/components/today/PullbackSetupsSection'
import VolumeIgnitionSection from '@/components/today/VolumeIgnitionSection'
import SpringSetupsSection from '@/components/today/SpringSetupsSection'
import BoxBreakoutSection from '@/components/today/BoxBreakoutSection'
import StructurePivotSection from '@/components/today/StructurePivotSection'
import ErrorBanner from '@/components/shared/ErrorBanner'
import PageHeader from '@/components/shared/PageHeader'
import { ChartModalProvider } from '@/contexts/ChartModalContext'

export default function TodayPage() {
  const { selectedDate, isLatest } = useDate()
  const [data, setData] = useState<TodayResponse>({
    coilDate: null,
    coil: [],
    maDate: null,
    ma: [],
    igniteDate: null,
    ignite: [],
    springDate: null,
    spring: [],
    boxDate: null,
    box: [],
    structDate: null,
    struct: [],
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

  const displayDate =
    data.structDate ?? data.boxDate ?? data.coilDate ?? data.maDate ?? data.igniteDate ?? data.springDate ?? selectedDate
  const total =
    data.coil.length +
    data.ma.length +
    data.ignite.length +
    data.spring.length +
    data.box.length +
    data.struct.length

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
    addList(data.coil)
    addList(data.ma)
    addList(data.ignite)
    addList(data.spring)
    addList(data.box)
    addList(data.struct)
    const set = new Set<string>()
    for (const [code, n] of counts) if (n >= 2) set.add(code)
    return set
  }, [data])

  return (
    <ChartModalProvider>
    <main className="min-h-screen p-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <PageHeader
        title="Daily Watch"
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
          <StructurePivotSection
            rows={data.struct}
            hotSectors={data.hotSectors}
            multiHitCodes={multiHitCodes}
            title="Structure Pivot"
            subtitle="押し安値切り上がり（HL）から作る構造の 1st（建玉ライン=HL+0.618戻し）/ 2nd（スイングハイ）ヒット。本日ヒットした銘柄のみ表示。本日どちら（1st/2nd）にヒットしたかを明示し、1st・2nd それぞれの直近ヒットを営業日前で併記（本日ヒットは緑で強調）。終了済み（TP2/Stop）は除外。買い指示ではなくウォッチリスト（執行は手動チャート判断）。"
          />
          <BoxBreakoutSection
            rows={data.box}
            hotSectors={data.hotSectors}
            multiHitCodes={multiHitCodes}
            title="Box Breakout"
            subtitle="20営業日以上のベース（揉み合い箱）を上抜けた候補。表示は確認中(PENDING)のみ。レジスタンス(pivot)とサポート(eff_box_low)をチャートに引く。売買シグナルではなくウォッチリスト。"
          />
          <PullbackSetupsSection
            kind="coil"
            rows={data.coil}
            hotSectors={data.hotSectors}
            multiHitCodes={multiHitCodes}
            title="Coil Pullback"
            subtitle="高値圏で値幅が収縮（iqr5 小）した銘柄。ブレイク前の蓄積。小さいほどタイト。"
          />
          <PullbackSetupsSection
            kind="ma"
            rows={data.ma}
            hotSectors={data.hotSectors}
            multiHitCodes={multiHitCodes}
            title="MA Pullback"
            subtitle="走行中の強い銘柄が移動平均まで押した局面。バッジ＝深さ(MA)×位置(52週高値)。A(50)×A++ が最上位。"
          />
          <VolumeIgnitionSection
            rows={data.ignite}
            hotSectors={data.hotSectors}
            multiHitCodes={multiHitCodes}
            title="Volume Ignition"
            subtitle="上昇トレンド中に出来高が枯れた後、上昇日に出来高2倍で再点火した初動。高ADRの瞬発系（直近5営業日以内に点火）。"
          />
          <SpringSetupsSection
            rows={data.spring}
            hotSectors={data.hotSectors}
            multiHitCodes={multiHitCodes}
            title="Momentum Spring"
            subtitle="モメンタムリーダーが下側の基準線を防衛して短期の押しから踏ん張った局面（①点火ライン死守 / ③安値リクレイム）。防衛ライン割れがストップ。"
          />
        </div>
      )}
    </main>
    </ChartModalProvider>
  )
}
