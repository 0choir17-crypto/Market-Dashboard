'use client'

import { ReactNode } from 'react'
import { DateProvider } from '@/contexts/DateContext'
import { AuthProvider } from '@/contexts/AuthContext'

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <DateProvider>{children}</DateProvider>
    </AuthProvider>
  )
}
