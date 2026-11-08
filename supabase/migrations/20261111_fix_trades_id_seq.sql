-- trades.id の連番（trades_id_seq）を現在の最大 id の次に合わせ直す
-- Supabase SQL Editor で実行すること。何度実行しても安全。
--
-- 症状: 新規トレードの保存で
--   duplicate key value violates unique constraint "trades_pkey"
-- 原因: id を明示した INSERT（CSV 取り込み・SQL での一括投入など）で行を入れると
--   連番は進まないため、次に採番される id が既存の行とぶつかる。

select setval(
  pg_get_serial_sequence('trades', 'id'),
  coalesce((select max(id) from trades), 0) + 1,
  false
);
