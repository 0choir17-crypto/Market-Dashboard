'use client'

// 1 回あたりに取れるリスクの計算（Trading ページ最上段）。
//   許容損失 = 現金 × リスク %
//   建玉の上限 = 許容損失 ÷ 損切り幅 %   （損切り幅が狭いほど大きく建てられる）
//   金額は 1 円未満を切り捨て。現金を超える上限は「現金超」として薄く表示（現物では建てられない）。
//   銘柄ごとのポジションサイズ（許容損失 ÷（終値 − 損切り価格））は候補（TradePlans.tsx）に出す。
// 減速ルール中はリスク % を半分で計算。
// 下段「次に買う銘柄」の候補リストは TradePlans.tsx。
// 現金・リスク % は入力欄を離れた時に risk_settings（account_capital / risk_pct）へ保存する。
// 未ログイン等で保存できない時もこの端末には残す（localStorage）。

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatYen } from '@/lib/format'
import TradePlans, { type PlanHandoff } from '@/components/portfolio/TradePlans'

const LS_KEY = 'trading.riskBudget'
const STOP_STEPS = [0.12, 0.25, 0.5, 1, 1.5, 2, 3]

type Props = {
  /** risk_settings の最新行（無ければ null） */
  settings: { id?: string | null; account_capital: number | null; risk_pct: number | null } | null
  slowdown?: boolean
  onSaved?: () => void
  /** 「新規トレードに入力」— 計画を新規トレードの入力画面に渡す */
  onUseForTrade?: (v: PlanHandoff) => void
  /** 変わったら候補リストを読み直す */
  plansReloadKey?: number
  /** 保有中の取得額の合計（買付余力の計算用） */
  holdingsCost?: number
}

function readLocal(): { cash?: string; risk?: string } {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') } catch { return {} }
}
function writeLocal(v: { cash: string; risk: string }) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(v)) } catch { /* private mode 等 */ }
}

const fieldBase =
  'border border-[var(--border-strong)] rounded-lg px-2.5 py-1.5 text-body num bg-[var(--bg-card)] text-[var(--text-primary)]'
const field = `${fieldBase} w-full`

export default function RiskBudget({ settings, slowdown = false, onSaved, onUseForTrade, plansReloadKey, holdingsCost = 0 }: Props) {
  const [cash, setCash] = useState('')
  const [risk, setRisk] = useState('0.5')
  const [msg, setMsg] = useState('')

  // 初期値: DB → 端末 → 既定
  useEffect(() => {
    const l = readLocal()
    setCash(settings?.account_capital != null ? String(settings.account_capital) : l.cash ?? '')
    setRisk(settings?.risk_pct != null ? String(settings.risk_pct) : l.risk ?? '0.5')
  }, [settings?.account_capital, settings?.risk_pct])

  async function persist() {
    const c = parseFloat(cash)
    const r = parseFloat(risk)
    writeLocal({ cash, risk })
    if (!(c > 0) || !(r > 0)) return
    if (c === settings?.account_capital && r === settings?.risk_pct) return
    const row = { account_capital: c, risk_pct: r, updated_at: new Date().toISOString() }
    const { error } = settings?.id
      ? await supabase.from('risk_settings').update(row).eq('id', settings.id)
      : await supabase.from('risk_settings').insert(row)
    setMsg(error ? 'この端末にだけ保存しました（ログインすると全端末に保存）' : '保存しました')
    if (!error) onSaved?.()
  }

  const c = parseFloat(cash)
  const baseRisk = parseFloat(risk)
  const effRisk = (baseRisk > 0 ? baseRisk : 0) * (slowdown ? 0.5 : 1)
  const budget = c > 0 && effRisk > 0 ? c * effRisk / 100 : null

  return (
    <div className="bg-[var(--bg-card)] rounded-xl border-[0.5px] border-[var(--border)] px-4 py-3">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)] items-start">
        {/* 入力 */}
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-small text-[var(--text-muted)] mb-1">現金（円）</span>
            <input type="number" inputMode="numeric" value={cash} onChange={e => setCash(e.target.value)} onBlur={persist}
                   placeholder="5000000" className={field} />
          </label>
          <label className="block">
            <span className="block text-small text-[var(--text-muted)] mb-1">リスク %（1 回）</span>
            <input type="number" inputMode="decimal" step="0.1" value={risk} onChange={e => setRisk(e.target.value)} onBlur={persist}
                   placeholder="0.5" className={field} />
          </label>
        </div>

        {/* 1 回の許容損失 */}
        <div>
          <div className="text-small text-[var(--text-muted)] mb-1">
            1 回の許容損失
            {slowdown && <span className="ml-1 text-[var(--sem-watch-fg)]">（減速中: 半分で計算）</span>}
          </div>
          <div className="text-title font-medium num text-[var(--text-primary)] leading-tight">
            {budget != null ? formatYen(budget) : '—'}
          </div>
          {msg && <div className="text-small text-[var(--text-muted)] mt-0.5">{msg}</div>}
        </div>

        {/* 損切り幅 → 建玉の上限 */}
        <div>
          <div className="text-small text-[var(--text-muted)] mb-1">損切り幅ごとの建玉の上限</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-body num">
            {STOP_STEPS.map(s => {
              // 許容損失 ÷ 損切り幅。1 円未満は切り捨て（÷ 0.0012 などで端数が出る）
              const cap = budget != null ? Math.floor(budget / (s / 100)) : null
              const overCash = cap != null && c > 0 && cap > c
              return (
                <span key={s} className="whitespace-nowrap" title={overCash ? '現金を超えるため、現物ではこの金額まで建てられません' : undefined}>
                  <span className="text-[var(--text-muted)]">{s}%</span>{' '}
                  <span className={overCash ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}>{cap != null ? formatYen(cap) : '—'}</span>
                  {overCash && <span className="text-caption text-[var(--text-muted)] ml-0.5">現金超</span>}
                </span>
              )
            })}
          </div>
        </div>
      </div>

      <TradePlans capital={c} holdingsCost={holdingsCost} riskPct={effRisk} onUseForTrade={onUseForTrade} reloadKey={plansReloadKey} />
    </div>
  )
}
