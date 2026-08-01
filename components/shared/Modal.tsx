'use client'

import { useEffect } from 'react'

type Props = {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  title?: string
}

export default function Modal({ open, onClose, children, title }: Props) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    // 背面スクロールを止める（モーダル下で表が動くのを防ぐ）
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      {/* dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative bg-[var(--bg-card)] rounded-xl shadow-xl w-full max-w-lg mx-4 overflow-y-auto max-h-[90vh]"
      >
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors text-2xl leading-none font-light w-8 h-8 flex items-center justify-center rounded-md hover:bg-[var(--bg-card-hover)]"
              aria-label="閉じる"
            >
              ×
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
