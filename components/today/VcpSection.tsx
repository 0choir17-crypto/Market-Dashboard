'use client'

import { useMemo, useState } from 'react'
import type { DailyVcpScreen } from '@/types/vcp'
import VcpHeader from '@/components/vcp/VcpHeader'
import VcpStats from '@/components/vcp/VcpStats'
import VcpFilter, {
  applyPreset,
  type FilterPreset,
} from '@/components/vcp/VcpFilter'
import VcpTable from '@/components/vcp/VcpTable'

type Props = {
  rows: DailyVcpScreen[]
}

export default function VcpSection({ rows }: Props) {
  const [preset, setPreset] = useState<FilterPreset>('all')

  const counts: Record<FilterPreset, number> = useMemo(
    () => ({
      all: rows.length,
      strong: applyPreset(rows, 'strong').length,
      pivot: applyPreset(rows, 'pivot').length,
      tight: applyPreset(rows, 'tight').length,
    }),
    [rows],
  )

  const filtered = useMemo(() => applyPreset(rows, preset), [rows, preset])

  const regime = useMemo(
    () => rows.find(r => r.regime != null)?.regime ?? null,
    [rows],
  )
  const mcV4 = useMemo(
    () => rows.find(r => r.mc_v4 != null)?.mc_v4 ?? null,
    [rows],
  )

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-[#e8eaed] shadow-sm p-8 text-center text-[var(--text-muted)]">
        <p className="text-sm">本日の VCP 候補は 0 件です。</p>
      </div>
    )
  }

  return (
    <>
      <VcpHeader regime={regime} mcV4={mcV4} />
      <VcpStats rows={rows} />
      <VcpFilter preset={preset} onChange={setPreset} counts={counts} />
      <VcpTable rows={filtered} />
    </>
  )
}
