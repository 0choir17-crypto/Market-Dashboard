-- エントリー種別（押し目 9EMA / 押し目 21EMA / 押し目 VWAP / ブレイク / その他）。
-- Journal の「切り口別の期待値」で押し目とブレイクの成績を比べるために使う。
-- 値はアプリ側 lib/entryTypes.ts の表示名をそのまま保存する。過去トレードは NULL（未設定）。
alter table trades add column if not exists entry_type text;

comment on column trades.entry_type is
  'エントリー種別（lib/entryTypes.ts の ENTRY_TYPES）';

notify pgrst, 'reload schema';
