'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchLatestSectorSelection } from '@/lib/sectorSelectionFetch'
import {
  fetchSectorSelectionHistory,
  type SectorHistoryResponse,
} from '@/lib/sectorSelectionHistoryFetch'
import {
  fetchSectorIndexChanges,
  type SectorIndexChangeEntry,
} from '@/lib/sectorIndexChangeFetch'
import {
  buildRankDeltas,
  DEFAULT_RANK_DELTA_PERIOD,
  RANK_DELTA_PERIODS,
  type RankDeltaPeriodKey,
} from '@/lib/sectorRankDelta'
import { RankDeltaPeriodToggle } from './SectorRankDelta'
import { SectorSelectionRow } from '@/types/sectorSelection'
import SectorSelectionTable from './SectorSelectionTable'
import SectorChartGallery from './SectorChartGallery'
import SectorRRG33 from './SectorRRG33'
import SectorBarChart33 from './SectorBarChart33'
import { MaLegend } from './SectorCandleChart'
import ErrorBanner from '@/components/shared/ErrorBanner'

type View = 'bar' | 'rrg'
type MainView = 'chart' | 'table'

/**
 * Sector Selection 一式（ランキング / 業種指数チャート / 推移ビジュアル）。
 * Market ダッシュボードに統合したため、ページではなくセクションとして持つ。
 */
