# Handoff: Sectors-33 & Market — ロジックとコード一式

Claude Code への引き継ぎ用ドキュメント。
**Market Dashboard**（トップ画面 `/`）と **Sector Selection (TOPIX-33)**（`/sectors33`）の
2 機能について、データソース・スコアリングロジック・UI コンポーネント構成・主要コードを 1 枚にまとめたもの。

- Stack: Next.js 16 (App Router, `output: "export"`) / React 19 / Tailwind v4 / Supabase JS v2（anon-key, クライアント直接）/ recharts + lightweight-charts
- DB: Supabase。**スコアは全て DB 側で事前集計**され、フロントは読み取り＋表示のみ（RPC/Realtime 不使用）。
- Supabase クライアント: `lib/supabase.ts`（`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`）

---

## 1. Market Dashboard (`/`)

日本株のマーケットコンディションを 1 画面で俯瞰。MC v4 スコア（0-100）を中心に、指数・ダイナミクス・ブレッドスを表示。

### 1.1 データソース

- テーブル: **`market_conditions`**（PK: `date`、1 営業日 1 行）
- 型定義: `types/market.ts`（`MarketConditions`）
- フェッチ: `app/page.tsx` 内で直接 `supabase.from('market_conditions')`
  - **最新モード**: `mc_v4 IS NOT NULL` の直近行を優先（当日行は v4 未集計の場合があるため）。
    どの行にも v4 が無いブートストラップ期は素の最新行にフォールバック。
  - **過去日モード**: `DateContext`（`contexts/DateContext`）の `selectedDate` で `eq('date', …)`。
  - 取得は `.maybeSingle()`。

### 1.2 スコア体系（`types/market.ts` の列が示す通り）

DB に複数バージョンが共存。**画面で使うのは v4 が主**。

| バージョン | 列 | 内容 |
|---|---|---|
| v1（12要因, レガシー） | `f01_*`〜`f12_*` (boolean), `scorecard_regime` | 型のみ保持、画面表示は最小限 |
| v3（7要因 0-3点） | `mc_score_v3`, `mc_regime_v3`, `f1_idx_momentum`〜`f7_idx_52wh_distance` | 型のみ参照（現状未描画） |
| **v4（8要因 0-100）** | `mc_v4`, `mc_regime_v4`, `mc_v4_m1`…`mc_v4_s3` | **現行メイン** |

#### MC v4 — 8 ファクター（パーセンタイルランク 0-100、加重平均）

重みは Python 側 `mc_config/mc_v4_config.py` とミラー（`components/market/FactorGrid.tsx`）:

| key | label | weight |
|---|---|---|
| `mc_v4_m1` | M1 Short MOM（短期モメンタム） | 20% |
| `mc_v4_m2` | M2 Mid Trend（中期トレンド） | 10% |
| `mc_v4_m3` | M3 EMA Slope | 20% |
| `mc_v4_c1` | C1 Long Confirm（長期確認） | 5% |
| `mc_v4_b1` | B1 Breadth（ブレッドス） | 15% |
| `mc_v4_s1` | S1 Flow（資金フロー） | 15% |
| `mc_v4_s2` | S2 IV（インプライドボラ） | 10% |
| `mc_v4_s3` | S3 Short/Basis（空売り/ベーシス） | 5% |

- `mc_v4_valid_weight_pct`: 有効ファクターの重み合計（欠損ファクターがあると 100% 未満）。
- **regime 境界（色階調も共通）**: `≥80 strong_bull` / `≥60 bull` / `≥40 neutral` / `≥20 bear` / `<20 strong_bear`
  - 色: `#639922 / #97C459 / #B4B2A9 / #F09595 / #E24B4A`
- `mc_divergence_flag_v4 = 1` で Divergence 警告バッジ表示。

#### Sub-regimes（v4 とは別系統）

- `market_regime`: `bull | neutral | bear`（Index Trend）
- `breadth_regime`: `strong | normal | weak`（Market Breadth）

#### MC v4 Dynamics（3 軸）

- **Velocity**: `mc_v4_delta_1d / _5d / _10d`, `mc_v4_volatility_20d`
- **Duration**: `regime_run_length`（現 regime 継続日数）, `days_since_regime_shift`, `regime_shift_event`（=1 で本日シフト）
- **Shock**: `panic_flag_{10,15,20}`, `relief_flag_{10,15,20}` → いずれか ON で `Panic` / `Relief`、無ければ `Calm`

### 1.3 Breadth 指標（`BreadthPanel`）

