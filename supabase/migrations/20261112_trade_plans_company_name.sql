-- trade_plans に銘柄名を追加（手入力。新規トレードの Name に引き継ぐ）
-- Supabase SQL Editor で実行すること。
alter table trade_plans add column if not exists company_name text;

notify pgrst, 'reload schema';
