'use client'

// 切り口別の期待値表。トレードを属性で分け、グループごとに computeRStats を回す
// （Journal 上段の RiskRewardPanel と同じ定義なので数字がずれない）。

import { useMemo, useState } from 'react'
import { Trade } from '@/types/trades'
import { computeRStats, R_BASIS_LABEL, R_UNIT, RBasis, RStats } from '@/lib/rStats'
import { ENTRY_TYPES, isPullback } from '@/lib/entryTypes'
import { EXIT_REASONS } from '@/components/journal/CloseTradeModal'
import { formatPct } from '@/lib/format'

const UNSET = '未設定'
/** これ未満の件数は参考値として薄く表示 */
const MIN_SAMPLE = 10

type Dim = {
  key: string
  label: string
  groupOf: (t: Trade) => string
  /** 表示順（ここに無いグループは件数順で後ろに並べる） */
  order?: readonly string[]
}

const DIMS: Dim[] = [
  {
    key: 'mc',
    label: '相場環境（MC 条件）',
    groupOf: t => t.mc_met_at_entry == null ? UNSET : t.mc_met_at_entry ? '条件クリア' : '条件未達',
    order: ['条件クリア', '条件未達', UNSET],
  },
  {
    key: 'mc_condition',
    label: '相場環境（状態名）',
    groupOf: t => t.mc_condition_at_entry?.trim() || UNSET,
  },
  {
    key: 'entry_type',
    label: 'エントリー種別',
    groupOf: t => t.entry_type?.trim() || UNSET,
    order: [...ENTRY_TYPES, UNSET],
  },
  {
    key: 'entry_family',
    label: '押し目 vs ブレイク',
    groupOf: t => !t.entry_type ? UNSET : isPullback(t.entry_type) ? '押し目（計）' : t.entry_type,
    order: ['押し目（計）', 'ブレイク', 'その他', UNSET],
  },
  {
    key: 'screen',
    label: 'スクリーン',
    groupOf: t => t.screen_name?.trim() || UNSET,
  },
  {
    key: 'exit_reason',
    label: '決済理由',
    groupOf: t => t.exit_reason?.trim() || UNSET,
    order: [...EXIT_REASONS, UNSET],
  },
]

function fmtU(v: number | null, u: string): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}${u}`
}

function rClass(v: number | null): string {
  if (v == null) return 'text-[var(--text-muted)]'
  return v > 0 ? 'text-[var(--positive)]' : v < 0 ? 'text-[var(--negative)]' : 'text-[var(--text-secondary)]'
}

export default function ExpectancyBreakdown({ trades, basis }: { trades: Trade[]; basis: RBasis }) {
  const u = R_UNIT[basis]
  const fmtR = (v: number | null) => fmtU(v, u)
  const [dimKey, setDimKey] = useState('mc')
  const dim = DIMS.find(d => d.key === dimKey) ?? DIMS[0]

  const rows = useMemo(() => {
    // 決済済みと、その分割元の建玉（stillOpen 判定用）を同じグループに入れる
    const groups = new Map<string, Trade[]>()
    for (const t of trades) {
      if (t.status !== 'closed' && t.status !== 'open') continue
      const g = dim.groupOf(t)
      const arr = groups.get(g)
      if (arr) arr.push(t)
      else groups.set(g, [t])
    }
    const out: { group: string; s: RStats }[] = []
    for (const [group, ts] of groups) {
      const s = computeRStats(ts, '', basis)
      if (s.positions > 0) out.push({ group, s })
    }
    const order = dim.order ?? []
    const rank = (g: string) => { const i = order.indexOf(g); return i < 0 ? order.length : i }
    out.sort((a, b) => rank(a.group) - rank(b.group) || b.s.positions - a.s.positions)
    return out
  }, [trades, dim, basis])

  if (rows.length === 0) return null

  return (
    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-4 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="text-small font-medium text-[var(--text-primary)]">
          切り口別の期待値
          <span className="ml-2 text-caption font-normal text-[var(--text-muted)]">{R_BASIS_LABEL[basis]}</span>
        </h3>
        <select
          value={dimKey}
          onChange={e => setDimKey(e.target.value)}
          aria-label="切り口"
          className="text-caption px-2 py-1 rounded-md border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)]"
        >
          {DIMS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-small">
          <thead>
            <tr className="text-caption text-[var(--text-muted)] border-b border-[var(--border)]">
              <th className="text-left font-medium py-1.5 pr-2">グループ</th>
              <th className="text-right font-medium py-1.5 px-2">件数</th>
              <th className="text-right font-medium py-1.5 px-2">勝率</th>
              <th className="text-right font-medium py-1.5 px-2">平均勝ち</th>
              <th className="text-right font-medium py-1.5 px-2">平均負け</th>
              <th className="text-right font-medium py-1.5 px-2">期待値</th>
              <th className="text-right font-medium py-1.5 pl-2">合計 {u}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ group, s }) => {
              const thin = s.withR < MIN_SAMPLE
              return (
                <tr key={group} className={`border-b border-[var(--border)] last:border-0 ${thin ? 'opacity-60' : ''}`}>
                  <td className="py-1.5 pr-2 whitespace-nowrap text-[var(--text-primary)]">
                    {group}
                    {thin && <span className="ml-1.5 text-caption text-[var(--text-muted)]">参考値</span>}
                  </td>
                  <td className="py-1.5 px-2 text-right num text-[var(--text-secondary)]">
                    {s.positions}{s.missingR > 0 && <span className="text-[var(--text-muted)]">（{u} {s.withR}）</span>}
                  </td>
                  <td className="py-1.5 px-2 text-right num text-[var(--text-secondary)]">
                    {s.winRate != null ? formatPct(s.winRate, { digits: 0 }) : '—'}
                  </td>
                  <td className="py-1.5 px-2 text-right num text-[var(--text-secondary)]">{fmtR(s.avgWinR)}</td>
                  <td className="py-1.5 px-2 text-right num text-[var(--text-secondary)]">{fmtR(s.avgLossR)}</td>
                  <td className={`py-1.5 px-2 text-right num font-medium ${rClass(s.expectancy)}`}>{fmtR(s.expectancy)}</td>
                  <td className={`py-1.5 pl-2 text-right num ${rClass(s.withR > 0 ? s.totalR : null)}`}>
                    {s.withR > 0 ? fmtR(s.totalR) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-caption text-[var(--text-muted)] mt-2">
        件数は分割決済を束ねたポジション数。期待値・平均は{basis === 'stop' ? '初期ストップ' : 'ATR'}があるものだけで計算。
        算出 {MIN_SAMPLE} 件未満は参考値。
      </p>
    </div>
  )
}
