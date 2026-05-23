-- trades テーブル作成
-- Supabase SQL Editor で実行すること

CREATE TABLE trades (
  id            bigserial PRIMARY KEY,
  ticker        text NOT NULL,
  company_name  text,
  screen_name   text,

  -- エントリー
  entry_date    date NOT NULL,
  entry_price   real NOT NULL,
  shares        integer NOT NULL,

  -- イグジット（未決済ならNULL）
  exit_date     date,
  exit_price    real,

  -- 損益（exit_price入力時に自動計算）
  pnl           real,
  pnl_pct       real,
  result        text,

  -- エントリー時の市場環境（自動取得）
  mc_score      real,
  mc_regime     text,

  -- メタデータ
  memo          text,
  status        text NOT NULL DEFAULT 'OPEN',
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- インデックス
CREATE INDEX idx_trades_ticker ON trades(ticker);
CREATE INDEX idx_trades_entry_date ON trades(entry_date);
CREATE INDEX idx_trades_status ON trades(status);
CREATE INDEX idx_trades_mc_score ON trades(mc_score);

-- RLS（他テーブルと同じ方針）
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for anon" ON trades
  FOR ALL USING (true) WITH CHECK (true);
