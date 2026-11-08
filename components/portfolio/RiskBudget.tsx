'use client'

// 1 回あたりに取れるリスクの計算（Trading ページ最上段）。
//   許容損失 = 現金 × リスク %
//   建玉の上限 = 許容損失 ÷ 損切り幅 %   （損切り幅が狭いほど大きく建てられる）
// 減速ルール中はリスク % を半分で計算。
// 下段「次に買う銘柄」: 寄りで買う前提で、前日終値と損切り価格から損切り幅と株数（100 株単位）を
// 仮計算し、寄り値を入れたら計算し直す。結果は「新規トレード」の入力画面に引き継げる。
// 現金・リスク % は入力欄を離れた時に risk_settings（account_capital / risk_pct）へ保存する。
// 未ログイン等で保存できない時もこの端末には残す（localStorage）。

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatYen, formatPct } from '@/lib/format'
import { suggestShares } from '@/lib/rStats'

const LS_KEY = 'trading.riskBudget'
const LS_NEXT_KEY = 'trading.nextBuy'
const STOP_STEPS = [2, 3, 5, 8, 10]

type Props = {
  /** risk_settings の最新行（無ければ null） */
  settings: { id?: string | null; account_capital: number | null; risk_pct: number | null } | null
  slowdown?: boolean
  onSaved?: () => void
  /** 「新規トレードに入力」— 計算結果を新規トレードの入力画面に渡す */
  onUseForTrade?: (v: { ticker: string; entry_price: number; shares: number; stop_price: number; signal_price: number | null }) => void
}

type NextBuy = { code: string; prevClose: string; open: string; stop: string }
const EMPTY_NEXT: NextBuy = { code: '', prevClose: '', open: '', stop: '' }

