'use client'

import { useState } from 'react'
import { DailySignal } from '@/types/signals'
import { SCREEN_NAME_MAP, SCREEN_RANK, getRecommendedScreens, isRecommended } from '@/lib/screenNames'
import SignalsTable from './SignalsTable'

type Props = {
  signals: DailySignal[]
  marketRegime?: string | null
  scorecardRegime?: string | null
}

export default function SignalsFilter({ signals, marketRegime, scorecardRegime }: Props) {
  const [activeScreen, setActiveScreen] = useState<string>('all')

  const recommended = getRecommendedScreens(marketRegime, scorecardRegime)

  // OOS PF 降順（成績順）で全スクリーンを固定表示
  const allScreens = Object.keys(SCREEN_RANK).sort(
    (a, b) => SCREEN_RANK[a] - SCREEN_RANK[b]
  )

  // 各スクリーンのヒット数を事前計算
  const screenCounts = new Map<string, number>()
  for (const name of allScreens) {
    screenCounts.set(
      name,
      signals.filter(s =>
        s.screen_name.split('|').map(n => n.trim()).includes(name)
      ).length
    )
  }

  // フィルター条件: 選択中スクリーンが screen_name に含まれるか
  const filtered = activeScreen === 'all'
    ? signals
    : signals.filter(s =>
        s.screen_name.split('|').map(n => n.trim()).includes(activeScreen)
      )

  const btnClass = (name: string, rec: boolean, disabled: boolean) => {
    const isActive = name === activeScreen
    if (disabled) {
      return 'px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed transition-colors'
    }
    if (isActive) {
      return 'px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white border border-blue-600 transition-colors'
    }
    if (rec) {
      return 'px-3 py-1.5 rounded-lg text-sm font-medium bg-white text-amber-700 border border-amber-400 hover:bg-amber-50 transition-colors'
    }
    return 'px-3 py-1.5 rounded-lg text-sm font-medium bg-white text-gray-600 border border-[#e8eaed] hover:bg-gray-50 transition-colors'
  }

  return (
    <>
      {/* Filter buttons */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button className={btnClass('all', false, false)} onClick={() => setActiveScreen('all')}>
          All ({signals.length})
        </button>
        {allScreens.map(name => {
          const count     = screenCounts.get(name) ?? 0
          const rec       = isRecommended(name, recommended)
          const shortName = SCREEN_NAME_MAP[name] ?? name
          const disabled  = count === 0
          return (
            <button
              key={name}
              className={btnClass(name, rec, disabled)}
              onClick={() => !disabled && setActiveScreen(name)}
              disabled={disabled}
            >
              {rec && !disabled && <span className="mr-1">★</span>}
              {shortName} ({count})
            </button>
          )
        })}
      </div>

      {/* Filtered table */}
      <SignalsTable
        signals={filtered}
        marketRegime={marketRegime}
        scorecardRegime={scorecardRegime}
      />
    </>
  )
}
