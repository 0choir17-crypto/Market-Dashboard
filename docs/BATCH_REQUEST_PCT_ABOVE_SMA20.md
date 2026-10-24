# バッチ側への依頼: `market_conditions.pct_above_sma20` の追加

Market Dashboard の Breadth 判定カードで「20日線より上にある銘柄の割合」（米国の MMTW 相当）を
表示したい。画面側は対応済みで、列が届けば自動で表示される（届くまでは「未供給」と出る）。

## 追加してほしい列

| 項目 | 内容 |
|---|---|
| テーブル | `market_conditions` |
| 列名 | `pct_above_sma20` |
| 型 | `numeric`（`pct_above_sma50` と同じ型）、NULL 可 |
| 単位 | %（0〜100）。`pct_above_sma50` と同じスケール |
| 計算 | 終値 > 20 日単純移動平均（SMA20）の銘柄数 ÷ 判定できた銘柄数 × 100 |
| 母集団 | **`pct_above_sma50` / `pct_above_sma200` と同じ母集団・同じ除外条件**（3 本を並べて比べるため） |
| 判定できない銘柄 | 上場 20 営業日未満など SMA20 が出ない銘柄は分母から外す（`pct_above_sma50` の扱いに合わせる） |
| 履歴 | 可能なら過去分も埋める。最低でも直近 1 年（画面は 5 営業日前との差を出すので、少なくとも 6 営業日ぶん） |

## 画面側の読み方（参考）

- 列は `select('*')` で取っているので、列が無い間もエラーにはならない（`lib/breadthState.ts`）
- 型は `types/market.ts` の `pct_above_sma20?: number | null`
- 判定の主役は 50日線（`pct_above_sma50`）のまま。20日線は短期の参加度の補助として並べる
