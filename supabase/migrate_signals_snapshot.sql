-- ============================================================
-- Signal Snapshot Migration
-- trades + watchlist テーブルにシグナルスナップショット列を追加
-- 既存データへの影響なし（全てNULLABLE追加のみ）
-- ============================================================

-- ── trades テーブル ──────────────────────────────────────────

-- Portfolio統合用（将来Step Cで使用。今は空でOK）
ALTER TABLE trades ADD COLUMN IF NOT EXISTS sector text;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS stop_price real;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS target_r real;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS exit_reason text;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS r_multiple real;

-- シグナルスナップショット（エントリー時点の指標を保存）
ALTER TABLE trades ADD COLUMN IF NOT EXISTS signal_price real;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS rs_at_entry real;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS rvol_at_entry real;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS adr_at_entry real;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS dist_ema21_at_entry real;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS stop_pct_at_entry real;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS mc_met_at_entry boolean;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS mc_condition_at_entry text;

-- ── watchlist テーブル ───────────────────────────────────────

ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS rs_composite real;
ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS rvol real;
ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS adr_pct real;
ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS dist_ema21_r real;
ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS stop_pct real;
ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS mc_met boolean;
ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS mc_condition text;
ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS sector_name text;
ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS signal_price real;
