# Earnings Quality 設計見直し案 — v2 (EQS) 移植用設計書

Market-Dashboard `/earnings`（決算品質スキャナー）の **v1 設計が高成長銘柄を構造的に取りこぼす**問題の
原因分析と、それを解消する v2 設計。`earningsqualitydesign.md`（v1 移植用設計書）と対で読むこと。

- 対象ブランチ: `claude/dashboard-design-review-xb9k3c`
- 前提スタック: v1 と同じ（Next.js App Router / React 19 / Tailwind v4 / Supabase JS v2 anon）
- 位置づけ: **別リポジトリへ渡す設計書**。§5 の参照実装は依存ゼロでそのままコピー可（strict tsc 通過済み）。

---

## 0. 結論（TL;DR）

**v1 の `score3` は「決算品質スコア」ではなく、実質「増配検出器」として動作している。**

配点 7 点のうち 3 点（43%）を占める `s_div` は四半期開示ではほぼ常に 0 になるため、
**増配が無い銘柄はスコアの上位バンドに構造的に到達できない**。検証結果（実装コードから全列挙）:

| 四半期 | 増配なし（据置 0%） | 増配 +5% | 増配 +12% |
|---|---|---|---|
| **1Q** | 到達域 `[0,1,2]` — **最良でも「弱(灰)」** | `[2,3,4]` — 最良「中(黄)」 | `[3,4,5]` — 満点可 |
| **2Q/3Q** | 到達域 `[0,1,2,3,4]` — **最良でも「中(黄)」** | `[2,3,4,5,6]` — 最良「強(緑)」 | `[3,4,5,6,7]` — 満点可 |

つまり **1Q は増配が無ければ、どれだけ好決算でも必ず灰色の「弱」バンドに落ちる**。
`EPS +120% / 売上 +45% / 通期 OP 上方修正 +25% / 進捗 +12pt 先行` という完璧な 1Q 決算でも `2/5`「弱(灰)」。

これが今回の見逃し（1Q 開示直後に株価急騰）の直接原因である。
加えて v1 は `fop_rev_pct`（通期予想の上方修正）と `progress_excess_pct`（進捗超過）を
**取得・表示しているのにスコアへ一切算入していない**。日本株の決算後ドリフトで最も効くシグナルが、
順位・色・⭐ のいずれにも反映されていない。

v2 では 4 軸 100 点の連続スコア **EQS** に置き換える。同じケースが `2/5「弱」` → `EQS 91「S」` になる。
逆に「微増益＋増配」で v1 が `7/7 満点` を付けていた銘柄は `EQS 29「C」`、
「増配＋通期下方修正」の `7/7 満点` は `EQS 14「C」` に落ちる（いずれも §3.6 に実測値）。

**最重要**: 1Q については `eps_yoy_pct`（累計 YoY）が定義上そのまま単Q YoY と一致するため、
**供給側（スキャナー）の改修を待たずに UI 側だけで今日から修正できる**（§7 Phase 0）。

---

## 1. 事象と診断

### 1.1 観測された事象

対象銘柄: **トーメンデバイス（2737・卸売業・3 月期）** と想定。
`/earnings` 上で低スコア（下位バンド）だったが、その後株価が急騰。ダッシュボードは候補として提示しなかった。

> **データ照合について**: 本セッションからは Supabase の認証情報が参照できないため、
> 当該行の実値（`score3` / 各サブスコア / `fop_rev_pct`）は未照合。
> ただし以下の原因分析は **v1 の仕様と実装コードのみから決定論的に導出**しており、
> 実データに依存しない。実行環境で 1 クエリ確認する SQL を §9 に置いた。
>
> なお「トーメンとデバイス」を単一銘柄 **トーメンデバイス (2737)** と解釈した。
> 仮に別々の 2 銘柄を指していた場合でも、以下の構造的欠陥はどの銘柄にも同一に効くため結論は変わらない。

### 1.2 なぜ低スコアになったか（決定論的導出）

3 月期企業の 1Q は 8 月上旬開示。v1 の定義より:

```
score3 = s_div + s_eps + s_sales
  s_eps   = (eps_yoy_pct   > 0 ? 1 : 0) + (eps_qoq_pct   > 0 ? 1 : 0)
  s_sales = (sales_yoy_pct > 0 ? 1 : 0) + (sales_qoq_pct > 0 ? 1 : 0)
  s_div   = div_change_pct > 0 ? (>= 10 ? 3 : 2) : 0
```

1. **1Q は `eps_qoq_pct` / `sales_qoq_pct` が常に null**（v1 設計書 §2 に明記）
   → `s_eps <= 1`, `s_sales <= 1`
