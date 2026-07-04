'use client'

// Supabase Auth のセッション管理。
//
// RLS 移行 (20260704_secure_user_tables.sql) 以降、trades / notes /
// risk_settings / watchlist への書き込みは authenticated ロール限定。
// ログインは端末ごとに初回のみ — セッションは supabase-js が localStorage に
// 保存し自動リフレッシュするので、スマホ/PC どちらも使い勝手は従来どおり。

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type AuthContextType = {
  session: Session | null
  /** 初期セッション復元が終わるまで true */
  loading: boolean
  /** 成功時 null、失敗時はエラーメッセージを返す */
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  async function signIn(email: string, password: string): Promise<string | null> {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error ? error.message : null
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