- Adv/Dec: `advances`, `declines`, `advance_pct`
- Adv/Dec Ratio: `ad_ratio_10`, `ad_ratio_25`（**<70 売られ過ぎ / >120 買われ過ぎ** で赤）
- New Highs/Lows: `new_highs`, `new_lows`, `nh_nl_diff`
- % Above SMA: `pct_above_sma50`, `pct_above_sma200`（50% を境に緑/赤）

### 1.4 指数カード（`IndexCard`、TOPIX / Nikkei225 / Growth250）

- 列プレフィックス `topix_ / nikkei_ / growth_` + `price, chg_1w, chg_1m, chg_ytd, chg_1y, pct_52wh, above_sma50, above_sma200`
- `IndexCard` は `prefix` で動的にキーを生成（`p('price')` 等）。

### 1.5 時系列チャート（`lib/marketChartData.ts`）

`market_conditions` から期間取得（デフォルト 180 日）。null は事前除外（`Number(null)===0` の罠回避）:

- `fetchMcScoreTimeSeries` → `mc_v4`（v4 未集計日は除外）
- `fetchAdvDecRatioTimeSeries` → `ad_ratio_10`
- `fetchNhNlDiffTimeSeries` → `nh_nl_diff`
- `fetchPctAboveSmaTimeSeries` → `pct_above_sma50` / `pct_above_sma200`

### 1.6 ファイル構成（Market）

```
app/page.tsx                       # ページ本体（フェッチ + レイアウト）
contexts/DateContext.tsx           # 日付ピッカー（最新 / 過去日スナップショット）
types/market.ts                    # MarketConditions 型
lib/marketChartData.ts             # 時系列フェッチ
components/market/
  ScoreGauge.tsx                   # 半円ゲージ + regime バッジ + sub-regimes + Divergence
  FactorGrid.tsx                   # 8 ファクター スコアバー（重み表示）
  DynamicsCards.tsx                # Velocity / Duration / Shock の 3 カード
  BreadthPanel.tsx                 # Adv/Dec, Ratio, NH/NL, %>SMA + 各ミニチャート
  IndexCard.tsx                    # 指数カード（数値 + IndexChart）
  IndexChart.tsx / TimeSeriesChart.tsx / McScoreChart.tsx
  AdvDecRatioChart.tsx / NhNlDiffChart.tsx / PctAboveSmaChart.tsx
  ScoreGauge / RefreshButton.tsx
```

---

## 2. Sector Selection — TOPIX-33 (`/sectors33`)

「今どこのセクターを買うか」を 33 業種の **composite_score（0-100）** でランキング。

### 2.1 データソース

- テーブル: **`sector_selection_s33`**（PK: `date` + `sector_name_s33`、1 日あたり最大 33 行）
- 型定義: `types/sectorSelection.ts`（`SectorSelectionRow`）
- フェッチ:
  - 最新ランキング: `lib/sectorSelectionFetch.ts#fetchLatestSectorSelection`
    - `date desc, composite_score desc` で直近 ~50 行 → 先頭 row の date でフィルタ（MAX(date) の往復回避）。
  - 履歴: `lib/sectorSelectionHistoryFetch.ts#fetchSectorSelectionHistory(days)`
    - Phase 1: 直近 N ユニーク日付を発見（`limit(days*40)`）
    - Phase 2: その範囲を一括取得し `bySector[name][date]` に整形
    - `sectorsRanked` = 最新日の composite_score 降順
    - ページからは **63 営業日** で呼び出し（`app/sectors33/page.tsx`）

### 2.2 composite_score ロジック（DB 側、フロントはミラー）

`types/sectorSelection.ts` の `COMPONENT_WEIGHTS`（**DB の式と一致必須**）:

| component | label | 重み | 意味 |
|---|---|---|---|
| `component_rs` | RS | 0.30 | RS21d 相対強度ランク (0-100) |
| `component_acc` | Acc | 0.15 | RS加速度ランク（50=中立, 21d-63d） |
| `component_breadth` | Brd | 0.25 | セクター内の上昇銘柄比率 (0-100) |
| `component_flow` | Flow | 0.15 | 機関投資家ネット買いランク (0-100) |
| `component_short` | Sht | 0.15 | 空売り過熱の逆 — 踏み上げ余地 (0-100) |

`composite_score = Σ(component × weight)`。各 component は 0-100。