2. **四半期開示では通常、通期配当予想を据え置く** → `div_change_pct = 0` → `s_div = 0`
3. したがって **`score3 <= 2`**。`score3Color` は `>= 3` で初めて「中(黄)」なので、**必ず「弱(灰)」**
4. `rank_in_day` は供給側で `score3` 降順に付与 → 8 月の集中日（`events_in_day >= 100`、
   他決算期企業の 2Q/3Q が同居）では、増配を出した 6-7 点の行が上位を独占し、
   2 点の行は数百位に沈む → `pct_rank_in_day` も悪化 → **⭐（Top 1%）も付かない**

伸び率のマグニチュード（+120% なのか +0.1% なのか）は、スコア・順位・色のどこにも反映されない。
テーブルの数値セルには出ているが、**ユーザーは下位数百行までスクロールしないので事実上不可視**。

---

## 2. 根本原因（影響度順）

| # | 原因 | 内容 | 影響 |
|---|---|---|---|
| **R1** | **増配サブスコアの過大配点** | `s_div` が 7 点中 3 点（43%）。四半期では通常 0 → 上位バンドが増配銘柄で占有される | 致命 |
| **R2** | **1Q の構造的過小評価** | QoQ が常に null → 増配なしなら理論最大 2/5 = 常時「弱(灰)」 | 致命 |
| **R3** | **ガイダンス修正がスコア非算入** | `fop_rev_pct` / `progress_excess_pct` を取得・表示しているのに `score3` に入れていない。**下方修正しても減点ゼロ** | 致命 |
| **R4** | **二値化によるマグニチュード消失** | `> 0` かどうかだけを見る。`+0.1%` と `+300%` が同点 | 大 |
| **R5** | **黒字転換／赤字転落が表現不能** | 前年同期が赤字だと YoY % が null または符号が無意味 → 最強クラスのシグナルである黒転が 0 点で脱落 | 大 |
| **R6** | **QoQ の季節性未補正** | 季節偏重のある企業は QoQ 悪化が正常。減点は誤り。単Q YoY を使うべき | 中 |
| **R7** | **欠損と中立の同一視** | `null`（未取得）も `0%`（据置）も同じ 0 点。データ整備の弱い銘柄が一律に不利 | 中 |
| **R8** | **8 段階整数によるタイ多発** | 集中日 300 行 × 取りうる値 8 種 → 同点が数十行。tie-break は `rank_in_day`（= `score3` 由来）で実質不定 → 「Top 1% = `end_per_risk` 1.509」の検証結果が再現不能 | 中 |
| **R9** | **Q 種別混在ランキングの不公平** | 満点が Q によって 5/7 と異なるのに、`rank_in_day` は生の `score3` 降順。混在日で 1Q が構造的に不利 | 中 |
| **R10** | **需給・流動性が非算入** | `above_sma200` / `turnover_oku` は表示のみ。売買代金 0.2 億の銘柄と 20 億の銘柄が同列 | 小 |
| **R11** | **フィードバックループの不在** | 開示後リターンを記録していないため、「見逃した」ことを system が検知できない。今回の発見が人力に依存した | 大（プロセス） |
| **R12** | **フィルタがセクターのみ** | 「上方修正あり × 売買代金 3 億以上」のような絞り込みができない | 小 |

R1/R2/R3 が今回の見逃しの直接原因、R11 が「見逃しに気付けなかった」原因。

---

## 3. v2 スコア仕様 — EQS (Earnings Quality Score)

### 3.1 設計原則

1. **4 軸の加点式**（成長 40 / ガイダンス 30 / 還元 10 / 需給 20 = 100 点）
2. **段階的加点でマグニチュードを保持**（z-score ではなく閾値テーブル → 日をまたいで比較可能・説明可能）
3. **欠損軸は分子・分母の両方から除外**して比例配分（available-points normalization）
   → 「データが無いから低スコア」が起きない。信頼度は `coverage` として別に持つ
4. **符号変化（黒転・赤転）は % より優先**して判定
5. **下方修正・減配・赤字転落は正規化後に減点**（ペナルティ項）
6. **単Q YoY を使うことで 1Q の特例が消滅** → 全 Q 同一スケール、`maxScoreFor` 不要

### 3.2 配点表

| 軸 | キー | 配点 | 入力列 |
|---|---|---|---|
| 成長・EPS | `growthEps` | 22 | `eps_q_yoy_pct` / `eps_turnaround` |
| 成長・売上 | `growthSales` | 18 | `sales_q_yoy_pct` |
| ガイダンス・通期修正 | `guidanceRev` | 20 | `fop_rev_pct` / `has_fop_revision` |
| ガイダンス・進捗超過 | `guidanceProgress` | 10 | `progress_excess_pct` |
| 株主還元 | `shareholder` | 10 | `div_change_pct` |
| トレンド | `trend` | 10 | `above_sma200` |
| 流動性 | `liquidity` | 10 | `turnover_oku` |
| | | **100** | |

