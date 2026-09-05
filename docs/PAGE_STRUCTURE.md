# ページ構成（2026-09-05 時点）

Market-Dashboard（21 Cloud）の全画面の構成を、実際のコードから起こしたスナップショット。
Next.js 16 App Router / `output: "export"`（静的書き出し）、データは Supabase へクライアント直接接続。

---

## 1. 全体シェル

```
app/layout.tsx  (RootLayout, lang="ja")
└─ <Providers>                       components/Providers.tsx
   ├─ AuthProvider                   contexts/AuthContext.tsx   … Supabase Auth セッション
   └─ DateProvider                   contexts/DateContext.tsx   … 営業日ピッカーの共有状態
      ├─ <NavBar>                    components/NavBar.tsx      … sticky ヘッダー
      └─ {children}                  各ページ
```

- フォント: IBM Plex Mono / Sora / Noto Sans JP を `next/font` で読み込み、`globals.css` の `@theme` に配線。
- metadata: title `Market Dashboard` / description `日本株マーケットコンディション`。

### NavBar

並びは「読む → 選ぶ → 執行する → 振り返る」のワークフロー順。

| 表示ラベル | パス |
|---|---|
| Market | `/` |
| Leaders | `/leaders` |
| Earnings | `/earnings` |
| Daily Watch | `/today` |
| Watchlist | `/watchlist` |
| Trading | `/journal` |
| Notes | `/notes` |
| Guide | `/guide` |

- 左端: ブランド（`21` バッジ + `Cloud`）→ `/` へのリンク。
- 日付ピッカー: `/` と `/today` でのみ表示。過去日を選ぶとナビ枠がアンバー色に変わり「最新に戻る」ボタンが出る。
- 右端: 認証状態。未ログインは「🔒 ログイン」（`LoginModal`）、ログイン中はメール表示 + ログアウト。
  書き込み系テーブルは RLS で authenticated 限定（`supabase/migrations/20260704_secure_user_tables.sql`）。
- `/sectors33` はタブから除外済み（`/` に統合）。ルート自体は既存リンク用に残存。

---

## 2. ルート一覧

| ルート | ファイル | 種別 | 概要 |
|---|---|---|---|
| `/` | `app/page.tsx` | 画面 | Market Dashboard（指数・セクター・ブレッド） |
| `/leaders` | `app/leaders/page.tsx` | 画面 | Market Leaders (Top 50) |
| `/earnings` | `app/earnings/page.tsx` | 画面 | Earnings Quality |
| `/today` | `app/today/page.tsx` | 画面 | Daily Watch（当日スキャナー結果） |
| `/watchlist` | `app/watchlist/page.tsx` | 画面 | Watchlist Journal（TradingView の操作記録・読み取り専用） |
| `/journal` | `app/journal/page.tsx` | 画面 | Trading（3 タブ: Positions / Journal / Risk） |
| `/notes` | `app/notes/page.tsx` | 画面 | Notes（自由メモ、自動保存） |
| `/guide` | `app/guide/page.tsx` | 画面 | Guide（見方・Screens・MC v4 解説・Glossary） |
| `/sectors33` | `app/sectors33/page.tsx` | 画面（別名） | Sector Selection 単体表示。中身は `/` と同じ `SectorSection` |
| `/portfolio` | `app/portfolio/page.tsx` | リダイレクト | → `/journal`（Trading に統合済み） |
| `/debug` | `app/debug/page.tsx` | 開発専用 | Supabase 疎通診断。production ビルドではスタブに置換 |

全ページ共通の骨格: `<main className="min-h-screen p-6">` +
`PageHeader`（タイトル / サブタイトル / 日付 / 再取得ボタン / 右側スロット）。

---

## 3. 各ページの中身

### `/` — Market Dashboard
サブタイトル: 日本株マーケットコンディション。`DateContext` の日付に連動。

1. `PageHeader`（タイトル / 日付 / Refresh）
2. 過去日バナー（最新以外を選択中のときのみ、アンバー）
3. ローディング / データなしカード
4. **TopixChart** `components/market/TopixChart.tsx` — TOPIX ローソク足 + 市場出来高。最初に「指数そのもの」を置く
5. **SectorSection** `components/sectors33/SectorSection.tsx` — Sectors-33 タブを統合。「どのセクターか」を先に見せる
6. **BreadthPanel** `components/market/BreadthPanel.tsx` — 市場全体の内部状態を下段で確認

データ: `market_conditions` から 1 行（最新モードは `order(date desc).limit(1)`、過去日モードは `eq(date)`）。
連打対策に `requestIdRef` で後着レスポンスを破棄。

