'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useDate } from '@/contexts/DateContext'

export default function NavBar() {
  const pathname = usePathname()
  const { selectedDate, setSelectedDate, isLatest, availableDates, resetToLatest } = useDate()

  // 日付ピッカー対象ページ
  const datePages = ['/', '/today']
  const showPicker = datePages.includes(pathname)

  const linkClass = (path: string) =>
    pathname === path
      ? 'text-sm font-semibold text-[var(--accent)] border-b-2 border-[var(--accent)] pb-0.5'
      : 'text-sm font-medium text-gray-500 hover:text-[var(--text-primary)] transition-colors'

  return (
    <nav
      className={`flex items-center gap-4 sm:gap-6 px-4 sm:px-6 py-3 bg-white border-b sticky top-0 z-10 overflow-x-auto whitespace-nowrap ${
        !isLatest && showPicker ? 'border-amber-400 bg-amber-50' : 'border-[var(--border)]'
      }`}
      style={{ fontFamily: 'var(--font-sans, sans-serif)' }}
    >
      <span className="text-sm font-bold tracking-widest text-[var(--text-primary)] mr-2 flex-shrink-0">
        21 CLOUD
      </span>

      {/* 日付ピッカー（対象ページのみ表示） */}
      {showPicker && availableDates.length > 0 && (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <select
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className={`text-xs font-mono px-2 py-1 rounded border cursor-pointer ${
              isLatest
                ? 'border-gray-200 bg-white text-gray-600'
                : 'border-amber-400 bg-amber-100 text-amber-800 font-semibold'
            }`}
          >
            {availableDates.map(d => (
              <option key={d} value={d}>
                {d}{d === availableDates[0] ? ' (Latest)' : ''}
              </option>
            ))}
          </select>
          {!isLatest && (
            <button
              onClick={resetToLatest}
              className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500 text-white hover:bg-amber-600 transition-colors font-medium"
            >
              Back to Latest
            </button>
          )}
        </div>
      )}

      <span className="text-gray-300 select-none flex-shrink-0">|</span>
      <Link href="/" className={linkClass('/')}>Market</Link>
      <Link href="/sectors33" className={linkClass('/sectors33')}>Sectors-33</Link>
      <Link href="/sectors" className={linkClass('/sectors')}>Sectors-17</Link>
      <Link href="/today" className={linkClass('/today')}>Today</Link>
      <Link href="/watchlist" className={linkClass('/watchlist')}>Watchlist</Link>
      <Link href="/journal" className={linkClass('/journal')}>Trading</Link>
      <Link href="/guide" className={linkClass('/guide')}>Guide</Link>
    </nav>
  )
}