> 還元の配点を **43% → 10%** に落としたのが v1 からの最大の変更。増配は依然プラス要因だが、
> 単独で上位バンドを取れる要因ではなくなる。

### 3.3 段階表

**EPS 単Q YoY（22 点）** — 符号変化を % より優先

| 条件 | 点 |
|---|---|
| `eps_turnaround = 'to_profit'`（黒字転換） | 22 |
| `>= +100%` | 22 |
| `>= +50%` | 18 |
| `>= +30%` | 14 |
| `>= +15%` | 10 |
| `> 0%` | 6 |
| `-15% 〜 0%` | 2 |
| `< -15%` | 0 |
| `loss_narrow`（赤字縮小） | 8 |
| `to_loss` / `loss_widen` | 0（＋ペナルティ） |
| null かつ turnaround 不明 | **軸ごと除外** |

**売上 単Q YoY（18 点）** — 売上は変動幅が小さいのでスケールを分ける

| `>= +30%` | `>= +20%` | `>= +10%` | `>= +5%` | `> 0%` | `-5%〜0%` | `< -5%` |
|---|---|---|---|---|---|---|
| 18 | 15 | 11 | 8 | 4 | 1 | 0 |

**通期 OP 修正率（20 点）**

| `>= +20%` | `>= +10%` | `>= +5%` | `> 0%` | `= 0`（据置） | `< 0` |
|---|---|---|---|---|---|
| 20 | 16 | 12 | 8 | 4 | 0 |

- `null` かつ `has_fop_revision` 不明 → **軸ごと除外**
- `has_fop_revision = false`（据置と確認できる）→ 中立 4 点で評価対象

**進捗超過 pt（10 点）**

| `>= +10` | `>= +5` | `>= +2` | `> 0` | `-5〜0` | `< -5` |
|---|---|---|---|---|---|
| 10 | 8 | 6 | 4 | 1 | 0 |

**増配率（10 点）**: `>= +10%` → 10 / `> 0%` → 7 / `= 0`（据置） → 3 / `< 0`（減配） → 0

**トレンド（10 点）**: `above_sma200 = true` → 10 / `false` → 0 / `null` → 除外

**流動性 億円（10 点）**: `>= 10` → 10 / `>= 5` → 8 / `>= 3` → 6 / `>= 1` → 4 / `>= 0.5` → 2 / それ未満 → 0

### 3.4 正規化とペナルティ

```
raw = round(100 * Σ(評価可能軸の獲得点) / Σ(評価可能軸の配点))
EQS = clamp(raw - penaltyTotal, 0, 100)

penalty: 通期 OP 下方修正 (<= -5%) → -12
         減配 (div_change_pct < 0)  → -8
         赤字転落 / 赤字拡大         → -10
```

- `coverage` = 評価可能配点の合計（最大 100）。`< 50` は `lowCoverage` として UI で「参考」表示し、
  ランキングから除外できるようにする。
- 下方修正は「軸で 0 点」＋「ペナルティ -12」の二重減点。意図的（最も強い忌避シグナルのため）。

### 3.5 バンドと配色

v1 と同じ 16 進値を再利用するため、既存の凡例・テーマ資産をそのまま流用できる。

| EQS | バンド | bg | text | border |
|---|---|---|---|---|
| `>= 80` | **S** 最上位 | `#86efac` | `#14532d` | `#16a34a` |
| `65-79` | **A** 強 | `#dcfce7` | `#15803d` | `#86efac` |
| `45-64` | **B** 中 | `#fef3c7` | `#92400e` | `#fde68a` |
| `0-44` | **C** 弱 | `#f3f4f6` | `#6b7280` | `#e5e7eb` |
| null / lowCoverage | 評価不能 | `#f3f4f6` | `#9ca3af` | `#e5e7eb` |

### 3.6 検証: v1 と v2 の比較（参照実装の実測値）

§5 の実装で実際に計算した結果。**見逃し型 2 件・誤検知型 2 件が正しく反転する。**

| ケース | v1 `score3` | v1 バンド | v2 `EQS` | v2 バンド |
|---|---|---|---|---|
| **A. 1Q 高成長・上方修正・増配なし**<br>EPS +120% / 売上 +45% / OP修正 +25% / 進捗 +12pt / SMA200上 / 8億 | `2/5` | 🔘 **弱(灰)** | **91** | 🟩 **S** |
| **B. 2Q 黒字転換・上方修正・増配なし**<br>前年赤字→黒転 / 売上 +32% / OP修正 +40% / 進捗 +15pt | `2/7` | 🔘 **弱(灰)** | **93** | 🟩 **S** |
| **C. 微増益だが増配**<br>EPS +2% / 売上 +1% / 増配 +12% / SMA200下 / 0.8億 | `7/7` | 🟩 **満点** | **29** | 🔘 **C** |
| **D. 増配だが通期下方修正**<br>EPS +5% / 増配 +11% / **OP修正 -18%** / 進捗 -8pt | `7/7` | 🟩 **満点** | **14** | 🔘 **C** |

