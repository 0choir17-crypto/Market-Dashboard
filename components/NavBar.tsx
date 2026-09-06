'use client'

import Link from 'next/link'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { useDate } from '@/contexts/DateContext'
import { useAuth } from '@/contexts/AuthContext'
import LoginModal from '@/components/auth/LoginModal'

// ナビの並びは「読む → 選ぶ → 執行する → 振り返る」のワークフロー順。
const NAV_ITEMS: { href: string; label: string }[] = [
  // Sectors-33 は Market ダッシュボード (/) に統合したためタブから除外。
  // /sectors33 ルート自体は既存リンク用に残している。
  { href: '/', label: 'Market' },
  { href: '/leaders', label: 'Leaders' },
  { href: '/earnings', label: 'Earnings' },
  { href: '/today', label: 'Daily Watch' },
  { href: '/watchlist', label: 'Watchlist' },
  { href: '/journal', label: 'Trading' },
  { href: '/notes', label: 'Notes' },
  { href: '/guide', label: 'Guide' },
]

export default function NavBar() {
  const pathname = usePathname()
  const { selectedDate, setSelectedDate, isLatest, availableDates, resetToLatest } = useDate()
  const { session, loading: authLoading, signOut } = useAuth()
  const [loginOpen, setLoginOpen] = useState(false)

  // 日付ピッカー対象ページ
  const datePages = ['/', '/today']
  const showPicker = datePages.includes(pathname)

  const linkClass = (path: string) =>
    pathname === path
      ? 'text-small font-medium text-[var(--accent)] bg-[var(--accent-bg)] px-2.5 py-1 rounded-md'
      : 'text-small font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] px-2.5 py-1 rounded-md transition-colors'

  return (
    <nav
      aria-label="メインナビゲーション"
      className={`flex items-center gap-1.5 sm:gap-2 px-4 sm:px-6 py-2.5 bg-[var(--bg-card)] border-b sticky top-0 z-10 overflow-x-auto whitespace-nowrap ${
        !isLatest && showPicker ? 'border-[var(--sem-watch-bd)]' : 'border-[var(--border)]'
      }`}
    >
      {/* ブランド */}
      <Link
        href="/"
        className="flex items-center gap-1.5 mr-2 flex-shrink-0"
        aria-label="21 Cloud ホーム"
      >
        <span className="w-6 h-6 rounded-md bg-[var(--accent)] text-white text-caption font-medium flex items-center justify-center font-mono">
          21
        </span>
        <span className="text-small font-medium tracking-tight text-[var(--text-primary)] hidden md:inline">
          Cloud
        </span>
      </Link>

      {/* 日付ピッカー（対象ページのみ表示） */}
      {showPicker && availableDates.length > 0 && (
        <div className="flex items-center gap-1.5 flex-shrink-0 mr-1">
          <select
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            aria-label="表示する営業日"
            className={`text-caption font-mono px-2 py-1 rounded-md border cursor-pointer ${
              isLatest
                ? 'border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)]'
                : 'border-[var(--sem-watch-bd)] bg-[var(--sem-watch-bg)] text-[var(--sem-watch-fg)] font-medium'
            }`}
          >
            {availableDates.map(d => (
              <option key={d} value={d}>
                {d}{d === availableDates[0] ? '（最新）' : ''}
              </option>
            ))}
          </select>
          {!isLatest && (
            <button
              onClick={resetToLatest}
              className="text-caption px-2 py-1 rounded-md bg-[var(--sem-watch-fg)] text-white hover:brightness-110 transition-colors font-medium"
            >
              最新に戻る
            </button>
          )}
        </div>
      )}

      {NAV_ITEMS.map(item => (
        <Link
          key={item.href}
          href={item.href}
          className={linkClass(item.href)}
          aria-current={pathname === item.href ? 'page' : undefined}
        >
          {item.label}
        </Link>
      ))}

      {/* 認証状態（書き込みは authenticated 限定 — RLS 移行 20260704 参照） */}
      <div className="ml-auto flex items-center gap-2 flex-shrink-0 pl-2">
        {!authLoading && (session ? (
          <>
            <span className="text-caption text-[var(--text-muted)] hidden sm:inline" title={session.user.email ?? ''}>
              🔓 {session.user.email}
            </span>
            <button
              onClick={() => signOut()}
              className="text-caption px-2 py-1 rounded-md border border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-colors"
            >
              ログアウト
            </button>
          </>
        ) : (
          <button
            onClick={() => setLoginOpen(true)}
            className="text-caption px-2 py-1 rounded-md bg-[var(--accent)] text-white hover:opacity-90 transition-opacity font-medium"
            title="記録の追加・編集にはログインが必要です"
          >
            🔒 ログイン
          </button>
        ))}
      </div>
      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </nav>
  )
}
