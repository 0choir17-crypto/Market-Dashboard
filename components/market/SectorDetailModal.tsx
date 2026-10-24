'use client'

import { useEffect, useState } from 'react'
import Modal from '@/components/shared/Modal'
import TvChart from '@/components/chart/TvChart'
import type { MaLength } from '@/components/sectors33/SectorCandleChart'
import { SECTOR_CHART_VISIBLE_BARS, fetchSectorChart, type SectorTrend } from '@/lib/sectorTrendFetch'
import type { OhlcvBar, VolumeBar } from '@/types/chart'
import { CloseVs, EmaChain, SelfRow, SignalPill, Slopes } from './trendAtoms'

// 業種カードの詳細。判定の材料 + 自力 t 値 + TradingView 風チャート。
// 直近 150 営業日を表示する（EMA の助走ぶんはその手前に取ってある）。期間の切替は持たない。

const MA_LENGTHS: MaLength[] = [9, 21, 50]

export default function SectorDetailModal({
  sector,
  endDate,
  onClose,
}: {
  sector: SectorTrend
  endDate?: string
  onClose: () => void
}) {
  const [data, setData] = useState<{ bars: OhlcvBar[]; volumes: VolumeBar[]; error: string | null } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchSectorChart(sector.sector, endDate).then((res) => {
      if (!cancelled) setData(res)
    })
    return () => {
      cancelled = true
    }
  }, [sector.sector, endDate])

  const st = sector.state
  return (
    <Modal open onClose={onClose} title={sector.sector} size="xl">
      <div className="p-6 space-y-4">
        {st && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-small">
            <SignalPill signal={st.signal} label={st.label} />
            <Slopes state={st} />
            <EmaChain state={st} />
            <div className="flex gap-4 text-caption">
              <CloseVs state={st} label="週足EMA9" value={st.weeklyEma9} />
              <CloseVs state={st} label="EMA50" value={st.ema50} />
            </div>
          </div>
        )}
        <div className="max-w-xs">
          <SelfRow s={sector} />
        </div>

        {data?.error ? (
          <div className="rounded-md bg-[var(--sem-weak-bg)] text-small text-[var(--sem-weak-fg)] p-4">
            チャート取得エラー: {data.error}
          </div>
        ) : !data ? (
          <div className="flex items-center justify-center rounded-md bg-[var(--bg-card-hover)] text-small text-[var(--text-muted)] h-[520px]">
            読み込み中…
          </div>
        ) : (
          <TvChart title={sector.sector} bars={data.bars} volumes={data.volumes} volumeLabel="業種出来高" maLengths={MA_LENGTHS} visibleBars={SECTOR_CHART_VISIBLE_BARS} />
        )}
        <p className="text-caption text-[var(--text-muted)]">
          自力 t21 / t63 = TOPIX につられた分を除いた業種の強さ
        </p>
      </div>
    </Modal>
  )
}