ケース D は v1 の欠陥が最も鮮明: **通期予想を 18% 下方修正した銘柄に「パーフェクト (7/7)」の濃緑バッジが付く。**

ケース A の v2 内訳:
`growthEps 22/22, growthSales 18/18, guidanceRev 20/20, guidanceProgress 10/10, shareholder 3/10, trend 10/10, liquidity 8/10` → 91/100

---

## 4. データ契約の差分（テーブル `earnings_quality`）

v1 の列はすべて維持する（破壊的変更なし）。以下を **追加**。

### 4.1 供給側に依頼する追加列

| 列 | 型 | null | 意味 | 優先度 |
|---|---|---|---|---|
| `eps_q_yoy_pct` | numeric | ✓ | **単Q** EPS 前年同期比 %。1Q では累計 YoY と一致 | **必須** |
| `sales_q_yoy_pct` | numeric | ✓ | **単Q** 売上 前年同期比 % | **必須** |
| `eps_turnaround` | text | ✓ | `none`/`to_profit`/`loss_narrow`/`loss_widen`/`to_loss`。% で表現できない符号変化 | **必須** |
| `has_fop_revision` | bool | ✓ | 通期予想を修正したか。`false` = 据置と確認済、`null` = 不明（→ 軸除外） | 高 |
| `eqs` | int | ✓ | v2 スコア 0-100（供給側計算。UI 側計算と二重化して突合可能に） | 高 |
| `eqs_components` | jsonb | ✓ | 軸別内訳 `{growthEps, growthSales, guidanceRev, guidanceProgress, shareholder, trend, liquidity, penalty, coverage}` | 高 |
| `eqs_version` | text | ✓ | `v2.0` 等。閾値変更時のバックテスト再現用 | 高 |
| `rank_in_day_eqs` | int | ✓ | 当日内 `eqs` 降順順位 | 高 |
| `pct_rank_in_day_eqs` | numeric | ✓ | 当日内パーセンタイル（小さいほど上位） | 高 |
| `mcap_oku` | numeric | ✓ | 時価総額（億円）。規模別キャリブレーション用 | 中 |

### 4.2 既存列の扱い

- `score3` / `s_div` / `s_eps` / `s_sales` / `rank_in_day` / `pct_rank_in_day` は**そのまま残す**
  （移行期の並走比較・バックテストの対照群として必要）
- `scale_cat` / `mkt` は v2 でフィルタに使う（v1 では未使用のまま温存されていた）

### 4.3 事後リターン用の新テーブル `earnings_quality_outcome`

R11（フィードバックループ不在）への対処。**これが再発防止の本体。**

```sql
create table earnings_quality_outcome (
  date          date    not null,
  code          text    not null,
  cur_per_type  text    not null,
  base_close    numeric,          -- D+0 終値（引け後開示なら D+1 始値）
  entry_ref     text,             -- 'd0_close' | 'd1_open'
  ret_1d        numeric,          -- 以下すべて entry_ref からの %
  ret_5d        numeric,
  ret_10d       numeric,
  ret_20d       numeric,
  mfe_20d       numeric,          -- 最大含み益 %
  mae_20d       numeric,          -- 最大含み損 %
  filled_at     timestamptz,
  primary key (date, code, cur_per_type)
);
```

- PK は `earnings_quality` と同一 → 素直に join できる
- 埋め込みバッチは `scripts/backfill_mfe_mae.ts`（既存のトレード用 MFE/MAE バックフィル）の
  ロジックをそのまま流用できる。日次で D+20 が確定した行を埋める

---

## 5. 参照実装（純ロジック層 — 依存ゼロ）

実体は本リポジトリに同梱済み:

| ファイル | 内容 |
|---|---|
| **`types/earningsQualityV2.ts`** | 参照実装。移植先でも同じパスに置く |
| `scripts/eqs_cases.ts` | v1 到達域の全列挙 + §3.6 のケーススタディを出力する検証ハーネス（DB 不要） |
| `scripts/backtest_eqs.ts` | 実データで v1 と v2 の決算後成績を比較するバックテスト（要 DB → §12） |

**React にも Supabase にも DOM にも依存しない。移植時は最初にこのファイルを丸ごと持っていく**
（v1 の `types/earningsQuality.ts` と同じ運用）。

検証済み: 本リポジトリの `tsconfig.json` で `tsc --noEmit` / `eslint` ともにエラーなし。
§0 の到達域テーブルと §3.6 の比較表は、`scripts/eqs_cases.ts` の実出力である。

```bash
npx tsx scripts/eqs_cases.ts     # DB 不要。§0 と §3.6 を再現する
```

