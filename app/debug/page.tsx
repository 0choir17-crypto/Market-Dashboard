'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Probe = {
  label: string
  status: 'pending' | 'ok' | 'empty' | 'error'
  detail: string
}

const TABLES = [
  'market_conditions',
  'coil_pullback_setups',
  'ma_pullback_setups',
  'mc_v4_raw_history',
  'sector_selection_s33',
  'sector_index_prices',
  'chart_ohlcv_cache',
  'trades',
  'watchlist',
  'risk_settings',
] as const

// 本番ビルドでは無効化する。このページはテーブル一覧・RLS 探査結果・
// サンプル行まで表示する内部診断ツールで、公開サイトに載せると
// 攻撃者への偵察情報になる。NODE_ENV はビルド時に静的展開されるため、
// production ビルドでは実装コードごとスタブに置き換わる。
export default function DebugPage() {
  if (process.env.NODE_ENV === 'production') {
    return (
      <main className="p-8 text-sm text-gray-500">
        Debug ページは開発ビルドでのみ利用できます。
      </main>
    )
  }
  return <DebugPageInner />
}

function DebugPageInner() {
  const [envUrl, setEnvUrl] = useState('')
  const [envKeyTail, setEnvKeyTail] = useState('')
  const [probes, setProbes] = useState<Probe[]>([])
  const [latest, setLatest] = useState<string>('')

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
    setEnvUrl(url)
    setEnvKeyTail(key ? `${key.slice(0, 6)}…${key.slice(-6)} (len=${key.length})` : '(unset)')

    ;(async () => {
      const init: Probe[] = TABLES.map(t => ({
        label: t,
        status: 'pending',
        detail: '...',
      }))
      setProbes(init)

      const results: Probe[] = []
      for (const t of TABLES) {
        const { data, error, count } = await supabase
          .from(t)
          .select('*', { count: 'exact', head: true })
        if (error) {
          results.push({
            label: t,
            status: 'error',
            detail: `${error.code ?? ''} ${error.message}`,
          })
        } else if ((count ?? 0) === 0) {
          results.push({ label: t, status: 'empty', detail: 'count=0' })
        } else {
          results.push({
            label: t,
            status: 'ok',
            detail: `count=${count} (data sample: ${JSON.stringify(data)})`,
          })
        }
      }
      setProbes(results)

      // market_conditions の最新行を mc_v4 フィルタなしで確認
      const { data: mcRow, error: mcErr } = await supabase
        .from('market_conditions')
        .select('date, mc_v4')
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (mcErr) setLatest(`ERROR: ${mcErr.code} ${mcErr.message}`)
      else if (!mcRow) setLatest('no row at all')
      else setLatest(`latest row: date=${mcRow.date}, mc_v4=${String(mcRow.mc_v4)}`)
    })()
  }, [])

  return (
    <main className="min-h-screen p-6 font-mono text-sm" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <h1 className="text-2xl font-bold mb-4">Supabase Debug</h1>

      <section className="mb-6 p-4 bg-[var(--bg-card)] rounded border">
        <h2 className="font-semibold mb-2">Env</h2>
        <div>NEXT_PUBLIC_SUPABASE_URL: <span className="text-blue-700 break-all">{envUrl || '(unset)'}</span></div>
        <div>NEXT_PUBLIC_SUPABASE_ANON_KEY: <span className="text-blue-700">{envKeyTail}</span></div>
        <ul className="mt-2 text-xs text-gray-600 list-disc pl-5">
          <li>URL の末尾に <code>/rest/v1/</code> や <code>/</code> が付いていないか確認</li>
          <li>URL は <code>https://xxxxxxxx.supabase.co</code> の形が正しい</li>
          <li>key は通常 200 文字超。短い場合は anon ではなく別物</li>
        </ul>
      </section>

      <section className="mb-6 p-4 bg-[var(--bg-card)] rounded border">
        <h2 className="font-semibold mb-2">market_conditions latest probe</h2>
        <div className="break-all">{latest || 'querying...'}</div>
      </section>

      <section className="p-4 bg-[var(--bg-card)] rounded border">
        <h2 className="font-semibold mb-2">Per-table HEAD count (anon role)</h2>
        <table className="w-full text-left">
          <thead>
            <tr className="border-b">
              <th className="py-1 pr-4">table</th>
              <th className="py-1 pr-4">status</th>
              <th className="py-1">detail</th>
            </tr>
          </thead>
          <tbody>
            {probes.map(p => (
              <tr key={p.label} className="border-b">
                <td className="py-1 pr-4">{p.label}</td>
                <td className={
                  'py-1 pr-4 font-semibold ' +
                  (p.status === 'ok' ? 'text-green-700'
                    : p.status === 'empty' ? 'text-amber-700'
                    : p.status === 'error' ? 'text-red-700'
                    : 'text-gray-500')
                }>{p.status}</td>
                <td className="py-1 break-all">{p.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="mt-3 text-xs text-gray-600 list-disc pl-5">
          <li><b>error 401 / 42501</b> → そのテーブルの RLS が anon を拒否</li>
          <li><b>empty (count=0)</b> → RLS は通っているが行が0 (= 書き込みが service_role で行われ RLS によって SELECT のみ拒否されているケースもここに含まれる)</li>
          <li><b>ok</b> → 正常に読める</li>
          <li><b>error 404 / PGRST20x</b> → URL or テーブル名が誤り</li>
        </ul>
      </section>
    </main>
  )
}
