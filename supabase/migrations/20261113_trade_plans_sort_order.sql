-- trade_plans に優先順位（並び順）を追加
-- Supabase SQL Editor で実行すること。何度実行しても安全。
--
-- 検討中一覧は sort_order の小さい順に並べ、上から買付余力を割り当てる。
-- 既存行は作成順で 1, 2, 3… を振る。
alter table trade_plans add column if not exists sort_order integer;

update trade_plans t
set sort_order = r.rn
from (select id, row_number() over (order by created_at) as rn from trade_plans) r
where t.id = r.id and t.sort_order is null;

notify pgrst, 'reload schema';