export default function SectorSection({
  showHeading = true,
}: {
  showHeading?: boolean
}) {
  const [rows, setRows] = useState<SectorSelectionRow[]>([])
  const [latestDate, setLatestDate] = useState<string | null>(null)
  const [history, setHistory] = useState<SectorHistoryResponse>({
    dates: [],
    bySector: {},
    sectorsRanked: [],
  })
  // 業種指数の騰落率 (1D / 1M / 6M / 1Y)（ランキング本体より後に届く）
  const [changes, setChanges] = useState<Record<string, SectorIndexChangeEntry>>({})
  const [view, setView] = useState<View>('bar')
  // 既定はテーブル（一覧で順位・スコアを俯瞰したいことが多いため）
  const [mainView, setMainView] = useState<MainView>('table')
  // ランク変動の比較期間。テーブルとチャートで共有する
  const [deltaPeriod, setDeltaPeriod] = useState<RankDeltaPeriodKey>(
    DEFAULT_RANK_DELTA_PERIOD,
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 再取得の高速連打時に古い応答が後着して新しい表示を上書きしないためのガード
  const requestIdRef = useRef(0)

  const fetchData = useCallback(async () => {
    const reqId = ++requestIdRef.current
    setLoading(true)
    const [latest, hist] = await Promise.all([
      fetchLatestSectorSelection(),
      fetchSectorSelectionHistory(63),
    ])
    if (reqId !== requestIdRef.current) return // 古いリクエストの応答は破棄
    setRows(latest.rows)
    setLatestDate(latest.latestDate)
    setHistory(hist)
    // ランキング本体と履歴、どちらの失敗も「0件」と区別して表示する
    setError([latest.error, hist.error].filter(Boolean).join(' / ') || null)
    setLoading(false)

    // 騰落率は営業日リストを 1業種ぶんだけ引いてから取りたいので、ランキング取得後に。
    // 表の描画は待たせず、届いた時点で「—」から実値に差し替える。
    const reference = latest.rows[0]?.sector_name_s33
    if (!reference) {
      setChanges({})
      return
    }
    const chg = await fetchSectorIndexChanges(reference)
    if (reqId !== requestIdRef.current) return
    setChanges(chg.bySector)
    if (chg.error) setError(prev => [prev, chg.error].filter(Boolean).join(' / '))
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // 順位変動は取得済みの履歴から算出するので追加のフェッチは不要
  const rankDeltas = useMemo(() => {
    const days =
      RANK_DELTA_PERIODS.find(p => p.key === deltaPeriod)?.tradingDays ?? 5
    return buildRankDeltas(history, days)
  }, [history, deltaPeriod])

  return (
    <section>
      {/* セクションヘッダー + EMA 凡例 */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          {showHeading && (
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              Sector Selection
            </h2>
          )}
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            TOPIX-33 業種別 composite_score（今どこを買うか）
            {latestDate && (
              <span className="ml-2 text-gray-400 font-mono">{latestDate}</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* EMA 凡例: チャート内の細線では色が判別しづらいのでここに大きく置く */}
          {mainView === 'chart' && <MaLegend />}

          <RankDeltaPeriodToggle value={deltaPeriod} onChange={setDeltaPeriod} />

          <div className="inline-flex rounded-lg border border-[var(--border)] overflow-hidden text-xs">
            {(
              [
                { v: 'chart' as const, label: 'チャート' },
                { v: 'table' as const, label: 'テーブル' },
              ]
            ).map((opt, i) => (
              <button
                key={opt.v}
                onClick={() => setMainView(opt.v)}
                className={`px-3 py-1.5 font-medium ${
                  mainView === opt.v
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'
                } ${i > 0 ? 'border-l border-[var(--border)]' : ''}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <ErrorBanner detail={error} onRetry={fetchData} />}

      {loading && rows.length === 0 && (
        <div
          className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-8 text-center"
          style={{ color: 'var(--text-muted)' }}
        >
          <p className="text-lg font-medium">読み込み中…</p>
        </div>
      )}

      {!loading && rows.length === 0 ? (
        <div
          className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-8 text-center"
          style={{ color: 'var(--text-muted)' }}
        >
          <p className="text-lg font-medium mb-2">データが見つかりません</p>
          <p className="text-sm">Supabase の sector_selection_s33 テーブルにデータを挿入してください。</p>
        </div>
      ) : rows.length > 0 && (
        <>
          {mainView === 'chart' ? (
            <SectorChartGallery
              rows={rows}
              changes={changes}
              rankDeltas={rankDeltas}
              deltaPeriod={deltaPeriod}
            />
          ) : (
            <SectorSelectionTable
              rows={rows}
              changes={changes}
              rankDeltas={rankDeltas}
              deltaPeriod={deltaPeriod}
            />
          )}

          {/* ── 推移ビジュアル ────────────────────────────────────────────
              普段は使わないので既定は折りたたみ。見たいときだけ開く。 */}
          <details className="mt-6 group">
            <summary className="cursor-pointer select-none list-none flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              <span className="text-[10px] text-gray-400 group-open:rotate-90 transition-transform inline-block">
                ▶
              </span>
              {history.dates.length}営業日の推移（Bars / RRG）
              <span className="text-xs font-normal text-[var(--text-muted)]">
                — どのセクターが強いか・どう動いているかを比較
              </span>
            </summary>

            <div className="mt-3">
              <div className="flex flex-wrap items-center justify-end mb-3">
                <div className="inline-flex rounded-lg border border-[var(--border)] overflow-hidden text-xs">
                  {(
                    [
                      { v: 'bar' as const, label: 'Bars' },
                      { v: 'rrg' as const, label: 'RRG' },
                    ]
                  ).map((opt, i) => (
                    <button
                      key={opt.v}
                      onClick={() => setView(opt.v)}
                      className={`px-3 py-1.5 font-medium ${
                        view === opt.v
                          ? 'bg-[var(--accent)] text-white'
                          : 'bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'
                      } ${i > 0 ? 'border-l border-[var(--border)]' : ''}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {history.dates.length === 0 ? (
                <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-8 text-center text-gray-400 text-sm">
                  履歴データを読み込めませんでした
                </div>
              ) : view === 'bar' ? (
                <SectorBarChart33 history={history} />
              ) : (
                <SectorRRG33 history={history} />
              )}
            </div>
          </details>
        </>
      )}
    </section>
  )
}
