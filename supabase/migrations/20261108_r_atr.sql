-- R を 2 種類に分ける（案A）。
--
--   r_multiple … 損切り基準の R = (決済 − 建値) ÷ (建値 − initial_stop)。
--                計画どおり損切りすれば -1R。新規・決済画面が書き込む「本来の R」。
--   r_atr      … ATR 基準の R = (決済 − 建値) ÷ atr_at_entry。
--                値動きが「買う前日の 1 日平均値幅」の何倍だったか。損切り価格が無くても出せる代用値。
--   atr_at_entry … 買う前日の 14 日 ATR（RMA）。株式分割は買った日の価格水準に戻した値。
--
-- 2 つは意味が違うので同じ列に混ぜない。画面（Journal）で基準を切り替えて別々に集計する。

alter table trades add column if not exists r_atr        real;
alter table trades add column if not exists atr_at_entry real;

comment on column trades.r_multiple   is '損切り基準の R = (exit − entry) / (entry − initial_stop)';
comment on column trades.r_atr        is 'ATR 基準の R = (exit − entry) / atr_at_entry';
comment on column trades.atr_at_entry is '買う前日の 14 日 ATR（RMA）。分割は買った日の価格水準に補正済み';

notify pgrst, 'reload schema';
