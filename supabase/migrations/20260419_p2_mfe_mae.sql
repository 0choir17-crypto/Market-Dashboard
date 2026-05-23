-- P2: MFE / MAE recording
-- 2026-04-19

ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS mfe_price NUMERIC,
  ADD COLUMN IF NOT EXISTS mfe_date  DATE,
  ADD COLUMN IF NOT EXISTS mfe_pct   NUMERIC,
  ADD COLUMN IF NOT EXISTS mae_price NUMERIC,
  ADD COLUMN IF NOT EXISTS mae_date  DATE,
  ADD COLUMN IF NOT EXISTS mae_pct   NUMERIC;

COMMENT ON COLUMN trades.mfe_price IS 'Maximum Favorable Excursion: 保有期間中の最高終値';
COMMENT ON COLUMN trades.mfe_date  IS 'MFE到達日';
COMMENT ON COLUMN trades.mfe_pct   IS 'MFE%: (mfe_price - entry_price) / entry_price * 100';
COMMENT ON COLUMN trades.mae_price IS 'Maximum Adverse Excursion: 保有期間中の最安終値';
COMMENT ON COLUMN trades.mae_date  IS 'MAE到達日';
COMMENT ON COLUMN trades.mae_pct   IS 'MAE%: (mae_price - entry_price) / entry_price * 100';
