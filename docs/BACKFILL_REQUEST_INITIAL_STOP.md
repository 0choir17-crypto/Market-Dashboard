# 依頼: trades の初期ストップ（initial_stop）を埋め、R を計算できるようにする

Market-Dashboard の `/` に「My Trades」カード（自分の成績）を置いた。成績と資産曲線は **R**（最初に取ったリスクの何倍を得た / 失ったか）で出す。
ところが本番の `trades` には `initial_stop` と `r_multiple` がほとんど入っておらず、直近 10 件の決済の大半で R が計算できない。
株価データと 21EMA Low の計算を持っているこのリポジトリで埋めてほしい。

---

## 背景

- R = (決済値 − 建値) ÷ (建値 − 初期ストップ)。分母は **建玉時の初期ストップ（不変）**。`stop_price` はトレールで動くので使わない
  （`supabase/migrations/20260704_initial_stop.sql` のルール）。
- Market-Dashboard の建玉入力（`PositionModal`）はストップを入れれば `initial_stop` を保存する。
- 一方、SBI の取引履歴を取り込む `Market-Dashboard/scripts/imports/sbi_to_trades.py` はストップを何も書かない。直近の決済の多くはこの経路で入っている。
- ストップのルールは **21EMA Low**（安値で計算した EMA21）。1R = 建値 − 21EMA Low。
  Watchlist Journal の「1R（21EMA Low）」、検証の「EMA21 タッチ → 1R = 21EMA Low」と同じ定義。

## やってほしいこと

### 1. 過去分を埋める（本番への書き込み。実行前に件数と内容を確認できる形で出すこと）

対象: `trades` のうち `initial_stop IS NULL` の行（`status` が `closed` と `open` の両方）。**既に値がある行は上書きしない。**

1. 各行について、`entry_date` の**前営業日**の 21EMA Low を求める（建玉した日の引け前に分かっている線を使うため。
   当日の値を使う運用なら当日でよいが、どちらにしたかをレポートに書く）。
2. `initial_stop` = その 21EMA Low。ただし次の場合は埋めない（null のまま残し、一覧に理由を出す）:
   - 21EMA Low ≥ 建値（ストップが建値より上になり R が定義できない）
   - 建値から 21EMA Low までが 15% を超える（ルール外のトレードの可能性が高い）
   - 株価データが無い / EMA の助走が足りない（上場直後など）
3. `closed` の行は `r_multiple` も計算し直して入れる（`initial_stop` を埋めた行だけ）。
4. **推定値であることを残す**。可能なら `trades` に `initial_stop_source text`（`'manual'` / `'ema21_low_backfill'`）を足し、
   埋めた行に `'ema21_low_backfill'` を入れる。列を足せない場合は、埋めた行の `id` 一覧をレポートに残す。
5. 先に **dry-run**（書き込まずに、埋める行・埋めない行と理由・計算した R の一覧を CSV で出す）を実装し、
   その結果を人が確認してから本番に書く。

### 2. 今後の取り込みでも埋まるようにする

`Market-Dashboard/scripts/imports/sbi_to_trades.py`（または取り込みを担っている処理）で、新しく入れる行に
上と同じ方法で `initial_stop`（と決済済みなら `r_multiple`）を入れる。21EMA Low の計算がこのリポジトリにしか無いなら、
取り込み後にこのリポジトリのバッチで「`initial_stop IS NULL` の行を埋める」処理を毎日走らせる形でもよい。

## 制約

- 書き込みは `trades` の `initial_stop` / `r_multiple`（と追加する場合の `initial_stop_source`）だけ。ほかの列・行は触らない。
- 既に `initial_stop` が入っている行は手入力の値なので、絶対に上書きしない。
- RLS で `trades` の書き込みは authenticated 限定（`20260704_secure_user_tables.sql`）。サービスロールキーなど、書き込みに使う認証は既存の運用に合わせる。

## 納品物

1. dry-run の CSV（id / ticker / entry_date / entry_price / 計算した initial_stop / 埋める・埋めない / 理由 / 計算した R）
2. 本番に書いた件数と、埋めなかった行の一覧（理由つき）
3. 今後の取り込みで埋まるようにした変更点
4. 21EMA Low を「前営業日」「当日」のどちらで取ったか
