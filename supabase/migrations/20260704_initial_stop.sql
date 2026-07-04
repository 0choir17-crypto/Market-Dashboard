-- R 倍数を「初期リスク」基準にするための不変カラム。
--
-- stop_price はトレール等で随時更新されるため、決済時の R 計算に使うと
-- 分母 (entry - stop) が変わってしまう。ストップを建値より上にトレールした
-- 勝ちトレードでは分母の符号が反転し、R が大きな負値として保存されていた
-- （さらに連敗カウンターまで加算されていた）。
--
-- 以後のルール:
--   - initial_stop は建玉時に一度だけ設定し、編集で上書きしない
--   - R = (exit - entry) / (entry - initial_stop)
--   - init_risk_pct も initial_stop 基準（アプリ側で対応済み）

alter table trades add column if not exists initial_stop numeric;

comment on column trades.initial_stop is
  '建玉時の初期ストップ（不変）。R = (exit − entry) / (entry − initial_stop)';

-- 既存行のバックフィル: 現在の stop_price を初期値として採用。
-- 正確な初期値は復元不能なので、トレール済みポジションの過去 R は
-- 引き続き近似値になる点に注意。
update trades
set initial_stop = stop_price
where initial_stop is null and stop_price is not null;
