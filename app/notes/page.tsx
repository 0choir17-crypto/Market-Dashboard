'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// 自由メモ / 気を付けること。
// 保存先はこのブラウザの localStorage（サーバ同期なし）。端末横断で同期したい場合は
// Supabase テーブルに切り替え可能（要相談）。入力は自動保存（デバウンス）。

const STORAGE_KEY = 'market-dashboard:notes'

const PLACEHOLDER = `自由に入力できます。例:

# 気を付けること
- 決算またぎはサイズを落とす
- 寄り天井で飛びつかない / 押し目を待つ
- 連敗中は枚数を半分に

# 監視メモ
- 6479 … 4,400 割れたら撤退
- セクター: 半導体の出来高に注意

# 今週のテーマ
- …`

export default function NotesPage() {
  const [text, setText] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [dirty, setDirty] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 初回ロード
  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY)
      if (v != null) setText(v) // eslint-disable-line react-hooks/set-state-in-effect
    } catch {
      /* localStorage 不可（プライベートモード等）でも編集自体は可能 */
    }
    setLoaded(true)
  }, [])

  const save = useCallback((value: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, value)
      setSavedAt(new Date())
      setDirty(false)
    } catch {
      /* 保存不可時は dirty のまま */
    }
  }, [])

  // 変更時にデバウンス自動保存
  useEffect(() => {
    if (!loaded) return
    setDirty(true) // eslint-disable-line react-hooks/set-state-in-effect
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => save(text), 600)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [text, loaded, save])

  const fmtTime = (d: Date) =>
    d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  return (
    <main className="min-h-screen p-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <header className="flex justify-between items-center mb-4 flex-wrap gap-3">
        <div>
          <h1
            className="text-2xl font-bold"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-sans, sans-serif)' }}
          >
            <span aria-hidden className="mr-2">📝</span>Notes — メモ / 気を付けること
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            自由入力の個人メモ。このブラウザに自動保存されます（サーバ同期なし）。
          </p>
        </div>
        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {dirty ? (
            <span className="text-amber-600">編集中…</span>
          ) : savedAt ? (
            <span className="text-emerald-600">保存済み {fmtTime(savedAt)}</span>
          ) : (
            <span>—</span>
          )}
        </div>
      </header>

      <div className="bg-white rounded-xl border border-[#e8eaed] shadow-sm p-3">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={PLACEHOLDER}
          spellCheck={false}
          className="w-full min-h-[70vh] resize-y rounded-lg border border-gray-200 bg-[#fcfcfd] px-4 py-3 text-sm leading-relaxed text-gray-800 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex items-center justify-between px-1 pt-2 text-[11px] text-gray-400">
          <span>{text.length.toLocaleString()} 文字</span>
          <span>自動保存（このブラウザのみ）。端末横断で同期したい場合はお知らせください。</span>
        </div>
      </div>
    </main>
  )
}
