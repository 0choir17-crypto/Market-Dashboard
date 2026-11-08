'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDate } from '@/contexts/DateContext'
import { fetchToday, type TodayResponse } from '@/lib/todayFetch'
import EmaSetupsSection from '@/components/today/EmaSetupsSection'
import StructurePivotSection from '@/components/today/StructurePivotSection'
import VahBreakoutSection from '@/components/today/VahBreakoutSection'
import WeeklyMaReclaimSection from '@/components/today/WeeklyMaReclaimSection'
import ErrorBanner from '@/components/shared/ErrorBanner'
import PageHeader from '@/components/shared/PageHeader'

const EMPTY: TodayResponse = {
  emaDate: null,
  ema: [],
  emaTableMissing: false,
  structDate: null,
  struct: [],
  vahDate: null,
  vah: [],
  vahTableMissing: false,
  weeklyDate: null,
  weekly: [],
  weeklyTableMissing: false,
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
  // 3本のうち一番新しい日付を出す。ヒット 0 件の日はそのテーブルの最新日が前日のままなので、
  // 特定のテーブルを優先すると、他が更新済みでも見出しが古い日付になる（例: 2026-11-06 の
  // 急落日は Structure Pivot が 0 件で、EMA / VAH は 11/6 なのに見出しが 11/5 になった）。
  // date は YYYY-MM-DD なので文字列比較でよい。
  const tableDates = [data.structDate, data.emaDate, data.vahDate].filter(
    (d): d is string => d != null,
  )
  const displayDate =
    tableDates.length > 0 ? tableDates.reduce((a, b) => (a > b ? a : b)) : selectedDate

  // 各テーブルは「ヒットがあった直近日」を返すので、見出しの日より古ければその日のヒットは 0 件。
  // 古い日の銘柄を当日分として見せないよう空にして、各セクションの「該当なし」を出す。
  const { ema, struct, vah } = useMemo(
    () => ({
      ema: data.emaDate === displayDate ? data.ema : [],
      struct: data.structDate === displayDate ? data.struct : [],
      vah: data.vahDate === displayDate ? data.vah : [],
    }),
    [data, displayDate],
  )

  // weekly_ma_reclaim は週次（date = 週の最後の営業日）。日次の見出しの日とは一致しないのが普通なので、
  // 上の「見出しの日より古ければ空にする」は掛けず、見出し日（displayDate）にも混ぜない。
  // セクション側で「M/D 週」を出して日付の違いを示す。
  const total = data.ema.length + data.struct.length + data.vah.length + data.weekly.length

  // 複数シグナル重複: 同一 code が 2 つ以上のスキャナーに当日出た銘柄。
  // 各スキャナーのカード背景を黄色で強調するために code の集合を作る。
  // 週次の weekly_ma_reclaim は日付がずれるので数に入れない（Weekly のカードはこの集合を参照して強調だけ付ける）。
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
    addList(ema)
    addList(struct)
    addList(vah)
    const set = new Set<string>()
    for (const [code, n] of counts) if (n >= 2) set.add(code)
    return set
  }, [ema, struct, vah])

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
        <div className="mb-4 px-4 py-2 rounded-lg bg-[var(--sem-watch-bg)] border border-[var(--sem-watch-bd)] text-[var(--sem-watch-fg)] text-small font-medium">
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
          <p className="text-title font-medium">読み込み中…</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <VahBreakoutSection
            rows={vah}
            lastHitDate={data.vahDate}
            tableMissing={data.vahTableMissing}
            multiHitCodes={multiHitCodes}
            title="VAH Breakouts"
            subtitle="TradingView の Volume Profile JP v9（自動：出来高急増の起点・配当調整なし）がチャートに付ける 3 種のシグナルが出た日。▲ベース＝起点から5本以上たって起点〜前日の VAH を終値で上抜けた（バッジに何回目のブレイクか。初回は緑）、▲前日VAH＝前日までの VAH を終値で上抜けた、◆切替直後＝出来高急増で起点が切り替わった直後に前の期間の VAH を上抜けた（赤紫）。R＝(終値−抜けた線)÷前日ATR14。灰色の「前VAH」は抜けた線の1つ前の期間の VAH。※検証（2016〜2026、線を損切りの売買）では旧定義（全上抜け）とほぼ差なし（d_R +0.014）。◆は1日2件ほどで +0.042 だが 2023〜25 年はマイナス。買いシグナルではなく、毎朝チャートを開く銘柄を機械的に絞り込んだリストとして使う。"
          />
          <StructurePivotSection
            rows={struct}
            lastHitDate={data.structDate}
            multiHitCodes={multiHitCodes}
            title="Structure Pivot"
            subtitle="押し安値切り上がり（HL）から作る構造の 1st（建玉ライン=HL+0.618戻し）/ 2nd（スイングハイ）ヒット。本日ヒットした銘柄のみ表示。本日どちら（1st/2nd）にヒットしたかを明示し、1st・2nd それぞれの直近ヒット日を併記（本日ヒットは緑で強調）。終了済み（TP2/Stop）は除外。買い指示ではなくウォッチリスト（執行は手動チャート判断）。"
          />
          <EmaSetupsSection
            rows={ema}
            lastHitDate={data.emaDate}
            tableMissing={data.emaTableMissing}
            multiHitCodes={multiHitCodes}
            title="EMA Setups"
            subtitle="下落してきて EMA 9 / 21 / 50 または EMA21L（安値で計算した EMA21）にちょうど到達し、安値が「線のすぐ下 0.1ATR」の帯に収まって踏みとどまった日。線を明確に割った日は含まない。同じ銘柄が複数の線に同日タッチするとバッジが並ぶ。IPO バッジは上場250本未満で EMA150 系の条件を免除して載った銘柄。※このスキャナーに統計的エッジは無い（勝率 23.6% に対しベースライン 23.1%、耐えの深さ・ヒゲ/実体・EMA の別はいずれも AUC 0.50）。買いシグナルではなく、毎朝チャートを開く銘柄を機械的に絞り込んだリストとして使う。"
          />
          <WeeklyMaReclaimSection
            rows={data.weekly}
            weekDate={data.weeklyDate}
            tableMissing={data.weeklyTableMissing}
            multiHitCodes={multiHitCodes}
            title="Weekly MA Reclaim"
            subtitle="週足の終値が 9EMA・21EMA・30SMA・40SMA の 4 本の上にそろった週（前週は 1 本でも下）。週の最後の営業日（金曜。祝日なら木曜）に更新され、月〜木は前の週の結果を出す。対象は個別株・前週までの 10 日平均代金 5 億円以上・株価 200 円以上・時価総額 100 億円以上。グループは日足 EMA の段階で、中は基準の線に近い順（ATR 単位）。※検証（2018〜2025、同じ対象）では、その週の終値から 252 営業日以内に 2 倍になったのは 5.4%。252 日高値から −50〜−30% 下にいた銘柄は 8.8%（値動きの大きさを揃えた値、8 年すべてで全体を上回った）、高値のすぐ近く（−5〜0%）は 4.2%。出来高の急増はこの対象では効かなかった。買いシグナルではなく、週末にチャートを開く銘柄を機械的に絞り込んだリストとして使う。"
          />
        </div>
      )}
    </main>
  )
}
