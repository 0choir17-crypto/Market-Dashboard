-- Breakeven category + status DEFAULT fix
--
-- 1) status DEFAULT was 'OPEN' (uppercase), but TS types and all app filters
--    use lowercase 'open'. An INSERT that omitted status produced a ghost row
--    invisible to every tab. Switch the default to lowercase and add an
--    explicit CHECK constraint.
--
-- 2) Add a third result category, BREAKEVEN, for pnl == 0 trades. Previously
--    each write path classified pnl=0 differently (SBI importer → WIN,
--    Close/Edit modals → LOSS, aggregation fallback → neither). The
--    classifier in lib/tradeResult.ts is now the single source of truth and
--    emits BREAKEVEN when pnl is exactly zero.
--
-- 3) Backfill: any existing closed row with pnl=0 is reclassified to
--    BREAKEVEN so historical stats line up with the new convention.

BEGIN;

ALTER TABLE trades ALTER COLUMN status SET DEFAULT 'open';

ALTER TABLE trades DROP CONSTRAINT IF EXISTS trades_status_chk;
ALTER TABLE trades ADD CONSTRAINT trades_status_chk
  CHECK (status IN ('plan', 'open', 'closed'));

ALTER TABLE trades DROP CONSTRAINT IF EXISTS trades_result_chk;
ALTER TABLE trades ADD CONSTRAINT trades_result_chk
  CHECK (result IS NULL OR result IN ('WIN', 'LOSS', 'BREAKEVEN'));

UPDATE trades
SET result = 'BREAKEVEN'
WHERE status = 'closed' AND pnl = 0 AND result IS DISTINCT FROM 'BREAKEVEN';

COMMIT;
