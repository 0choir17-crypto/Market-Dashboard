-- trades テーブルに、ダッシュボードが使う任意列をすべて揃える（冪等）。
-- Supabase SQL Editor で実行すること。既にある列は IF NOT EXISTS でスキップされる。
--
-- 背景: 本番 trades テーブルが一部の列（例: mc_regime）を持っておらず、
--   トレード記録時に PostgREST が
--   "Could not find the 'mc_regime' column of 'trades' in the schema cache"
--   を返していた。ダッシュ側は欠損列を自動除外して保存するフォールバックを
--   持つ（lib/resilientWrite.ts）が、本 SQL を実行すれば MC スナップショット等の
--   付加情報も含めて正しく永続化されるようになる。

-- エントリー時の市場環境
ALTER TABLE trades ADD COLUMN IF NOT EXISTS mc_score              real;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS mc_regime             text;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS mc_score_version      text;

-- ポートフォリオ統合用
ALTER TABLE trades ADD COLUMN IF NOT EXISTS sector_s33            text;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS stop_price            real;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS stop_21l              real;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS cost_basis            real;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS init_risk_pct         real;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS target_r              real;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS exit_reason           text;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS r_multiple            real;

-- シグナルスナップショット（エントリー時）
ALTER TABLE trades ADD COLUMN IF NOT EXISTS signal_price          real;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS rs_at_entry           real;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS rvol_at_entry         real;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS adr_at_entry          real;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS dist_ema21_at_entry   real;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS stop_pct_at_entry     real;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS mc_met_at_entry       boolean;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS mc_condition_at_entry text;

-- 振り返り
ALTER TABLE trades ADD COLUMN IF NOT EXISTS review_tags           text[];
ALTER TABLE trades ADD COLUMN IF NOT EXISTS lesson_learned        text;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS entry_reason          text;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS reviewed_at           timestamptz;

-- MFE / MAE
ALTER TABLE trades ADD COLUMN IF NOT EXISTS mfe_price             real;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS mfe_date              date;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS mfe_pct               real;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS mae_price             real;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS mae_date              date;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS mae_pct               real;

-- PostgREST のスキーマキャッシュを即時リロード（Supabase は通常 DDL で自動更新）
NOTIFY pgrst, 'reload schema';
