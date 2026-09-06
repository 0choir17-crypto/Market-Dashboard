'use client'

import { useState } from 'react'
import Modal from '@/components/shared/Modal'
import { useAuth } from '@/contexts/AuthContext'
import { btnGhost, btnPrimary, errorClass, fieldClass, labelClass } from '@/components/shared/form'

type Props = {
  open: boolean
  onClose: () => void
}

export default function LoginModal({ open, onClose }: Props) {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    const err = await signIn(email.trim(), password)
    setSubmitting(false)
    if (err) {
      setError(err)
    } else {
      setPassword('')
      onClose()
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="ログイン">
      <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          記録の追加・編集にはログインが必要です（閲覧はログイン不要）。
          セッションは端末に保存されるため、ログインは端末ごとに初回のみです。
        </p>
        <div>
          <label className={labelClass} htmlFor="login-email">
            メールアドレス
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            className={fieldClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="login-password">
            パスワード
          </label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
            className={fieldClass}
          />
        </div>
        {error && (
          <p className={errorClass}>
            ログインに失敗しました: {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className={btnGhost}
          >
            キャンセル
          </button>
          <button
            type="submit"
            disabled={submitting}
            className={btnPrimary}
          >
            {submitting ? 'ログイン中…' : 'ログイン'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
