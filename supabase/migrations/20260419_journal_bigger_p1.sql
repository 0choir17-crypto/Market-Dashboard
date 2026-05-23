-- Trade Journal bigger P1: review feature + signal edit support
-- 2026-04-19

ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS review_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS lesson_learned TEXT,
  ADD COLUMN IF NOT EXISTS entry_reason TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_trades_review_tags ON trades USING GIN (review_tags);

COMMENT ON COLUMN trades.review_tags IS '振り返りタグ配列（lib/reviewTags.tsのTAG_IDSを参照）';
COMMENT ON COLUMN trades.lesson_learned IS '次回の教訓（自由記述）';
COMMENT ON COLUMN trades.entry_reason IS 'エントリー時の判断理由（自由記述）';
COMMENT ON COLUMN trades.reviewed_at IS '振り返り完了タイムスタンプ。NULL=未振り返り';
