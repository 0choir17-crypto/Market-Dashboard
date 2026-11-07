-- 売った日（exit_date）の指標。買った日の rs_at_entry / rvol_at_entry / adr_at_entry と対で、
-- 決済済み一覧に参考情報として並べる。値の出し方は *_at_entry と同じ（その日の指標）。
alter table trades add column if not exists rs_at_exit   real;
alter table trades add column if not exists rvol_at_exit real;
alter table trades add column if not exists adr_at_exit  real;

comment on column trades.rs_at_exit   is '売った日の RS（rs_at_entry と同じ定義）';
comment on column trades.rvol_at_exit is '売った日の RVOL（rvol_at_entry と同じ定義）';
comment on column trades.adr_at_exit  is '売った日の ADR%（adr_at_entry と同じ定義）';

notify pgrst, 'reload schema';
