'use client'

import { useMemo, useState } from 'react'
import type { DailyVcpScreen } from '@/types/vcp'
import type { StructurePivotRow } from '@/types/structurePivot'
import type { DailySignal } from '@/types/signals'
import { ADOPTED_SCREENS } from '@/lib/screenNames'
import StockChartView from '@/components/chart/StockChartView'
import CategoryBox, { type TickerItem } from './CategoryBox'

type Props = {
  vcp: DailyVcpScreen[]
  pivot: StructurePivotRow[]
  signals: DailySignal[]
  hotSectors: string[]
}

type CategoryGroup = {
  key: string
  title: string
  description?: string
  items: TickerItem[]
  accent: 'vcp' | 'pivot' | 'signals' | 'cross'
}

const vcpToItem = (r: DailyVcpScreen): TickerItem => ({
  code: r.code,
  name: r.name,
  sector: r.sector_s33,
})

const pivotToItem = (r: StructurePivotRow): TickerItem => ({
  code: r.code,
  name: r.name,
  sector: r.sector_s33,
})

const signalToItem = (r: DailySignal): TickerItem => ({
  code: r.code,
  name: r.company_name,
  sector: r.sector_s33,
})

export default function CardsView({ vcp, pivot, signals, hotSectors }: Props) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  const hotSet = useMemo(() => new Set(hotSectors), [hotSectors])

  const groups: CategoryGroup[] = useMemo(() => {
    const vcpItems = vcp.map(vcpToItem)

    const pivotHlBreak = pivot
      .filter(r => r.signal_type === 'HL_BREAK')
      .map(pivotToItem)

    const pivotInstitutional = pivot
      .filter(r => r.jq_institutional_pass)
      .map(pivotToItem)

    const adoptedKeys = [...ADOPTED_SCREENS]
    const signalsSeen = new Set<string>()
    const signalsItems: TickerItem[] = []
    for (const s of signals) {
      const hitsAdopted = s.screen_name
        .split('|')
        .map(n => n.trim())
        .some(n => adoptedKeys.includes(n))
      if (!hitsAdopted) continue
      if (signalsSeen.has(s.code)) continue
      signalsSeen.add(s.code)
      signalsItems.push(signalToItem(s))
    }

    const meta = new Map<string, TickerItem>()
    for (const r of signals) meta.set(r.code, signalToItem(r))
    for (const r of pivot) meta.set(r.code, pivotToItem(r))
    for (const r of vcp) meta.set(r.code, vcpToItem(r))

    const sourceMap = new Map<string, Set<string>>()
    const addCode = (code: string, source: string) => {
      if (!sourceMap.has(code)) sourceMap.set(code, new Set())
      sourceMap.get(code)!.add(source)
    }
    vcp.forEach(r => addCode(r.code, 'vcp'))
    pivot.forEach(r => addCode(r.code, 'pivot'))
    signals.forEach(s => addCode(s.code, 'signals'))
    const multiHit: TickerItem[] = [...sourceMap.entries()]
      .filter(([, sources]) => sources.size >= 2)
      .map(([code]) => meta.get(code) ?? { code, name: null, sector: null })

    return [
      {
        key: 'cross-multi',
        title: 'Tickers in 2+ Screens',
        description: 'VCP / Pivot / Signals のうち 2 つ以上にヒット',
        items: multiHit,
        accent: 'cross',
      },
      {
        key: 'vcp',
        title: 'VCP',
        description: 'Volatility Contraction Pattern 候補',
        items: vcpItems,
        accent: 'vcp',
      },
      {
        key: 'pivot-hlbreak',
        title: 'Pivot — HL_BREAK',
        description: 'Structure Pivot ブレイクアウト（即時アクション）',
        items: pivotHlBreak,
        accent: 'pivot',
      },
      {
        key: 'pivot-institutional',
        title: 'Pivot — Institutional',
        description: '業績 × 機関買い × セクター強度 を満たす厳選 Pivot',
        items: pivotInstitutional,
        accent: 'pivot',
      },
      {
        key: 'signals',
        title: 'Signals',
        description: 'Daily Signals（採用スクリーン: Div Bear / Value）',
        items: signalsItems,
        accent: 'signals',
      },
    ]
  }, [vcp, pivot, signals])

  const expandedGroup = expandedKey
    ? groups.find(g => g.key === expandedKey) ?? null
    : null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-gray-500 px-1">
        <span>
          カードをクリックで全銘柄チャートを展開 ・{' '}
          <span className="inline-flex items-center gap-1">
            <span
              className="inline-block w-3 h-3 rounded"
              style={{ backgroundColor: '#dcfce7', border: '1px solid #86efac' }}
            />
            資金集中セクター（component_flow ≥ 70）
          </span>
        </span>
        <span className="font-mono">
          🟢 {hotSectors.length} hot sectors
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {groups.map(g => (
          <CategoryBox
            key={g.key}
            title={g.title}
            description={g.description}
            items={g.items}
            accent={g.accent}
            hotSectors={hotSet}
            expanded={expandedKey === g.key}
            onToggleExpand={() =>
              setExpandedKey(prev => (prev === g.key ? null : g.key))
            }
          />
        ))}
      </div>

      {expandedGroup && expandedGroup.items.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              📊 {expandedGroup.title}
              <span className="ml-2 text-xs font-normal text-gray-500">
                {expandedGroup.items.length} charts
              </span>
            </h2>
            <button
              onClick={() => setExpandedKey(null)}
              className="text-xs px-3 py-1 rounded border border-[var(--border)] bg-white hover:bg-gray-50 text-[var(--text-secondary)]"
            >
              閉じる ✕
            </button>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {expandedGroup.items.map(item => (
              <StockChartView
                key={item.code}
                code={item.code}
                name={item.name}
                sector={item.sector}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
