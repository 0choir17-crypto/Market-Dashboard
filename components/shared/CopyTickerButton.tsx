'use client'

// TradingView 形式のティッカー（TSE:6862）をクリップボードにコピーするボタン。
//
// ウォッチリストの管理は TradingView 側で行うので、ダッシュボードからできる
// 一番実運用に近い操作は「銘柄コードを TradingView に貼れる形で渡す」こと。
// 旧「＋ Watch」（Supabase の watchlist テーブルへの手入力）の置き換え。

import { useEffect, useRef, useState } from 'react'

/** navigator.clipboard が使えない環境（非セキュアコンテキスト等）向けのフォールバック。 */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // execCommand にフォールバックする
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

type Props = {
  /** 銘柄コード。278A のように英字を含むことがあるので文字列のまま扱う。 */
  code: string
  className?: string
}

export default function CopyTickerButton({ code, className }: Props) {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const ticker = `TSE:${code}`

  async function handleClick() {
    const ok = await copyText(ticker)
    setState(ok ? 'done' : 'failed')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setState('idle'), 1500)
  }

  return (
    <button
      onClick={handleClick}
      title={`${ticker} をコピー（TradingView に貼り付け）`}
      className={
        className ??
        `px-2 py-1 text-caption rounded border-[0.5px] transition-colors ${
          state === 'done'
            ? 'text-[var(--sem-strong-fg)] bg-[var(--sem-strong-bg)] border-[var(--sem-strong-bd)]'
            : state === 'failed'
              ? 'text-[var(--sem-weak-fg)] bg-[var(--sem-weak-bg)] border-[var(--sem-weak-bd)]'
              : 'text-[var(--sem-focus-fg)] bg-[var(--sem-focus-bg)] border-[var(--sem-focus-bd)]'
        }`
      }
    >
      {state === 'done' ? '✓ コピー済' : state === 'failed' ? 'コピー失敗' : `⧉ ${ticker}`}
    </button>
  )
}
