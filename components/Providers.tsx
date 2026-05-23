'use client'

import { ReactNode } from 'react'
import { DateProvider } from '@/contexts/DateContext'

export default function Providers({ children }: { children: ReactNode }) {
  return <DateProvider>{children}</DateProvider>
}
