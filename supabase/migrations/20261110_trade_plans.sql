-- trade_plans テーブル作成 — 前日夜に立てる「次に買う銘柄」の検討中リスト
-- Supabase SQL Editor で実行すること。
--
-- 寄りで買う前提の計画。想定エントリーは前日終値、損切りは手入力の価格。
-- 株数は保存しない（Trading ページで現金 × リスク % から毎回計算し直す）。
-- 新規トレードとして記録したら、アプリ側でこの行を削除する。
-- RLS は trades / notes と同じ: 閲覧は anon 可、書き込みはログイン必須。

create table if not exists trade_plans (
  id          uuid primary key default gen_random_uuid(),
  ticker      text not null,
  prev_close  numeric not null,
  stop_price  numeric not null,
  memo        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table trade_plans enable row level security;
drop policy if exists "anon_read_only" on trade_plans;
drop policy if exists "authenticated_full_access" on trade_plans;
create policy "anon_read_only" on trade_plans for select to anon using (true);
create policy "authenticated_full_access" on trade_plans for all to authenticated using (true) with check (true);

notify pgrst, 'reload schema';
