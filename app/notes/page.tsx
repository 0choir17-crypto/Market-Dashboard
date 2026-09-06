'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Note } from '@/types/notes'
import {
  listNotes,
  createNote,
  updateNote,
  deleteNote,
  migrateLocalNotes,
} from '@/lib/notesFetch'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import ErrorBanner from '@/components/shared/ErrorBanner'
import PageHeader from '@/components/shared/PageHeader'

// 自由メモ / 気を付けること（複数・タイトル付き）。
// 保存先は Supabase の notes テーブル。スマホ・PC など全端末で同期される。
// 旧 localStorage の単一メモは初回アクセス時に自動で 1 件ずつ吸い上げて統合する。
// 入力は自動保存（デバウンス）。

const PLACEHOLDER = `自由に入力できます。例:

# 気を付けること
- 決算またぎはサイズを落とす
- 寄り天井で飛びつかない / 押し目を待つ
- 連敗中は枚数を半分に

# 監視メモ
- 6479 … 4,400 割れたら撤退
- セクター: 半導体の出来高に注意`

function snippet(body: string): string {
  const line = body.split('\n').map(l => l.replace(/^#+/, '').trim()).find(l => l.length > 0)
  if (!line) return '（空のメモ）'
  return line.length > 48 ? `${line.slice(0, 48)}…` : line
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function fmtUpdated(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // 選択中メモの編集ドラフト
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [dirty, setDirty] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 未保存の最新ドラフト。メモ切替・アンマウント時にここから flush して入力消失を防ぐ。
  const pendingRef = useRef<{ id: string; title: string; body: string } | null>(null)

  // 初回: 旧ローカルメモを移行 → 一覧ロード → 先頭を選択
  useEffect(() => {
    let alive = true
    ;(async () => {
      await migrateLocalNotes()
      const { notes: list, error: listError } = await listNotes()
      if (!alive) return
      setNotes(list)
      if (listError) setError(`メモ一覧の取得に失敗しました: ${listError}`)
      if (list.length > 0) {
        const first = list[0]
        setSelectedId(first.id)
        setTitle(first.title ?? '')
        setBody(first.body)
      }
      setLoading(false)
    })()
    return () => { alive = false }
  }, [])

  // 未保存ドラフトを即時保存（デバウンス満了前のメモ切替・アンマウント時）
  const savePending = useCallback(async () => {
    const pending = pendingRef.current
    if (!pending) return
    pendingRef.current = null
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    const res = await updateNote(pending.id, { title: pending.title || null, body: pending.body })
    if (res.error) {
      setError(`メモの保存に失敗しました: ${res.error}`)
      return
    }
    setError(null)
    setSavedAt(new Date())
    setDirty(false)
    setNotes(prev =>
      prev.map(n =>
        n.id === pending.id
          ? { ...n, title: pending.title || null, body: pending.body, updated_at: new Date().toISOString() }
          : n,
      ),
    )
  }, [])

  // アンマウント時も未保存ドラフトを flush
  useEffect(() => () => { void savePending() }, [savePending])

  function selectNote(n: Note) {
    if (pendingRef.current) {
      if (pendingRef.current.id === n.id) return // 同じメモ: 入力中ドラフトを保持
      void savePending() // 切替前に未保存分を確定（600ms 以内の切替で入力が消えないように）
    }
    setSelectedId(n.id)
    setTitle(n.title ?? '')
    setBody(n.body)
    setDirty(false)
    setSavedAt(null)
  }

  async function handleNew() {
    const created = await createNote({ title: '', body: '' })
    if (!created) {
      setError('メモの作成に失敗しました。通信状態を確認してください。')
      return
    }
    setNotes(prev => [created, ...prev])
    selectNote(created)
  }

  async function handleDelete() {
    setConfirmDelete(false)
    if (!selectedId) return
    const id = selectedId
    // 削除対象の未保存ドラフトは破棄
    if (pendingRef.current?.id === id) {
      pendingRef.current = null
      if (timer.current) clearTimeout(timer.current)
    }
    const res = await deleteNote(id)
    if (res.error) {
      setError(`メモの削除に失敗しました: ${res.error}`)
      return
    }
    setError(null)
    const next = notes.filter(n => n.id !== id)
    setNotes(next)
    if (next.length > 0) {
      selectNote(next[0])
    } else {
      setSelectedId(null)
      setTitle('')
      setBody('')
      setDirty(false)
      setSavedAt(null)
    }
  }

  async function togglePin() {
    if (!selectedId) return
    const cur = notes.find(n => n.id === selectedId)
    if (!cur) return
    const pinned = !cur.pinned
    const res = await updateNote(selectedId, { pinned })
    if (res.error) {
      setError(`メモの更新に失敗しました: ${res.error}`)
      return
    }
    setNotes(prev => prev.map(n => (n.id === selectedId ? { ...n, pinned } : n)))
  }

  // 変更時にデバウンス自動保存（選択中メモの内容が stored と異なる時だけ）
  useEffect(() => {
    if (!selectedId) return
    const cur = notes.find(n => n.id === selectedId)
    if (!cur) return
    if ((cur.title ?? '') === title && cur.body === body) return // 選択直後など差分なし

    setDirty(true) // eslint-disable-line react-hooks/set-state-in-effect
    pendingRef.current = { id: selectedId, title, body }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { void savePending() }, 600)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [title, body, selectedId, notes, savePending])

  const selectedNote = selectedId ? notes.find(n => n.id === selectedId) ?? null : null

  return (
    <main className="min-h-screen p-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <PageHeader
        title="Notes"
        subtitle="メモ / 気を付けること。Supabase に自動保存され、スマホ・PC など全端末で同期します。"
      >
        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {dirty ? (
            <span className="text-[var(--sem-watch-fg)]">編集中…</span>
          ) : savedAt ? (
            <span className="text-[var(--positive)]">保存済み <span className="font-mono">{fmtTime(savedAt)}</span></span>
          ) : (
            <span>—</span>
          )}
        </div>
      </PageHeader>

      {error && <ErrorBanner detail={error} />}

      {loading ? (
        <div
          className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-8 text-center"
          style={{ color: 'var(--text-muted)' }}
        >
          <p className="text-lg font-medium">読み込み中…</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-[300px_1fr]">
          {/* 一覧 */}
          <aside className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-3 flex flex-col gap-2 md:max-h-[78vh]">
            <button
              onClick={handleNew}
              className="w-full px-3 py-2 rounded-lg text-sm font-medium border border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] transition-colors"
              style={{ color: 'var(--accent)' }}
            >
              ＋ 新規メモ
            </button>
            <div className="flex-1 overflow-y-auto -mx-1 px-1">
              {notes.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] text-center py-6">メモはありません。</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {notes.map(n => {
                    const active = n.id === selectedId
                    return (
                      <li key={n.id}>
                        <button
                          onClick={() => selectNote(n)}
                          className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                            active
                              ? 'border-[var(--accent)] bg-[var(--sem-focus-bg)]'
                              : 'border-[#eef0f2] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)]'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            {n.pinned && <span aria-hidden className="text-[11px]">📌</span>}
                            <span className="text-sm font-semibold text-[var(--text-primary)] truncate">
                              {n.title?.trim() || '無題'}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-[var(--text-muted)] truncate">{snippet(n.body)}</p>
                          <p className="mt-0.5 text-[10px] text-[var(--text-muted)] tabular-nums">{fmtUpdated(n.updated_at)}</p>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </aside>

          {/* エディタ */}
          <section className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-3">
            {selectedNote ? (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="タイトル（未入力なら本文先頭が一覧に表示）"
                    className="flex-1 min-w-0 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--sem-focus-fg)]"
                  />
                  <button
                    onClick={togglePin}
                    title={selectedNote.pinned ? 'ピンを外す' : 'ピン留め'}
                    className={`px-2.5 py-2 rounded-lg border text-sm transition-colors ${
                      selectedNote.pinned
                        ? 'border-[var(--sem-watch-bd)] bg-[var(--sem-watch-bg)] text-[var(--sem-watch-fg)]'
                        : 'border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)]'
                    }`}
                  >
                    📌
                  </button>
                  <button
                    onClick={() => setConfirmDelete(true)}
                    title="このメモを削除"
                    className="px-2.5 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--sem-weak-fg)] hover:bg-[var(--sem-weak-bg)] transition-colors text-sm"
                  >
                    🗑
                  </button>
                </div>
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  placeholder={PLACEHOLDER}
                  spellCheck={false}
                  className="w-full min-h-[64vh] resize-y rounded-lg border border-[var(--border)] bg-[#fcfcfd] px-4 py-3 text-sm leading-relaxed text-[var(--text-primary)] font-mono focus:outline-none focus:ring-2 focus:ring-[var(--sem-focus-fg)]"
                />
                <div className="flex items-center justify-between px-1 pt-2 text-[11px] text-[var(--text-muted)]">
                  <span>{body.length.toLocaleString()} 文字</span>
                  <span>自動保存（全端末で同期）</span>
                </div>
              </>
            ) : (
              <div className="py-16 text-center text-sm text-[var(--text-muted)]">
                <p className="mb-3">メモを選択するか、新規作成してください。</p>
                <button
                  onClick={handleNew}
                  className="px-3 py-2 rounded-lg text-sm font-medium border border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] transition-colors"
                  style={{ color: 'var(--accent)' }}
                >
                  ＋ 新規メモ
                </button>
              </div>
            )}
          </section>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        message={`「${selectedNote?.title?.trim() || '無題'}」を削除しますか？`}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </main>
  )
}