主要 API:

```ts
export type Turnaround =
  | 'none' | 'to_profit' | 'loss_narrow' | 'loss_widen' | 'to_loss' | 'unknown'

export type EqsInput = {
  cur_per_type: CurPerType
  eps_q_yoy_pct: number | null
  sales_q_yoy_pct: number | null
  eps_turnaround: Turnaround | null
  fop_rev_pct: number | null
  has_fop_revision: boolean | null
  progress_excess_pct: number | null
  div_change_pct: number | null
  above_sma200: boolean | null
  turnover_oku: number | null
}

export type EqsBreakdown = {
  eqs: number | null              // 0-100 (ペナルティ適用済み)
  raw: number | null              // ペナルティ適用前
  axes: Record<EqsAxis, { earned: number; max: number; available: boolean }>
  availablePoints: number
  coverage: number                // = availablePoints
  penalties: { label: string; points: number }[]
  penaltyTotal: number
  lowCoverage: boolean            // coverage < MIN_COVERAGE (50)
}

export function computeEqs(input: EqsInput): EqsBreakdown
export function eqsBand(eqs: number | null): 'S' | 'A' | 'B' | 'C' | 'na'
export function eqsColor(eqs: number | null, lowCoverage?: boolean): { bg; text; border }

// v1 行から v2 入力への後方互換アダプタ（Phase 0 用）
export function toEqsInput(row: V1LikeRow): { input: EqsInput; degraded: boolean }

// 診断用: 増配が無い場合に v1 が到達できる最大 score3 (1Q→2, 2Q/3Q→4)
export function v1MaxWithoutDividendHike(curPerType: CurPerType): number
```

### 5.1 後方互換アダプタ `toEqsInput` — Phase 0 の要

```ts
const isQ1 = row.cur_per_type === '1Q'
const epsQ   = row.eps_q_yoy_pct   ?? (isQ1 ? row.eps_yoy_pct   : null)
const salesQ = row.sales_q_yoy_pct ?? (isQ1 ? row.sales_yoy_pct : null)
const degraded = epsQ == null || salesQ == null
```

**1Q は「累計 = 単Q」なので、`eps_yoy_pct` をそのまま単Q YoY として使ってよい（定義上完全一致）。**
したがって **供給側の改修ゼロで、1Q の構造的過小評価（R2）は即日解消できる。**
2Q/3Q は累計 YoY による近似となり `degraded = true` を返すので、UI で「近似値」と明示する。

---

## 6. UI 設計の差分

### 6.1 テーブル列（v1 §6.3 からの変更）

| # | 変更 | 内容 |
|---|---|---|
| 2 | **置換** | `Score` 列を `score3 (N/max)` → **`EQS 0-100` バッジ + 7 分割ミニバー**。ホバーで軸別内訳ツールチップ（`growthEps 22/22` …）。移行期は旧 `score3` を小さく併記 |
| 7,8 | **拡張** | 売上 / EPS セルを 2 段 → **3 段**（累計 YoY / **単Q YoY** / QoQ）。`degraded` の行は単Q 行を斜体＋灰で「累計代用」 |
| 8 | **追加** | 黒字転換は `%` の代わりに **`黒転` バッジ（濃緑）**、赤字転落は **`赤転`（赤）** |
| 10 | **強調** | 通期 OP: `fop_rev_pct >= +5` に **🔺 上方修正バッジ**、`<= -5` に **🔻 下方修正バッジ（赤・行全体を薄赤）** |
| — | **追加** | **Coverage** 列（`coverage%`、`lowCoverage` は ⚠️）。データ欠損で「参考値」であることを明示 |
| — | **削除** | `Q` 列の 1Q/2Q/3Q ピルは維持するが、**「Q1 は 5/5 が満点」の特例表記・ツールチップは全廃**（v2 では全 Q 同一スケール） |

### 6.2 フィルタ（R12 への対処）

セクターチップに加えて:

- **EQS 下限スライダ**（既定 0、ワンクリックで 65 / 80）
- **上方修正のみ**トグル（`fop_rev_pct >= 5`）
- **売買代金下限**（0.5 / 1 / 3 / 10 億）
- **SMA200 上のみ**トグル
- **Q 種別**（1Q / 2Q / 3Q）
- **lowCoverage を除外**トグル（既定 ON）

フィルタ状態は URL クエリに載せる（`?eqs=65&fop=1&to=3`）。v1 では日付すら URL に無く共有不能だった。

### 6.3 「見逃しレビュー」ビュー `/earnings/review`（新規）

R11 への対処。`earnings_quality` × `earnings_quality_outcome` を join して表示。

