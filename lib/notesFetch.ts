import { supabase } from '@/lib/supabase'
import type { Note } from '@/types/notes'

// Notes の読み書き。個人専用のため user 絞り込みなし。
// 既定の並び: ピン留め → 直近更新順。

const TABLE = 'notes'

// 旧 localStorage（単一テキスト）からの移行用キー
const LEGACY_KEY = 'market-dashboard:notes'
const MIGRATED_FLAG = 'market-dashboard:notes:migrated-v1'

// error を返して呼び出し側で表示する（黙って [] を返すと「全メモ消失」に見えてしまう）。
export async function listNotes(): Promise<{ notes: Note[]; error: string | null }> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('pinned', { ascending: false })
    .order('updated_at', { ascending: false })
  if (error) {
    console.error('[notes] list error', error)
    return { notes: [], error: error.message }
  }
  return { notes: (data ?? []) as Note[], error: null }
}

export async function createNote(fields: Partial<Note> = {}): Promise<Note | null> {
  const now = new Date().toISOString()
  const record = {
    title: fields.title ?? null,
    body: fields.body ?? '',
    pinned: fields.pinned ?? false,
    updated_at: now,
  }
  const { data, error } = await supabase.from(TABLE).insert(record).select().single()
  if (error) {
    console.error('[notes] create error', error)
    return null
  }
  return data as Note
}

export async function updateNote(
  id: string,
  fields: Partial<Pick<Note, 'title' | 'body' | 'pinned'>>,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from(TABLE)
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) console.error('[notes] update error', error)
  return { error: error?.message ?? null }
}

export async function deleteNote(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) console.error('[notes] delete error', error)
  return { error: error?.message ?? null }
}

// 先頭の非空行からタイトルを導出（'#' と空白を除去、長すぎる場合は丸める）
function deriveTitle(body: string): string {
  const firstLine = body
    .split('\n')
    .map(l => l.replace(/^#+/, '').trim())
    .find(l => l.length > 0)
  const base = firstLine && firstLine.length > 0 ? firstLine : '移行したメモ'
  return (base.length > 40 ? `${base.slice(0, 40)}…` : base) + '（移行）'
}

// この端末の旧 localStorage メモを一度だけ Supabase に吸い上げる。
// 端末ごとに 1 回ずつ実行され、両端末ぶんが notes テーブルに統合される。
// 成功時のみフラグを立て、失敗時は次回再試行する。
export async function migrateLocalNotes(): Promise<Note | null> {
  let blob: string | null = null
  try {
    if (localStorage.getItem(MIGRATED_FLAG)) return null
    blob = localStorage.getItem(LEGACY_KEY)
  } catch {
    return null // localStorage 不可（プライベートモード等）
  }

  // 取り込む中身が無ければフラグだけ立てて終了
  if (!blob || !blob.trim()) {
    try { localStorage.setItem(MIGRATED_FLAG, '1') } catch { /* noop */ }
    return null
  }

  const created = await createNote({ title: deriveTitle(blob), body: blob })
  if (!created) return null // 書き込み失敗 → フラグを立てず次回再試行

  try { localStorage.setItem(MIGRATED_FLAG, '1') } catch { /* noop */ }
  return created
}
