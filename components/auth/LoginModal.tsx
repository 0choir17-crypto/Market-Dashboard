'use client'

import { useState } from 'react'
import Modal from '@/components/shared/Modal'
import { useAuth } from '@/contexts/AuthContext'

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
        <p className="text-xs text-gray-500 leading-relaxed">
          記録の追加・編集にはログインが必要です（閲覧はログイン不要）。
          セッションは端末に保存されるため、ログインは端末ごとに初回のみです。
        </p>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="login-email">
            メールアドレス
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="login-password">
            パスワード
          </label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            ログインに失敗しました: {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
          >
            キャンセル
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? 'ログイン中…' : 'ログイン'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