1. **バンド別成績表**: S/A/B/C ごとの `ret_5d` / `ret_20d` の平均・中央値・勝率・N
2. **見逃しリスト（False Negative）**: `ret_20d >= +20%` かつ 開示日バンドが C の行を新しい順に
3. **誤検知リスト（False Positive）**: バンド S かつ `ret_20d <= -10%`
4. **v1 vs v2 併走比較**: 同一期間で `score3` バンドと `eqs` バンドの成績を並べる

見逃しリストが常時 0 に近づくことが v2 のゴール。**閾値はここを見て四半期ごとに更新する。**

### 6.4 凡例の更新

```
EQS: ■S 80-100  ■A 65-79  ■B 45-64  ■C 0-44 ｜ ⭐ 当日 Top 1% ｜ 🔺 上方修正 / 🔻 下方修正
｜ 黒転 = 黒字転換 ｜ ⚠️ = Coverage 50% 未満（参考値） ｜ ⏰ 引け後開示 (D+1 寄り対象)
```

---

## 7. 移行計画

供給側（jquants-scanner 等）の改修待ちでブロックしないよう 3 フェーズに分割。**Phase 0 だけで今回の見逃しは解消する。**

### Phase 0 — UI 単独（供給側変更ゼロ・即日可能）

1. `types/earningsQualityV2.ts` を追加（§5、依存ゼロ）
2. `EarningsQualitySection` で `toEqsInput()` → `computeEqs()` をクライアント側計算
3. Score 列を EQS バッジに置換、旧 `score3` は小さく併記
4. §6.2 のフィルタを追加

**効果**: 1Q の構造的過小評価（R2）が完全解消。ガイダンス修正（R3）・マグニチュード（R4）・
需給（R10）が反映。2Q/3Q の単Q 成長は累計 YoY 近似（`degraded`）、黒転（R5）は
`eps_turnaround` 未供給のため `unknown` 扱いで % フォールバック。

### Phase 1 — 供給側の列追加

1. §4.1 の必須 3 列（`eps_q_yoy_pct` / `sales_q_yoy_pct` / `eps_turnaround`）を供給
2. `has_fop_revision` / `eqs*` / `rank_in_day_eqs` / `pct_rank_in_day_eqs` を供給
3. UI はクライアント計算から供給側 `eqs` の読み取りに切替（不一致は開発時にコンソール警告で突合）
4. ⭐ を `pct_rank_in_day_eqs <= 1.0` に付け替え

**効果**: 2Q/3Q の `degraded` 解消（R6）、黒転・赤転の正式対応（R5）、
ソート・順位が EQS ベースになりタイ多発（R8）と Q 混在の不公平（R9）が解消。

### Phase 2 — キャリブレーションと再発防止

1. `earnings_quality_outcome` テーブル + 日次バックフィルバッチ（§4.3）
2. `/earnings/review` ビュー（§6.3）
3. 蓄積データで §3.3 の閾値と §3.4 のペナルティ量をバックテスト・更新（`eqs_version` を上げる）
4. `PEAK_DAY_THRESHOLD = 100` / `TOP_1PCT_THRESHOLD = 1.0` を EQS ベースで再検証
   （v1 の検証値 `end_per_risk 1.509` は R8 によりタイ処理依存で再現性が疑わしいため、**再取得必須**）

### Phase 3（任意） — v1 の撤去

Phase 2 のバックテストで v2 優位が確認できたら、`score3` 系の列・UI 併記を落とす。
それまでは並走させる。

---

## 8. 受け入れ基準（Definition of Done）

| フェーズ | 基準 |
|---|---|
| Phase 0 | ① §3.6 の 4 ケースが表通りのスコアになる単体テストが通る<br>② 過去の集中日スナップショットで、増配なし 1Q 銘柄が「弱(灰)」に固定されないことを目視確認<br>③ 全行が `lowCoverage` にならない（coverage 中央値 >= 70%） |
| Phase 1 | ④ UI 側計算値と供給側 `eqs` の差が全行 ±1 以内<br>⑤ `degraded = true` の行がゼロ |
| Phase 2 | ⑥ 直近 4 四半期で `ret_20d >= +20%` の銘柄のうち、開示日に v2 で C バンドだった割合（見逃し率）が **v1 比で半減**<br>⑦ バンド別 `ret_20d` 平均が S > A > B > C の単調性を満たす<br>⑧ EQS と `ret_20d` の順位相関（IC）が `score3` のそれを上回る |

---

## 9. 診断確認用クエリ（実行環境で 1 回だけ）

§1.2 の導出を実データで裏取りするための SQL。Supabase SQL Editor で実行する。

