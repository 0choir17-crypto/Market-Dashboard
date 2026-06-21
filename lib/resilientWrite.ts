import { supabase } from '@/lib/supabase'

// スキーマのドリフト（本番テーブルに任意列がまだ無い）に強い insert/update。
//
// PostgREST は未知の列を含む書き込みに対し
//   code 'PGRST204' / message "Could not find the 'COL' column of 'TABLE' in the schema cache"
// を返す。その列を payload から除外して再試行することで、必須列さえ揃っていれば
// 記録自体は必ず通るようにする（MC スナップショット等の付加列が欠けても致命傷にしない）。
//
// 列を追加して本来の状態に戻したい場合は supabase/trades_columns.sql を参照。

const MISSING_COL_RE = /Could not find the '([^']+)' column/

type WriteError = { code?: string; message: string } | null

export type ResilientResult = { error: WriteError; stripped: string[] }

async function attempt(
  record: Record<string, unknown>,
  exec: (rec: Record<string, unknown>) => PromiseLike<{ error: WriteError }>,
): Promise<ResilientResult> {
  const rec: Record<string, unknown> = { ...record }
  const stripped: string[] = []
  // 列数+1 を上限に再試行（無限ループ防止）
  const maxTries = Object.keys(rec).length + 1

  for (let i = 0; i < maxTries; i++) {
    const { error } = await exec(rec)
    if (!error) {
      if (stripped.length) {
        console.warn(
          `[resilientWrite] schema に存在しない列を除外して保存しました: ${stripped.join(', ')}`,
        )
      }
      return { error: null, stripped }
    }

    const col = error.code === 'PGRST204' ? MISSING_COL_RE.exec(error.message)?.[1] : undefined
    // 除外できる未知列が無ければ（= 別種のエラー）そのまま返す
    if (!col || !(col in rec)) return { error, stripped }

    delete rec[col]
    stripped.push(col)
  }

  return { error: { message: 'resilientWrite: too many missing columns' }, stripped }
}

export function insertResilient(table: string, record: Record<string, unknown>) {
  return attempt(record, rec => supabase.from(table).insert(rec))
}

export function updateResilient(
  table: string,
  record: Record<string, unknown>,
  match: Record<string, unknown>,
) {
  return attempt(record, rec => supabase.from(table).update(rec).match(match))
}
