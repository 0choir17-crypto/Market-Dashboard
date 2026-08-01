'use client'

import {
  RANK_DELTA_PERIODS,
  BIG_MOVE_THRESHOLD,
  isBigMove,
  type RankDelta,
  type RankDeltaPeriodKey,
} from '@/lib/sectorRankDelta'
import Tooltip from '@/components/shared/Tooltip'

function periodLabel(key: RankDeltaPeriodKey): string {
  return RANK_DELTA_PERIODS.find(p => p.key === key)?.label ?? key
}

function tooltipFor(d: RankDelta | undefined, period: RankDeltaPeriodKey): string {
  const label = periodLabel(period)
  if (!d || (d.delta === null && !d.isNew)) {
    return `${label} 順位変動 — 比較できる履歴がありません`
  }
  if (d.isNew) {
    return `${label} 順位変動 — ${d.toDate} に新規計上（${label}前のランクなし）`
  }
  const dir = d.delta! > 0 ? '上昇' : d.delta! < 0 ? '下落' : '変化なし'
  return `${label} 順位変動: ${d.fromRank}位 → ${d.toRank}位（${dir} ${Math.abs(d.delta!)}）\n${d.fromDate} → ${d.toDate}`
}

/**
 * 順位変動バッジ（▲3 / ▼2 / — / NEW）。ランク番号の隣に置く。
 *
 * 順位は小さいほど上位なので、delta>0 = 順位が上がった = 緑▲。
 */
export function RankDeltaBadge({
  delta,
  period,
  size = 'sm',
}: {
  delta: RankDelta | undefined
  period: RankDeltaPeriodKey
  /** sm=テーブル行 / md=チャートカード見出し */
  size?: 'sm' | 'md'
}) {
  const text = size === 'md' ? 'text-[11px]' : 'text-[10px]'
  const pad = size === 'md' ? 'px-1.5 py-0.5' : 'px-1 py-0'

  let body: string
  let color = 'var(--text-muted)'
  let bg = 'transparent'
  let weight = 'font-medium'

  if (delta?.isNew) {
    body = 'NEW'
    color = 'var(--accent)'
    bg = 'var(--accent-bg)'
    weight = 'font-bold'
  } else if (delta?.delta === null || delta === undefined) {
    body = '—'
  } else if (delta.delta === 0) {
    body = '—'
  } else {
    const up = delta.delta > 0
    body = `${up ? '▲' : '▼'}${Math.abs(delta.delta)}`
    color = up ? 'var(--positive)' : 'var(--negative)'
    if (isBigMove(delta)) {
      bg = up ? 'var(--positive-bg)' : 'var(--negative-bg)'
      weight = 'font-bold'
    }
  }

  // 33行ぶん並ぶので Tooltip（"?" アイコンが付く）ではなく素の title を使う
  return (
    <span
      title={tooltipFor(delta, period)}
      className={`inline-block rounded font-mono tabular-nums whitespace-nowrap ${text} ${pad} ${weight}`}
      style={{ color, backgroundColor: bg }}
    >
      {body}
    </span>
  )
}

/**
 * 比較期間の切替（1D / 1W / 1M）。テーブルとチャートで同じ期間を共有する。
 */
export function RankDeltaPeriodToggle({
  value,
  onChange,
}: {
  value: RankDeltaPeriodKey
  onChange: (v: RankDeltaPeriodKey) => void
}) {
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <Tooltip content={`ランク変動の比較期間。${BIG_MOVE_THRESHOLD}位以上動いた業種は色付きで強調されます`}>
        <span className="text-[var(--text-muted)]">ランク変動:</span>
      </Tooltip>
      <span className="inline-flex rounded-md border border-[var(--border)] overflow-hidden">
        {RANK_DELTA_PERIODS.map((p, i) => (
          <button
            key={p.key}
            onClick={() => onChange(p.key)}
            className={`px-2 py-0.5 font-mono ${
              value === p.key
                ? 'bg-[var(--accent-bg)] text-[var(--accent)] font-bold'
                : 'bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'
            } ${i > 0 ? 'border-l border-[var(--border)]' : ''}`}
          >
            {p.label}
          </button>
        ))}
      </span>
    </span>
  )
}

/**
 * 「変動が大きい業種だけ」の絞り込みチェックボックス。
 */
export function MoversOnlyToggle({
  checked,
  onChange,
  count,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  count: number
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="accent-[var(--accent)]"
      />
      変動 ±{BIG_MOVE_THRESHOLD}位以上のみ
      <span className="text-[var(--text-muted)]">
        （<span className="font-mono">{count}</span> 件）
      </span>
    </label>
  )
}