#### SectorSection の内訳
- ヘッダー行: 見出し（`showHeading`）/ サブタイトル + 最新日 / MA 凡例 / 期間トグル（`RankDeltaPeriodToggle`）/ 表示切替（チャート ⇄ テーブル）
- チャート表示: `SectorChartGallery`（→ `SectorCandleChart`）
- テーブル表示: `SectorSelectionTable`（→ `SectorChangeCells`）
- 下部: 「N営業日の推移（Bars / RRG）」— 既定は折りたたみ（`<details>`）。開くと Bars ⇄ RRG のトグルで
  `SectorBarChart33`（棒グラフ）/ `SectorRRG33`（RRG）を切り替え
- データ: `sector_selection_s33` ほか（`lib/sectorSelectionFetch.ts`, `sectorSelectionHistoryFetch.ts`, `sectorIndexChangeFetch.ts`, `sectorPriceFetch.ts`, `sectorRankDelta.ts`）

#### BreadthPanel の内訳（カード 4 枚）
| カード | チャート |
|---|---|
| Adv / Dec（値上がり比率の推移） | `AdvDecChart` |
| Adv/Dec Ratio（騰落レシオ＝過熱度） | `AdvDecRatioChart` |
| New Highs / Lows | `NhNlDiffChart` |
| % Above SMA | `PctAboveSmaChart` |

---

### `/leaders` — Market Leaders (Top 50)
サブタイトル: 東証クロスセクション top 50 銘柄 — 資金フロー観測。cs_avg=確立度 / 初動(emerging_cs)=加速度の 2 軸。

- ヘッダー右: 日付セレクト（ページ独自。`DateContext` は使わない）/「最新に戻る」/ 銘柄コード・銘柄名の検索ボックス
- 過去日バナー / ErrorBanner / ローディング / データなし
- 本体（View 名はコード内コメント準拠）
  1. **View B**: `SectorConcentration` — セクター集中度
  2. **View A**: `LeadersTable` — Top 50 テーブル（ヒット数 / 連続列込み、検索クエリ適用）
  3. **View D**: `SectorRotationHeatmap` — セクターローテーション（直近 6 ヶ月固定、日付非依存で常時表示）
- データ: `lib/marketLeadersFetch.ts`（`fetchLeadersSnapshot` / `fetchSectorRotation`）

---

### `/earnings` — Earnings Quality
サブタイトル: 決算品質 — 当日決算開示銘柄の品質スコア（0-9、1Q と FY は構造的に最大 7）・翌営業日（D+1）寄り買い候補。

- ヘッダー右: 最新開示日 + **FreshnessBadge**（`classifyFreshness` による鮮度色分け）/ 日付セレクト /「最新に戻る」
- 閑散期バナー: 3・6・9・12 月かつ 6 営業日以上前のときだけ赤バナーで「今日のデータではない」と明示
- 過去日バナー / ErrorBanner / ローディング / データなし
- 本体: `EarningsQualitySection`（スコア列、Q 別ランキング、重複行を最新 Q のみに絞るトグル 等）
- データ: `earnings_quality`（`lib/earningsQualityFetch.ts`）、型は `types/earningsQuality.ts`

---

### `/today` — Daily Watch
`DateContext` に連動。見出し日付は現役スキャナーの最大 date のみから決定（廃止テーブルは参照しない）。

1. `PageHeader` / 過去日バナー（フォールバック日も併記）/ ErrorBanner / ローディング
2. **StructurePivotSection** — 「Structure Pivot」
   押し安値切り上がり（HL）から作る構造の 1st（建玉ライン = HL + 0.618 戻し）/ 2nd（スイングハイ）ヒット。
   本日ヒット銘柄のみ。終了済み（TP2 / Stop）は除外。→ `StructurePivotCard`
3. **EmaSetupsSection** — 「EMA Setups」
   EMA 9 / 21 / 50 に到達し、安値が EMA 直下 0.1ATR 帯で踏みとどまった日。
   ※統計的エッジ無し（勝率 23.6% vs ベースライン 23.1%）と明記した上でのスクリーニング用リスト。→ `EmaSetupCard`

- 複数シグナル重複（同一 code が 2 スキャナー以上に出現）は `multiHitCodes` で黄色強調
- 各カードから `PositionModal` を直接開ける。ウォッチリストへの追加ボタンは廃止し、
  `CopyTickerButton`（`TSE:XXXX` をクリップボードにコピー → TradingView に貼る）に置き換え
- データ: `lib/todayFetch.ts`（`ema` / `struct` / `hotSectors`）

---

### `/watchlist` — Watchlist Journal
サブタイトル: TradingView の操作記録 — 何を拾い、何を落としたか。

**読み取り専用**。追加・編集・削除の導線は無い（編集は TradingView 側で行い、Chrome 拡張が
30 分おきのスナップショットの差分からイベントを復元して Supabase に配信する）。
旧「手入力の候補管理」画面は 1 件も入力されないまま 2026-09-05 に廃止し、`watchlist` テーブルも drop 済み。

