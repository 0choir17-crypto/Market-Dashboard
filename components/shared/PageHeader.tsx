'use client'

// 全ページ共通のヘッダー。従来は各ページが「タイトル + 和文サブタイトル +
// 日付 + Refresh ボタン（同じSVG）」を手書きしており、余白・文言・挙動が
// 微妙にずれていた。ここに一本化する。
//
// 表記ルール: タイトルは英語（画面の固有名）、説明・操作は日本語。

import { ReactNode } from 'react'

type Props = {
  title: string
  /** 和文の説明（例: 日本株マーケットコンディション） */
  subtitle?: string
  /** データ基準日。isLatest=false のとき琥珀色のスナップショット表示になる */
  date?: string | null
  isLatest?: boolean
  onRefresh?: () => void
  refreshing?: boolean
  /** 右側の追加コントロール（日付ピッカー・検索など） */
  children?: ReactNode
}

export default function PageHeader({
  title,
  subtitle,
  date,
  isLatest = true,
  onRefresh,
  refreshing = false,
  children,
}: Props) {
  return (
    <header className="flex flex-wrap justify-between items-center gap-3 mb-6">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm mt-0.5 text-[var(--text-muted)]">{subtitle}</p>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        {children}

        {date && (
          <span
            className={`text-xs font-mono px-2.5 py-1 rounded-full border ${
              isLatest
                ? 'border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)]'
                : 'border-amber-400 bg-amber-50 text-amber-800 font-semibold'
            }`}
            title={isLatest ? 'データ基準日（最新）' : '過去スナップショットを表示中'}
          >
            {isLatest ? '' : '📌 '}{date}
          </span>
        )}

        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] transition-colors disabled:opacity-50 text-[var(--accent)] min-h-[36px]"
          >
            <svg
              className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            {refreshing ? '更新中…' : '更新'}
          </button>
        )}
      </div>
    </header>
  )
}
