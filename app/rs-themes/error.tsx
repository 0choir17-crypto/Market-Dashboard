'use client'

// RS Themes の表示中に例外が起きたとき、ページ全体を落とさずに中身を出す。
// (データの形が変わったときなどに、何が起きたかをその場で読めるようにする)

import { useEffect } from 'react'

export default function RsThemesError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[rs-themes]', error)
  }, [error])

  return (
    <main className="min-h-screen p-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div
        role="alert"
        className="px-4 py-3 rounded-lg bg-[var(--sem-weak-bg)] border-[0.5px] border-[var(--sem-weak-bd)] text-[var(--sem-weak-fg)] text-small"
      >
        <p className="font-medium">RS Themes の表示中にエラーが起きました</p>
        <p className="text-caption mt-1 break-all font-mono">{error.message}</p>
        <button
          onClick={reset}
          className="mt-2 px-2.5 py-1 rounded-md text-caption border-[0.5px] border-[var(--sem-weak-bd)] bg-[var(--bg-card)]"
        >
          Retry
        </button>
      </div>
    </main>
  )
}
