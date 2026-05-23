'use client'

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { supabase } from '@/lib/supabase'

type DateContextValue = {
  selectedDate: string
  setSelectedDate: (date: string) => void
  isLatest: boolean
  availableDates: string[]
  resetToLatest: () => void
}

const DateContext = createContext<DateContextValue | null>(null)

export function DateProvider({ children }: { children: ReactNode }) {
  const [availableDates, setAvailableDates] = useState<string[]>([])
  const [selectedDate, setSelectedDate] = useState('')

  // 利用可能日付を取得（daily_signals の DISTINCT date）
  const fetchDates = useCallback(async () => {
    const { data } = await supabase
      .from('daily_signals')
      .select('date')
      .order('date', { ascending: false })
      .limit(500)

    if (!data || data.length === 0) return

    // ユニーク日付を降順で取得
    const unique = [...new Set(data.map((r: { date: string }) => r.date))].sort(
      (a, b) => (a > b ? -1 : 1),
    )
    setAvailableDates(unique)

    // 初回: 最新日をセット
    if (!selectedDate && unique.length > 0) {
      setSelectedDate(unique[0])
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchDates() }, [fetchDates])

  const latestDate = availableDates[0] ?? ''
  const isLatest = selectedDate === latestDate || selectedDate === ''
  const resetToLatest = useCallback(() => {
    if (latestDate) setSelectedDate(latestDate)
  }, [latestDate])

  return (
    <DateContext.Provider
      value={{ selectedDate, setSelectedDate, isLatest, availableDates, resetToLatest }}
    >
      {children}
    </DateContext.Provider>
  )
}

export function useDate() {
  const ctx = useContext(DateContext)
  if (!ctx) throw new Error('useDate must be used within DateProvider')
  return ctx
}