- ヘッダー右: **SnapshotFreshnessBadge**（最終記録時刻 + 鮮度）/ 日付セレクト /「最新に戻る」
  - 鮮度は **実時間ベース**（<24h 緑 / 24-48h 黄 / >48h 赤）。記録は土日祝にも走るため、
    `/earnings` の `classifyFreshness`（営業日ベース）は流用せず `types/watchlistJournal.ts` に専用実装。
    拡張は TradingView を開いた時にしか撮らない（＝古い＝異常とは限らない）ので、文言は事実のみ
- **日付ピッカーは `DateContext` を使わない**。イベント日は土日祝を含むので、選択肢は
  `watchlist_events` の `date` の distinct から作る（`/leaders` `/earnings` と同じページ独自セレクト）
- 過去日を選ぶと「差分」だけがその日になり、「現在の状態」「見逃しボード」は常に最新
- 本体 3 セクション
  1. **CurrentStateTable** — 現在の状態。`watchlist_current` を state でグループ化
     （`HOLD → READY → FOCUS → SECOND → SHORT → OTHERS → INBOX → SOLD`）。既定ソートは滞在日数の降順。
     `SOLD`（売却済アーカイブ）は既定で折りたたむ
  2. **DailyDiff** — 選択日の差分。`classifyMove` で **買った / 売った / 昇格・降格 / 区分変更** の 4 分類
     （+ 新規 / 削除）。昇降のラダーは Watch list 内の 5 状態
     `READY > FOCUS > SECOND > OTHERS > INBOX` のみで、`HOLD`（買った）`SOLD`（売った）は先に確定させ、
     `SHORT` が絡む move や `SOLD → OTHERS` は中立の区分変更。
     配信側 `config.yaml` の `state_priority` は解決順であって昇格順ではないので使わない
  3. **MissedBoard** — 見逃しボード（主役）。Watch list に入れたが **その exit の date より前に HOLD に
     なっていない**銘柄を `from_state` 別に集計し、`max_ret_pct` 降順で並べる。READY からの離脱を強調。
     同一 code の exit は畳まず全件出す
- **勝率・PF・期待値は出さない**（サンプル過少。集計は中央値までで、件数を明記）
- `scanner_names` が空の行に「自力発見」ラベルは付けない（スキャナーが拾えなかったのか、
  その日リストを貼らなかったのかが区別できないため）。タグ表示に留め、空は `—`
- データ: `watchlist_events` / `watchlist_current`（`lib/watchlistJournalFetch.ts`）、型は `types/watchlistJournal.ts`

---

### `/journal` — Trading（3 タブ）
サブタイトル: 21 Cloud — ポジション・トレード記録・分析・リスク管理。ヘッダーに「＋ 新規トレード」。

| タブ | 内容 |
|---|---|
| **Positions**（既定） | `PositionsTab` — 保有中ポジション一覧 |
| **Journal** | `JournalStats` → `EquityCurveChart` → `PeriodPerformance` → `ReasonPerformance` → `TagPerformance` → `TradeList`（`sections={['closed']}`、行展開で `ReviewSection`） |
| **Risk** | `RiskTab` — 連敗・リスク設定 |

- モーダル: `PositionModal`（新規／エントリー + 任意のリスク・イグジット）/ `CloseTradeModal` / `EditTradeModal`
- データ: `trades` は `fetchAllPaged` で全件取得（旧 `.limit(500)` を廃止）、`risk_settings` は 1 行
- 補助: `lib/tradeResult.ts` / `lib/mfeMae.ts` / `lib/reviewTags.ts`

---

### `/notes` — Notes
サブタイトル: メモ / 気を付けること。Supabase に自動保存され、全端末で同期。

- 2 ペイン: 左＝メモ一覧（スニペット + 更新日時、ピン留め対応）/ 右＝タイトル + 本文エディタ
- 自動保存（デバウンス）。メモ切替・アンマウント時は `pendingRef` から flush して入力消失を防止
- 旧 localStorage の単一メモは初回アクセス時に `migrateLocalNotes()` で 1 件ずつ吸い上げ
- 削除は `ConfirmDialog`。エラーは `ErrorBanner`
- データ: `notes`（`lib/notesFetch.ts`）

---

### `/guide` — Guide
サブタイトル: ダッシュボードの見方 — Daily Watch（ウォッチリスト）・Trading（記録）・Screens・Market Condition v4。

セクション構成（すべて静的コンテンツ、`<h2>` 見出し + カード）:

1. Daily Watch — ウォッチリスト
2. Trading — トレード記録
3. Screens（`SCREEN_GUIDE_V4` テーブル。採用 2 screens: `DIV_DY_Incr_EpsGr` / `FCT_ValueQuality_CRS`、旧 11 screens は Phase 2.1 で legacy 表示のみ）
4. Market Condition (MC)
5. 8 Factors (v4) — 各ファクターの中身
6. Dynamics (v4) — Velocity / Duration / Shock（3 軸 13 列）
7. Glossary（用語テーブル）

