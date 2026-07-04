-- 書き込みを authenticated ロール限定にする（anon は読み取りのみ）
--
-- 背景: 本アプリは GitHub Pages の静的サイトで、anon キーは JS バンドルに
-- 平文で埋め込まれ誰でも取り出せる。従来の "Allow all for anon"
-- (FOR ALL USING (true) WITH CHECK (true)) では、URL を知る誰でも
-- trades / notes / risk_settings / watchlist を REST 経由で読み取り・
-- 改ざん・削除できた。
--
-- 適用後: 閲覧は従来どおりログイン不要、書き込みは Supabase Auth の
-- ログインが必要になる（アプリ側にログイン UI 実装済み）。
--
-- 事前準備（Supabase ダッシュボード）:
--   1. Authentication > Users で自分のメール + パスワードのユーザーを作成
--   2. Authentication > Sign In / Up で新規サインアップを無効化
--      (Allow new users to sign up = OFF)
--
-- 注意: market_conditions 等のデータ系テーブルは日次取り込みパイプラインが
-- anon キーで書いている可能性があるため、この移行では触らない。
-- パイプラインが service_role キーを使っているなら、同じ締め付けを
-- データ系テーブルにも適用することを推奨。

do $$
declare
  t text;
  p record;
begin
  foreach t in array array['trades', 'notes', 'risk_settings', 'watchlist'] loop
    -- テーブルが存在しない環境（部分セットアップ等）はスキップ
    if to_regclass('public.' || t) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);

    -- 既存ポリシーを全削除（"Allow all for anon" 等、名前の揺れに依存しない）
    for p in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;

    execute format(
      'create policy "anon_read_only" on public.%I for select to anon using (true)', t);
    execute format(
      'create policy "authenticated_full_access" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