```sql
-- (a) 当該銘柄の実値を確認（想定: score3 <= 2, s_div = 0, eps_qoq_pct が null）
select date, cur_per_type, score3, s_div, s_eps, s_sales,
       eps_yoy_pct, eps_qoq_pct, sales_yoy_pct, sales_qoq_pct,
       div_change_pct, fop_rev_pct, progress_excess_pct,
       rank_in_day, pct_rank_in_day, events_in_day
from earnings_quality
where code = '2737'
order by date desc
limit 8;

-- (b) R1 の裏取り: 四半期開示で増配が発生する割合（低いはず）
select cur_per_type,
       count(*) as n,
       count(*) filter (where div_change_pct > 0) as div_up,
       round(100.0 * count(*) filter (where div_change_pct > 0) / count(*), 1) as div_up_pct
from earnings_quality
group by cur_per_type
order by cur_per_type;

-- (c) R2 の裏取り: 1Q の score3 分布（増配なし行は 0-2 に張り付くはず）
select cur_per_type, score3, count(*)
from earnings_quality
where coalesce(div_change_pct, 0) <= 0
group by cur_per_type, score3
order by cur_per_type, score3;

-- (d) R3 の裏取り: 通期を下方修正したのに高スコアが付いている行
select date, code, co_name, cur_per_type, score3, fop_rev_pct, div_change_pct
from earnings_quality
where fop_rev_pct <= -5 and score3 >= 5
order by fop_rev_pct asc
limit 50;

-- (e) R8 の裏取り: 集中日における同点行の数
select date, score3, count(*) as tied_rows
from earnings_quality
where events_in_day >= 100
group by date, score3
having count(*) >= 10
order by date desc, score3 desc
limit 50;
```

（d）が 1 行でも返れば R3 は確定。（c）で 1Q の分布が `[0,1,2]` に収まっていれば R2 は確定。

---

## 10. 移植に必要な依存インベントリ（v1 §7 からの差分）

### 10.1 追加でコピーするファイル

```
types/earningsQualityV2.ts                        # 純ロジック（依存ゼロ）— 最初に持っていく
scripts/eqs_cases.ts                              # 依存: types/earningsQualityV2（DB 不要）
scripts/backtest_eqs.ts                           # 依存: types/earningsQualityV2 + @supabase/supabase-js
components/earnings/EqsBadge.tsx                  # 依存: types/earningsQualityV2
components/earnings/EarningsFilters.tsx           # 依存: なし（純 UI）
app/earnings/review/page.tsx                      # 依存: lib/earningsOutcomeFetch
lib/earningsOutcomeFetch.ts                       # 依存: lib/supabase
```

### 10.2 v1 から変更されるファイル

```
components/earnings/EarningsQualitySection.tsx    # Score 列 / 3 段セル / フィルタ
lib/earningsQualityFetch.ts                       # order by eqs desc に変更、outcome join
types/earningsQuality.ts                          # 変更なし（v1 併走のため残置）
```

### 10.3 CSS 変数・共有依存

v1 §7.2 / §7.3 から**追加なし**。EQS の配色は v1 と同じ 16 進値を再利用しているため、
既存テーマ資産で完結する。

---

## 11. 決算後成績の比較バックテスト `scripts/backtest_eqs.ts`

**v1 と v2 の「決算開示後の成績」を実データで突き合わせるスクリプト。**
§8 の受け入れ基準 ⑥⑦⑧ はこのスクリプトの出力で判定する。
`earnings_quality_outcome` テーブル（§4.3）を作る前でも、既存の価格テーブルから直接計算して動く。

### 11.1 実行方法

```bash
# .env.local に NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY があれば追加設定不要
npx tsx scripts/backtest_eqs.ts

# 期間を絞る / 価格ソースを変える / 明細を CSV 出力
npx tsx scripts/backtest_eqs.ts --since 2025-01-01 --hold 20 --csv /tmp/eqs_backtest.csv
npx tsx scripts/backtest_eqs.ts --source signals
```

| オプション | 既定 | 意味 |
|---|---|---|
| `--since YYYY-MM-DD` | 全期間 | 対象開示日の下限 |
| `--source ohlcv\|signals` | `ohlcv` | `ohlcv` = `chart_ohlcv_cache`（OHLC あり／エントリ = D+1 **始値**、MFE/MAE は高値安値ベース）<br>`signals` = `daily_signals`（終値のみ／エントリ = D+1 **終値**、MFE/MAE は終値ベースで保守的） |
| `--hold N` | `20` | 保有本数（営業日） |
| `--csv PATH` | なし | 明細 CSV 出力 |
| `--concurrency N` | `8` | 価格取得の並列数 |

### 11.2 測定方法

- **エントリ**: 開示日 D の**翌営業日 (D+1)**。`/earnings` の「D+1 寄り買い候補」という商品前提に合わせる。
  引け前開示は本来 D 当日に入れられるので、この定義は D 当日の初動を捨てるぶん**保守的**。
  v1 / v2 の双方にまったく同じ定義を適用するため、**比較の公平性は保たれる**。
