// 端末横断で共有する自由メモ（複数・タイトル付き）
// Source table: public.notes  (PK: id uuid)
// 従来は localStorage 保存だったため端末間で共有されなかった。Supabase に移行し全端末で同期。
// 個人専用ダッシュボードのため user_id は持たない（"Allow all for anon" RLS）。

export type Note = {
  id: string
  title: string | null
  body: string
  pinned: boolean
  created_at: string
  updated_at: string
}