- **モメンタム分類** `sector_momentum_s33`: `leading`(🟢) / `neutral`(⚪) / `lagging`(🔴)
- **信頼度** `confidence_low = 1`: 銘柄数 < 10 でノイズ大（テーブルで除外トグル可）
- **色しきい値**:
  - composite ヒートマップ（`compositeColor`）: `≥60 緑 / ≥30 黄 / <30 赤`
  - component バー（`componentColor`）: `≥70 緑 / ≥40 黄 / <40 赤`

ドリルダウンで使う raw 列: `sector_rs_21d_s33, sector_rs_63d_s33, sector_rs_acc_s33, sector_er_21d_s33,
sector_pct_above_50ma_s33, sector_pct_above_200ma_s33, sector_pct_near_52w_high_s33,
sector_pct_vcs80_s33, sector_pct_ma_stack_s33, sector_pct_positive_momentum_s33,
sector_vcs_median_s33, sector_inst_net_flow_s33(_rank), sector_short_va_ratio_5d_s33,
sector_short_sell_ratio_bd_s33, sector_stock_count_s33`

### 2.3 UI（3 ビュー）

1. **SectorSelectionTable**（`components/sectors33/SectorSelectionTable.tsx`）
   - ランキング表。列: `# / Sector / Score / Trend / RS / Acc / Brd / Flow / Sht / N`
   - 全列ソート可（rank/名前は昇順デフォルト、他は降順）。行クリックで **DrilldownRow** 展開（5 component バー × 重み注記 + raw stats）。
   - 信頼度低除外チェックボックス。
2. **SectorBarChart33**（`bar` ビュー）
   - セクターごとカードに composite_score の N 日推移ミニ棒グラフ。直近 5 日は不透明度 1、それ以前 0.5。
   - 並び替え: 現在スコア / 21日変化(Δ)。色: `≥70 緑 / ≥40 黄 / <40 赤`。
3. **SectorRRG33**（`rrg` ビュー）
   - 自作 SVG の Relative Rotation Graph。
   - **X = `component_rs`（RS 0-100）/ Y = `sector_rs_acc_s33`（RS加速, 50=中立）**、中心 50。
   - 4 象限: Leading(🟢 RS↑/加速↑) / Improving(🔵 RS↓/加速↑) / Weakening(🟡 RS↑/加速↓) / Lagging(🔴 RS↓/加速↓)。
   - 軌跡（trail）: 上位6/12/全て/なし × 期間 5/10/21 営業日。

### 2.4 ファイル構成（Sectors-33）

```
app/sectors33/page.tsx                      # ページ（latest + history(63d) を Promise.all）
types/sectorSelection.ts                    # 型 + 重み + 色関数 + メタ
lib/sectorSelectionFetch.ts                 # 最新ランキング
lib/sectorSelectionHistoryFetch.ts          # N 営業日履歴（2-phase）
components/sectors33/
  SectorSelectionTable.tsx                  # ランキング表 + ドリルダウン
  SectorBarChart33.tsx                      # composite 推移ミニ棒グラフ
  SectorRRG33.tsx                           # RRG（自作 SVG）
components/shared/Tooltip.tsx               # ヘッダ/ラベルのツールチップ
```

> 注: `/sectors`（無印, `components/sectors/`）は別系統の旧セクター RS/RRG 画面。本件の対象は **`sectors33`**。

---

## 3. 共通メモ / 引き継ぎ時の注意

- **スコアの「計算」は全て DB 側**（Python パイプライン: `mc_config/mc_v4_config.py` 等）。
  フロントの重み・しきい値・色は **DB ロジックのミラー**なので、片方を変えたら両方合わせること。
  - Market: `components/market/FactorGrid.tsx` の `V4_FACTORS` weight
  - Sectors-33: `types/sectorSelection.ts` の `COMPONENT_WEIGHTS`
- regime 色（`#639922 / #97C459 / #B4B2A9 / #F09595 / #E24B4A`）は Market 全体で共通。
- null 安全: 数値は `Number(null)===0` を避けるため fetch 段階で null 除外、表示は `—` / `--`。
- `output: "export"`（静的ビルド）。サーバーアクション無し、全データは anon-key でクライアント取得。
- README のスキーマ監査メモ: v1/v3 系の列（`f01_*`〜, `mc_score_v1/v3`, `f1_*`〜`f7_*`）は温存中の削除候補。

### 主要テーブル列の早見

- `market_conditions`: 詳細は `types/market.ts`（指数 3 系統 / breadth / v1-v4 スコア / dynamics）
- `sector_selection_s33`: 詳細は `types/sectorSelection.ts`（composite + 5 component + raw 指標）
</content>
</invoke>
