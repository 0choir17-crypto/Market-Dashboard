'use client'

import type { DailySignal } from '@/types/signals'
import type { TodayMarket } from '@/lib/todayFetch'
import SignalsHeader from '@/components/signals/SignalsHeader'
import SignalsFilter from '@/components/signals/SignalsFilter'

type Props = {
  signals: DailySignal[]
  market: TodayMarket | null
}

export default function SignalsSection({ signals, market }: Props) {
  if (signals.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-[#e8eaed] shadow-sm p-8 text-center text-[var(--text-muted)]">
        <p className="text-sm">本日のシグナルは 0 件です。</p>
      </div>
    )
  }

  return (
    <>
      <SignalsHeader
        marketRegime={market?.market_regime}
        breadthRegime={market?.breadth_regime}
        scorecardRegime={market?.mc_regime_v4 ?? market?.scorecard_regime}
        mcV4Score={market?.mc_v4}
        divergenceFlag={market?.mc_divergence_flag_v4}
      />
      <SignalsFilter
        signals={signals}
        marketRegime={market?.market_regime}
        scorecardRegime={market?.scorecard_regime}
      />
    </>
  )
}
