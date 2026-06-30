-- notes テーブル作成 — 端末横断で共有する自由メモ（複数・タイトル付き）
-- Supabase SQL Editor で実行すること。
--
-- 背景: Notes タブは従来このブラウザの localStorage にしか保存しておらず、
--   スマホと PC でメモが共有されなかった。Supabase に移すことで個人の全端末で同期する。
-- 方針: 個人専用ダッシュボード（実質 1 ユーザー）のため user_id は持たず、
--   他テーブルと同じ "Allow all for anon" RLS で運用する。

CREATE TABLE IF NOT EXISTS notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text,
  body        text NOT NULL DEFAULT '',
  pinned      boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 一覧の既定ソート（ピン留め → 直近更新順）に効くインデックス
CREATE INDEX IF NOT EXISTS idx_notes_pinned_updated
  ON notes (pinned DESC, updated_at DESC);

-- RLS（他テーブルと同じ方針）
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for anon" ON notes;
CREATE POLICY "Allow all for anon" ON notes
  FOR ALL USING (true) WITH CHECK (true);