---

### `/sectors33` — Sector Selection（単体表示）
`/` に統合済みだが、既存ブックマーク用に `SectorSection`（`showHeading={false}`）を単体で表示するだけのページ。

### `/portfolio` — リダイレクト
`redirect('/journal')` のみ。Trading への統合の名残。

### `/debug` — Supabase Debug（開発ビルド限定）
`process.env.NODE_ENV === 'production'` のとき実装ごとスタブに置換（公開サイトでの偵察情報化を防ぐ）。
Env 表示 / `market_conditions` 最新行プローブ / anon ロールでのテーブル別 HEAD count。
探査対象: `market_conditions`, `ema_setups`, `structure_pivot_events`, `mc_v4_raw_history`,
`sector_selection_s33`, `sector_index_prices`, `chart_ohlcv_cache`, `trades`,
`watchlist_events`, `watchlist_current`, `risk_settings`。

---

## 4. 共通コンポーネント

| ファイル | 用途 |
|---|---|
| `components/shared/PageHeader.tsx` | 全画面のヘッダー（title / subtitle / date / isLatest / onRefresh / children スロット） |
| `components/shared/ErrorBanner.tsx` | 取得失敗の明示（`onRetry` 付き）。空データと誤認させないため |
| `components/shared/Modal.tsx` | モーダルの土台 |
| `components/shared/ConfirmDialog.tsx` | 削除等の確認 |
| `components/shared/Tooltip.tsx` | 補足説明 |
| `components/auth/LoginModal.tsx` | NavBar からのログイン |
| `components/market/RefreshButton.tsx` | 再取得ボタン |

---

## 5. データソース（Supabase テーブル → 画面）

| テーブル | 使用画面 |
|---|---|
| `market_conditions` | `/`（TopixChart / BreadthPanel）、`/debug` |
| `sector_selection_s33` | `/`, `/sectors33` |
| `earnings_quality` | `/earnings` |
| `market_leaders` | `/leaders`（Top 50 スナップショット・セクターローテーションとも同一テーブル） |
| `ema_setups` / `structure_pivot_events` | `/today`（`lib/todayFetch.ts`） |
| `trades` / `risk_settings` | `/journal` |
| `watchlist_events` | `/watchlist`（差分・見逃しボード・鮮度判定） |
| `watchlist_current` | `/watchlist`（現在の状態） |
| `notes` | `/notes` |
| `chart_ohlcv_cache` | `components/journal/TradeChart.tsx`（`lib/chartData.ts`） |

---

## 6. 現在どのページからも到達しないコンポーネント

`components/chart/` `components/signals/` `components/structurePivot/` `components/watchlist/` は
2026-09-05 の Watchlist Journal 移行で削除しました（いずれもルートから到達不能で、`tsconfig.json` の
`include` が `**/*.tsx` のため型チェックだけが走り続けている状態でした）。道連れに未参照となった
`lib/chartFetch.ts` `lib/cockpit.ts` `lib/structurePivotDraw.ts` `lib/structurePivotFetch.ts`
`types/signals.ts` `types/structurePivot.ts`、および `types/portfolio.ts` の `WatchlistItem` 型も削除済み。

残っている到達不能ファイル（今回の対象外・別途判断）:

| ファイル | 備考 |
|---|---|
| `components/market/IndexCard.tsx` / `IndexChart.tsx` / `ScoreGauge.tsx` / `EntryGateCard.tsx` / `RefreshButton.tsx` | MC v4 廃止時に画面から外れた |
| `components/portfolio/HistoryTab.tsx` | Trading の 3 タブ統合時に外れた |

> README の「ディレクトリ構成」にある `components/vcp/` と `components/sectors/` は存在しません
> （`sectors33/` に統合）。

---

## 7. 画面遷移図

```
NavBar ──┬─ /            Market ─── TopixChart / SectorSection / BreadthPanel
         ├─ /leaders     Market Leaders (Top 50)
         ├─ /earnings    Earnings Quality
         ├─ /today       Daily Watch ── Structure Pivot / EMA Setups
         │                 └─ カードから TSE:XXXX コピー・PositionModal
         ├─ /watchlist   Watchlist Journal ── 現在の状態 / 差分 / 見逃しボード（読み取り専用）
         ├─ /journal     Trading [Positions | Journal | Risk]
         ├─ /notes       Notes
         └─ /guide       Guide

（ナビ外）
  /sectors33  → SectorSection 単体（/ に統合済み・リンク互換用）
  /portfolio  → redirect → /journal
  /debug      → 開発ビルドのみ
```
