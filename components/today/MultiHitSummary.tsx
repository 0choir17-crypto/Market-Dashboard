'use client'

import { useMemo } from 'react'
import { tradingViewUrl, shikihoUrl } from '@/lib/tickerLinks'

// 複数スキャナー重複サマリー — 同一 code が当日 2 つ以上のスキャナーに出た銘柄を集約。
// 連続日除外済みのため「今日の重複」。件数(重複スキャナー数)降順で並べ、収束銘柄を一目で。
// スキャナーは別テーブルなので、ページから 4 リストの (code, co_name) を受けて突き合わせる。

type MinRow = { code: string; co_name: string | null }

type ScannerKey = 'coil' | 'ma' | 'volume' | 'spring'

const SCANNER_META: Record<ScannerKey, { label: string; bg: string; fg: string; border: string }> = {
  coil: { label: 'Coil', bg: '#eef2ff', fg: '#3730a3', border: '#c7d2fe' },
  ma: { label: 'MA', bg: '#dbeafe', fg: '#1e40af', border: '#93c5fd' },
  volume: { label: 'Volume', bg: '#ffe4e6', fg: '#9f1239', border: '#fda4af' },
  spring: { label: 'Spring', bg: '#dcfce7', fg: '#166534', border: '#86efac' },
}

// 表示順（チップの並びを固定）
const SCANNER_ORDER: ScannerKey[] = ['coil', 'ma', 'volume', 'spring']

type Props = {
  coil: MinRow[]
  ma: MinRow[]
  volume: MinRow[]
  spring: MinRow[]
}

type HitEntry = { code: string; coName: string | null; scanners: ScannerKey[] }

export default function MultiHitSummary({ coil, ma, volume, spring }: Props) {
  const entries = useMemo<HitEntry[]>(() => {
    const map = new Map<string, { coName: string | null; set: Set<ScannerKey> }>()
    const add = (rows: MinRow[], key: ScannerKey) => {
      for (const r of rows) {
        if (!r.code) continue
        let e = map.get(r.code)
        if (!e) {
          e = { coName: r.co_name ?? null, set: new Set() }
          map.set(r.code, e)
        }
        if (!e.coName && r.co_name) e.coName = r.co_name
        e.set.add(key)
      }
    }
    add(coil, 'coil')
    add(ma, 'ma')
    add(volume, 'volume')
    add(spring, 'spring')

    return [...map.entries()]
      .filter(([, e]) => e.set.size >= 2)
      .map(([code, e]) => ({
        code,
        coName: e.coName,
        scanners: SCANNER_ORDER.filter(k => e.set.has(k)),
      }))
      .sort((a, b) => {
        if (b.scanners.length !== a.scanners.length) return b.scanners.length - a.scanners.length
        return a.code.localeCompare(b.code)
      })
  }, [coil, ma, volume, spring])

  // 重複が無い日はパネル自体を出さない（混雑を増やさない）。
  if (entries.length === 0) return null

  return (
    <section className="bg-white rounded-xl border-2 border-amber-300 shadow-sm p-4">
      <div className="flex items-baseline gap-2 flex-wrap mb-3">
        <h2 className="text-lg font-bold text-[var(--text-primary)]">★ 複数シグナル重複（今日）</h2>
        <span className="text-xs text-[var(--text-muted)]">
          <span className="font-mono">{entries.length}</span> 銘柄 — 2つ以上のスキャナーに同時ヒット（収束＝高確度候補）
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1.5">
        {entries.map(e => (
          <div
            key={e.code}
            className="flex items-center gap-2 py-1 border-b border-[#f3f4f6] last:border-b-0"
          >
            <a
              href={tradingViewUrl(e.code)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs font-bold text-[var(--accent)] hover:underline flex-shrink-0 w-12"
              title={`${e.code}（TradingView を開く）`}
            >
              {e.code}
            </a>
            <a
              href={shikihoUrl(e.code)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-[var(--text-primary)] hover:underline truncate flex-1 min-w-0"
              title={`${e.coName ?? '—'}（四季報を開く）`}
            >
              {e.coName ?? '—'}
            </a>
            <span className="flex items-center gap-1 flex-shrink-0">
              {e.scanners.map(k => {
                const m = SCANNER_META[k]
                return (
                  <span
                    key={k}
                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold"
                    style={{ backgroundColor: m.bg, color: m.fg, border: `1px solid ${m.border}` }}
                  >
                    {m.label}
                  </span>
                )
              })}
            </span>
            <span className="font-mono text-xs font-bold text-amber-600 tabular-nums flex-shrink-0 w-7 text-right">
              ×{e.scanners.length}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
