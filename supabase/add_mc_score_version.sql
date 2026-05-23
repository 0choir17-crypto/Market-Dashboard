-- Migration: distinguish v3 (0-21) and v4 (0-100) MC scores in the trades table
-- Date: 2026-04-26
-- Purpose: trades.mc_score is a real number that previously held the v3 score
-- (0-21). New trades will record the v4 score (0-100) instead, but old trades
-- must remain interpretable as v3. Add mc_score_version so the UI can pick the
-- correct denominator and color thresholds per row.
--
-- Apply manually in the Supabase SQL editor BEFORE deploying the dashboard
-- changes. The dashboard tolerates missing/null mc_score_version (treats as
-- 'v3' for legacy compatibility), so deploying code first is safe — but new
-- v4 trades will then be misclassified as v3 until this migration runs.

ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS mc_score_version text DEFAULT 'v3';

-- Backfill: every existing row recorded MC v3 (0-21), so the default 'v3'
-- already applies to them. No UPDATE needed.

-- Optional: enforce only known values (skip if you want to allow future
-- versions like 'v5' without a migration).
-- ALTER TABLE trades ADD CONSTRAINT trades_mc_score_version_check
--   CHECK (mc_score_version IN ('v3', 'v4'));

-- Optional column comment for the Supabase schema browser.
-- COMMENT ON COLUMN trades.mc_score_version IS
--   'Which MC scoring system mc_score holds: v3 (0-21, 7-factor) or v4 (0-100, 8-factor).';
