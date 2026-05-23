-- ============================================================
-- Phase 1A: trades テーブルにPortfolio系カラム追加
-- ============================================================
ALTER TABLE trades ADD COLUMN IF NOT EXISTS cost_basis real;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS stop_21l real;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS init_risk_pct real;

-- ============================================================
-- Phase 1B: 既存 trades のstatus正規化 (OPEN→open, CLOSED→closed)
-- ============================================================
UPDATE trades SET status = 'open'   WHERE status = 'OPEN';
UPDATE trades SET status = 'closed' WHERE status = 'CLOSED';

-- ============================================================
-- Phase 1C: positions (open/plan) → trades へ移行
-- ============================================================
-- ※ ticker + entry_date + entry_price が一致するレコードは重複とみなしスキップ
INSERT INTO trades (
  ticker, company_name, sector, entry_date, entry_price, shares,
  cost_basis, stop_price, stop_21l, init_risk_pct, target_r,
  memo, status, created_at, updated_at
)
SELECT
  p.ticker, p.company_name, p.sector, p.entry_date, p.entry_price, p.shares,
  p.cost_basis, p.stop_price, p.stop_21l, p.init_risk_pct, p.target_r,
  p.memo, p.status, p.created_at, p.updated_at
FROM positions p
WHERE p.status IN ('open', 'plan')
  AND NOT EXISTS (
    SELECT 1 FROM trades t
    WHERE t.ticker = p.ticker
      AND t.entry_date = p.entry_date
      AND t.entry_price = p.entry_price
  );

-- ============================================================
-- Phase 1D: trade_history → trades (status='closed') へ移行
-- ============================================================
INSERT INTO trades (
  ticker, company_name, entry_date, entry_price, shares,
  exit_date, exit_price, pnl, stop_price, target_r,
  r_multiple, exit_reason, memo, status,
  created_at, updated_at
)
SELECT
  h.ticker, h.company_name, h.entry_date, h.entry_price, h.shares,
  h.exit_date, h.exit_price, h.realized_pnl, h.stop_price, h.target_r,
  h.r_multiple, h.exit_reason, h.memo, 'closed',
  h.created_at, h.created_at
FROM trade_history h
WHERE NOT EXISTS (
    SELECT 1 FROM trades t
    WHERE t.ticker = h.ticker
      AND t.entry_date = h.entry_date
      AND t.entry_price = h.entry_price
      AND t.status = 'closed'
  );

-- ============================================================
-- Phase 1E: 移行結果確認クエリ（実行して件数を確認）
-- ============================================================
SELECT status, count(*) FROM trades GROUP BY status ORDER BY status;