- **リターン**: エントリ価格に対する D+1 / D+5 / D+10 / D+20（エントリ足を 1 本目と数える）の終値騰落率 %。
- **打ち切りバイアス回避**: 最長ホライズンぶんの足が揃っていない行は集計から除外する
  （直近の開示日が「まだ上がっていないだけ」で不利にならないようにする）。
- **v1 のバンド**は `types/earningsQuality.ts` の `score3Color` と同一境界（満点 / 強 5-6 / 中 3-4 / 弱 0-2、1Q は満点 5）。
- **v2 のバンド**は §3.5（S 80+ / A 65-79 / B 45-64 / C 0-44）。
- v2 のスコアは `toEqsInput()` → `computeEqs()`、つまり **Phase 0 相当（供給側の追加列なし）** で計算する。
  したがって 2Q/3Q は累計 YoY 近似（`degraded`）、黒字転換は `unknown` 扱い。
  **実測値は v2 の実力の下限**であり、Phase 1 の列が入れば改善余地がある。

### 11.3 出力される指標

| 指標 | 見るポイント |
|---|---|
| **バンド別成績表** | バンドごとの N・構成比・平均 D+1/5/10/20・中央値・勝率・平均 MFE/MAE。**単調性**（上位バンドほど高リターン）の自動判定つき。v1 は R1/R2 により単調性が崩れているはず |
| **見逃し率** | D+20 が **+20% 以上**だった銘柄のうち、開示日に最下位バンド（v1「弱」／v2「C」）だった割合。**今回の問題の直接の指標**。受け入れ基準 ⑥ = v1 比で半減 |
| **誤検知率** | D+20 が **-10% 以下**だった銘柄のうち、最上位バンド（v1「満点」／v2「S」）だった割合。§3.6 ケース D 型（増配＋下方修正）が実データで何件あるか |
| **上位 N 選抜の平均リターン** | 各開示日で上位 1/3/5/10 銘柄を選んだ場合の平均 D+20。**実運用に最も近い指標**。全銘柄平均をベースラインとして併記 |
| **情報係数 IC** | 当日内のスコア順位と D+20 リターン順位の Spearman 相関を日ごとに算出し平均。受け入れ基準 ⑧ = v2 IC > v1 IC |
| **1Q 限定の比較** | v1 で「弱(灰)」に落ちた 1Q の割合と、そのうち +20% 以上だった件数。**R2 の実害の直接計測** |
| **反転銘柄リスト** | v1「弱」→ v2「S/A」に反転した銘柄を D+20 降順で表示。トーメンデバイス (2737) がここに出れば診断が実証される |

### 11.4 実行前に確認すること

- **価格カバレッジ**: スクリプトは冒頭で「価格が取れた銘柄 / 全銘柄」を表示する。
  `chart_ohlcv_cache` はチャート表示用のキャッシュであり**全上場銘柄を網羅していない可能性がある**。
  カバレッジが 30% を下回る場合は警告を出すので、`--source signals` を試すこと。
  カバレッジが低いまま解釈すると**生存バイアス**（見られている銘柄＝既に注目された銘柄）が入る。
- **サンプル数**: バンド別の N が二桁に満たない場合、平均リターンの差は統計的に無意味。
  `--since` を外して全期間で回すこと。
- 本スクリプトは**読み取り専用**。テーブルへの書き込みは一切行わない。

---

## 12. 既知の制約・未決事項

- **閾値は暫定値**。§3.3 の段階表は「決算後ドリフトの一般則 + v1 の欠陥を埋める」という設計判断であり、
  **バックテスト未実施**。Phase 2 で必ずキャリブレーションすること。現状は
  「v1 より構造的に妥当」であって「最適」ではない。
- **軸の重み（40/30/10/20）も暫定**。特にガイダンス 30 点は日本株の上方修正効果を重く見た配分で、
  実データで検証されていない。
- **`degraded` 期間の精度低下**: Phase 0 では 2Q/3Q の成長軸が累計 YoY 近似。
  累計は前 Q の good/bad を引きずるため、直近 Q の変化に鈍い。Phase 1 で解消。
- **`eps_turnaround` は供給側でしか判定できない**。UI 側は EPS の絶対値を持たないため、
  Phase 0 では黒転が `unknown` 扱い（% フォールバック）になる。前年赤字銘柄は
  Phase 0 でも取りこぼしうる（§3.6 ケース B は Phase 1 以降で完全対応）。
- **v1 の検証値 `end_per_risk 1.509`（Top 1%）は再現性が疑わしい**（R8）。v2 の ⭐ 閾値は
  Phase 2 で再取得するまで暫定扱い。
- **祝日非考慮 / `isAfterClose` 15:30 固定 / `availableDates` 最大 60 日** — v1 §9 の制約はそのまま残る。
- **`events_in_day` の先頭行依存**も未解消。供給側が行ごとに異なる値を入れると壊れる点は v1 と同じ。
