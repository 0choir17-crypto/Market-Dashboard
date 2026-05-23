-- ============================================================================
-- MC v4 dynamics 3 軸調査クエリ (Supabase SQL Editor 用)
-- 目的: market_conditions テーブルから Velocity / Duration / Shock 系列名と
--       最新データを確認し、ダッシュボードに渡す SELECT 13 列を確定する。
--
-- 使い方:
--   1. Supabase Dashboard > SQL Editor にコピペ
--   2. 各セクション (Q1〜Q5) を個別に実行 (1 個ずつ)
--   3. Q1 の結果から実在する列名を確認 → タスクに貼り付け
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- Q1: market_conditions の全列を型と一緒に列挙
-- → ここから velocity / duration / shock / dyn_ / 関連の列名を拾う
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  ordinal_position AS pos,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'market_conditions'
ORDER BY ordinal_position;


-- ────────────────────────────────────────────────────────────────────────────
-- Q2: dynamics 系っぽい列名だけ抽出 (キーワード絞り込み)
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  ordinal_position AS pos,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'market_conditions'
  AND (
       column_name ILIKE '%velocity%'
    OR column_name ILIKE '%duration%'
    OR column_name ILIKE '%shock%'
    OR column_name ILIKE '%dyn%'
    OR column_name ILIKE '%accel%'
    OR column_name ILIKE '%momentum%'
    OR column_name ILIKE '%streak%'
    OR column_name ILIKE '%regime_days%'
    OR column_name ILIKE '%delta%'
    OR column_name ILIKE '%slope%'
    OR column_name ILIKE 'mc_v4_%'
  )
ORDER BY ordinal_position;


-- ────────────────────────────────────────────────────────────────────────────
-- Q3: 最新 1 行を全列ダンプ (どの列に値が入っているか確認)
-- ────────────────────────────────────────────────────────────────────────────
SELECT *
FROM market_conditions
WHERE mc_v4 IS NOT NULL
ORDER BY date DESC
LIMIT 1;


-- ────────────────────────────────────────────────────────────────────────────
-- Q4: 直近 5 営業日の MC v4 + 既知の v4 ファクター
-- → dynamics 列が判明したらここに足して値の動きを確認
-- ────────────────────────────────────────────────────────────────────────────
SELECT
  date,
  mc_v4,
  mc_regime_v4,
  mc_divergence_flag_v4,
  mc_v4_valid_weight_pct,
  mc_v4_m1, mc_v4_m2, mc_v4_m3,
  mc_v4_c1,
  mc_v4_b1,
  mc_v4_s1, mc_v4_s2, mc_v4_s3
FROM market_conditions
WHERE mc_v4 IS NOT NULL
ORDER BY date DESC
LIMIT 5;


-- ────────────────────────────────────────────────────────────────────────────
-- Q5: 想定の dynamics 13 列テンプレ (列名は Q1/Q2 の結果で書き換える)
-- → 実在を確認したらこの SELECT をダッシュボード側にそのままコピー
--
-- 例: date + Velocity 4 + Duration 4 + Shock 4 = 13 列
-- ────────────────────────────────────────────────────────────────────────────
-- SELECT
--   date,
--   -- Velocity 軸
--   <velocity_score_col>,
--   <velocity_zscore_col>,
--   <velocity_state_col>,
--   <velocity_chg_col>,
--   -- Duration 軸
--   <duration_days_col>,
--   <duration_regime_col>,
--   <duration_since_col>,
--   <duration_pct_col>,
--   -- Shock 軸
--   <shock_score_col>,
--   <shock_flag_col>,
--   <shock_severity_col>,
--   <shock_event_col>
-- FROM market_conditions
-- WHERE mc_v4 IS NOT NULL
-- ORDER BY date DESC
-- LIMIT 1;