function readNext(): NextBuy {
  try { return { ...EMPTY_NEXT, ...JSON.parse(localStorage.getItem(LS_NEXT_KEY) ?? '{}') } } catch { return EMPTY_NEXT }
}
function writeNext(v: NextBuy) {
  try { localStorage.setItem(LS_NEXT_KEY, JSON.stringify(v)) } catch { /* private mode 等 */ }
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

export default function RiskBudget({ settings, slowdown = false, onSaved, onUseForTrade }: Props) {
  const [cash, setCash] = useState('')
  const [risk, setRisk] = useState('0.5')
  const [next, setNext] = useState<NextBuy>(EMPTY_NEXT)
  const [msg, setMsg] = useState('')

  // 次に買う銘柄の入力はこの端末に残す（翌朝の寄り前に開き直しても消えない）
  useEffect(() => { setNext(readNext()) }, [])
  function updateNext(patch: Partial<NextBuy>) {
    setNext(prev => { const v = { ...prev, ...patch }; writeNext(v); return v })
  }

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

  // 次に買う銘柄: 前日終値で仮計算、寄り値があれば寄り値で再計算
  const stop = parseFloat(next.stop)
  const prevClose = parseFloat(next.prevClose)
  const openPx = parseFloat(next.open)
  const plan = (entry: number) => {
    if (!(entry > 0) || !(stop > 0)) return null
    if (stop >= entry) return { invalid: true as const }
    const sz = suggestShares({ capital: c, riskPct: effRisk, entry, stop })
    return { invalid: false as const, entry, stopPct: (entry - stop) / entry * 100, perShare: entry - stop, sz }
  }
  const provisional = plan(prevClose)
  const atOpen = plan(openPx)
  const final = atOpen ?? provisional
  const canUse = !!onUseForTrade && next.code.trim() !== '' && final != null && !final.invalid && final.sz != null && final.sz.shares > 0

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
            {STOP_STEPS.map(s => (
              <span key={s} className="whitespace-nowrap">
                <span className="text-[var(--text-muted)]">{s}%</span>{' '}
                <span className="text-[var(--text-primary)]">{budget != null ? formatYen(budget / (s / 100)) : '—'}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* 次に買う銘柄（寄りで買う） */}
      <div className="mt-3 pt-3 border-t-[0.5px] border-[var(--border)]">
        <div className="text-small text-[var(--text-muted)] mb-2">次に買う銘柄（寄りで買う前提）</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <label className="block">
            <span className="block text-small text-[var(--text-muted)] mb-1">コード</span>
            <input type="text" value={next.code} onChange={e => updateNext({ code: e.target.value })}
                   placeholder="7203" className={field} />
          </label>
          <label className="block">
            <span className="block text-small text-[var(--text-muted)] mb-1">前日終値</span>
            <input type="number" inputMode="decimal" value={next.prevClose} onChange={e => updateNext({ prevClose: e.target.value })}
                   placeholder="仮計算に使う" className={field} />
          </label>
          <label className="block">
            <span className="block text-small text-[var(--text-muted)] mb-1">寄り値（寄った後）</span>
            <input type="number" inputMode="decimal" value={next.open} onChange={e => updateNext({ open: e.target.value })}
                   placeholder="入れると再計算" className={field} />
          </label>
          <label className="block">
            <span className="block text-small text-[var(--text-muted)] mb-1">損切り価格</span>
            <input type="number" inputMode="decimal" value={next.stop} onChange={e => updateNext({ stop: e.target.value })}
                   placeholder="例: 安値割れ" className={field} />
          </label>
        </div>

        <div className="mt-3 space-y-1.5 text-body num">
          <PlanRow label="仮計算（前日終値）" p={provisional} budget={budget} cash={c} dim={atOpen != null} />
          {atOpen != null && <PlanRow label="寄り値で再計算" p={atOpen} budget={budget} cash={c} />}
          {provisional == null && atOpen == null && (
            <div className="text-small text-[var(--text-muted)]">前日終値（または寄り値）と損切り価格を入れると株数が出ます</div>
          )}
        </div>

        {onUseForTrade && (
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              disabled={!canUse}
              onClick={() => {
                if (!canUse || final == null || final.invalid || final.sz == null) return
                onUseForTrade({
                  ticker: next.code.trim().toUpperCase(),
                  entry_price: final.entry,
                  shares: final.sz.shares,
                  stop_price: stop,
                  signal_price: prevClose > 0 ? prevClose : null,
                })
              }}
              className="px-3 py-1.5 rounded-lg text-small font-medium text-white bg-[var(--sem-focus-fg)] hover:brightness-110 transition-colors min-h-[36px] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              新規トレードに入力 →
            </button>
            <span className="text-small text-[var(--text-muted)]">
              {atOpen != null ? '寄り値の計算で入力します' : '寄り値が未入力のため前日終値で入力します'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

type Plan = ReturnType<typeof suggestShares>
function PlanRow({ label, p, budget, cash, dim = false }: {
  label: string
  p: { invalid: true } | { invalid: false; entry: number; stopPct: number; perShare: number; sz: Plan } | null
  budget: number | null
  cash: number
  dim?: boolean
}) {
  if (p == null) return null
  const tone = dim ? 'text-[var(--text-muted)]' : 'text-[var(--text-secondary)]'
  if (p.invalid) {
    return <div className={`text-small ${tone}`}>{label}: <span className="text-[var(--sem-watch-fg)]">損切り価格がエントリー価格以上です</span></div>
  }
  return (
    <div className={`flex flex-wrap items-baseline gap-x-4 gap-y-0.5 ${tone}`}>
      <span className="text-small w-full sm:w-auto sm:min-w-[9rem]">{label}</span>
      <span>エントリー {p.entry.toLocaleString('ja-JP')}</span>
      <span>損切り幅 −{formatPct(p.stopPct)}（{p.perShare.toLocaleString('ja-JP', { maximumFractionDigits: 1 })} 円/株）</span>
      {budget == null || p.sz == null ? (
        <span className="text-small text-[var(--text-muted)]">現金とリスク % を入れると株数が出ます</span>
      ) : p.sz.shares === 0 ? (
        <span className="text-small text-[var(--sem-watch-fg)]">許容損失に対し損切り幅が広く 100 株に届きません</span>
      ) : (
        <>
          <strong className={dim ? '' : 'text-[var(--text-primary)]'}>{p.sz.shares.toLocaleString('ja-JP')} 株</strong>
          <span>建玉 {formatYen(p.sz.positionYen)}（{p.sz.positionPct.toFixed(1)}%）</span>
          <span>損失 {formatYen(p.sz.riskYen)}{cash > 0 ? `（${(p.sz.riskYen / cash * 100).toFixed(2)}%）` : ''}</span>
        </>
      )}
    </div>
  )
}
