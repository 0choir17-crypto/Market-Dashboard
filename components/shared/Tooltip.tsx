'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  content: string
  children: React.ReactNode
}

const TOOLTIP_W = 224 // w-56
const TOOLTIP_H_APPROX = 80
const GAP = 8

export default function Tooltip({ content, children }: Props) {
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState<{
    top: number
    left: number
    isBelow: boolean
    isRight: boolean
  } | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  function handleMouseEnter() {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const isRight = rect.right > window.innerWidth - (TOOLTIP_W - 4)
    const isBelow = rect.top < TOOLTIP_H_APPROX + GAP + 8

    const top = isBelow
      ? rect.bottom + GAP
      : rect.top - GAP - TOOLTIP_H_APPROX
    const left = isRight
      ? Math.max(8, rect.right - TOOLTIP_W)
      : Math.max(
          8,
          Math.min(
            window.innerWidth - TOOLTIP_W - 8,
            rect.left + rect.width / 2 - TOOLTIP_W / 2,
          ),
        )

    setPos({ top, left, isBelow, isRight })
    setVisible(true)
  }

  return (
    <div
      ref={ref}
      className="relative inline-flex items-center gap-1"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      <span className="w-3.5 h-3.5 rounded-full bg-gray-200 text-gray-500 text-[10px] flex items-center justify-center cursor-help select-none flex-shrink-0">
        ?
      </span>
      {mounted && visible && pos &&
        createPortal(
          <div
            className="fixed z-[100] bg-gray-900 text-white text-xs rounded-lg py-2 px-3 w-56 shadow-lg pointer-events-none normal-case font-normal tracking-normal leading-snug"
            style={{ top: pos.top, left: pos.left }}
          >
            {content}
            {pos.isBelow ? (
              <div
                className={`absolute bottom-full border-4 border-transparent border-b-gray-900 ${
                  pos.isRight ? 'right-3' : 'left-1/2 -translate-x-1/2'
                }`}
              />
            ) : (
              <div
                className={`absolute top-full border-4 border-transparent border-t-gray-900 ${
                  pos.isRight ? 'right-3' : 'left-1/2 -translate-x-1/2'
                }`}
              />
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}
