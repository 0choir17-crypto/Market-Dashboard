# Earnings Quality 画面 — 設計書（移植用）

Market-Dashboard の `/earnings`（決算品質スキャナー）の設計を、**別リポジトリへそのまま持ち出せる粒度**でまとめたもの。
データ供給側（jquants-scanner 等）と UI 側の契約、スコア定義、表示規則、移植手順を含む。

- 対象コミット: `claude/earings-design-extraction-m2ia1a`
- 実装ファイル: `types/earningsQuality.ts` / `lib/earningsQualityFetch.ts` / `components/earnings/EarningsQualitySection.tsx` / `app/earnings/page.tsx`
- スタック前提: Next.js App Router (client component) + React 19 + Tailwind v4 + Supabase JS v2（anon key・クライアント直結、RPC/Realtime 未使用）

---

## 1. 画面の目的

**当日決算開示銘柄を「品質スコア」で順位付けし、翌営業日（D+1）寄り買い候補を絞り込む。**

- 対象は **1Q / 2Q / 3Q のみ**。本決算（通期）は除外。
- したがって **3・6・9・12 月は構造的な閑散期**で、新規開示がほぼ発生しない。
  テーブルには「直近開示日」のデータが残り続けるため、UI 側で鮮度を明示して誤読を防ぐことが設計要件。
- 供給は毎営業日 18:23 JST にスキャナーから push される想定（UI は読み取り専用）。

---

## 2. データ契約（Supabase テーブル `earnings_quality`）

主キー: **`(date, code, cur_per_type)`**

| 列 | 型 | null | 意味 |
|---|---|---|---|
| `date` | date (`YYYY-MM-DD`) | ✗ | 開示日 |
| `code` | text | ✗ | 銘柄コード（東証） |
| `co_name` | text | ✓ | 銘柄名 |
| `sector_s33` | text | ✓ | TOPIX-33 業種 |
| `scale_cat` | text | ✓ | 規模区分（現 UI 未使用・温存） |
| `mkt` | text | ✓ | 市場区分（現 UI 未使用・温存） |
| `disc_time` | text (`HH:MM`) | ✓ | 開示時刻 |
| `cur_per_type` | text (`1Q`/`2Q`/`3Q`) | ✗ | 四半期区分 |
| `score3` | int | ✗ | 総合スコア = `s_div + s_eps + s_sales` |
| `s_div` | int (0/2/3) | ✗ | 増配サブスコア |
| `s_eps` | int (0-2) | ✗ | EPS サブスコア |
| `s_sales` | int (0-2) | ✗ | 売上サブスコア |
| `verdict` | text | ✓ | スキャナー側の短評 |
| `div_change_pct` | numeric | ✓ | 同 FY 前回 `FDivAnn` からの増配率 % |
| `eps_yoy_pct` | numeric | ✓ | EPS 前年同期（累計）比 % |
| `eps_qoq_pct` | numeric | ✓ | EPS 前期単 Q 比 %（**1Q は常に null**） |
| `sales_yoy_pct` | numeric | ✓ | 売上 前年同期（累計）比 % |
| `sales_qoq_pct` | numeric | ✓ | 売上 前期単 Q 比 %（**1Q は常に null**） |
| `fop_rev_pct` | numeric | ✓ | 通期予想 OP の修正率 %（同 FY 前回 `FOP` 比） |
| `progress_excess_pct` | numeric | ✓ | 実進捗 − 期待ペース（pt） |
| `close` | numeric | ✓ | 終値 |
| `turnover_oku` | numeric | ✓ | 20 日平均売買代金（億円） |
| `above_sma200` | bool | ✓ | 200 日 SMA 上か |
| `rank_in_day` | int | ✓ | 当日内 `score3` 降順順位（1 = トップ） |
| `pct_rank_in_day` | numeric | ✓ | 当日内パーセンタイル順位（小さいほど上位、単位 %） |
| `events_in_day` | int | ✓ | その日の総開示件数（**同日全行に同値**が入る前提） |
| `updated_at` | timestamptz | ✓ | 供給側の更新時刻 |

### 契約上の注意

- UI は `select('*')` で取得する。**供給側で列が増減しても画面が落ちない**ことを優先した設計（スキーマ増減耐性）。
- `events_in_day` は同日同値である前提で **先頭行から 1 つだけ読む**。行ごとに違う値を入れないこと。
- `pct_rank_in_day` は「上位ほど小さい」向き。`<= 1.0` を Top 1% として扱う。
- **RLS**: 閲覧は anon 可、書き込みは供給側のみ（サービスロール）という前提。UI は読み取りのみ。

---

## 3. スコア仕様（`score3`）

```
score3 = s_div + s_eps + s_sales

s_div   (0 / 2 / 3): div_change_pct > 0 で +2、さらに >= 10 で +1
s_eps   (0 / 1 / 2): eps_yoy_pct   > 0 で +1、eps_qoq_pct   > 0 で +1
s_sales (0 / 1 / 2): sales_yoy_pct > 0 で +1、sales_qoq_pct > 0 で +1
```

- 構造的最大値は **7**。
- ただし **1Q は前 Q（同 FY）が存在せず QoQ が計算不能**なので、実質最大は **5**。
  UI では 1Q を `5/5` と表記し、`7` 満点と同じ「満点色」で扱う（1Q だけ永遠に満点が出ない、という誤解を防ぐため）。

```ts
export const SCORE3_MAX = 7
export const SCORE3_MAX_Q1 = 5

export function maxScoreFor(curPerType: CurPerType): number {
  return curPerType === '1Q' ? SCORE3_MAX_Q1 : SCORE3_MAX
}
```

### 検証由来の閾値（そのまま移植すること）

| 定数 | 値 | 根拠 |
|---|---|---|
| `PEAK_DAY_THRESHOLD` | `100` | `events_in_day >= 100` の集中日は、検証で上位銘柄の質が高い |
| `TOP_1PCT_THRESHOLD` | `1.0` | 当日 Top 1%（`pct_rank_in_day <= 1.0`）は検証で `end_per_risk` 1.509 |

---

## 4. 表示規則（純ロジック層 — 依存ゼロ・そのままコピー可）

`types/earningsQuality.ts` は React にも Supabase にも依存しない。**移植時は最初にこのファイルを丸ごと持っていく。**

### 4.1 スコア色 `score3Color(score, curPerType)`

| 条件 | bg | text | border | 意味 |
|---|---|---|---|---|
| `score === max`（7 または 1Q の 5） | `#86efac` | `#14532d` | `#16a34a` | 満点 |
| `score >= 5` | `#dcfce7` | `#15803d` | `#86efac` | 強 |
| `score >= 3` | `#fef3c7` | `#92400e` | `#fde68a` | 中 |
| それ以外 (0-2) | `#f3f4f6` | `#6b7280` | `#e5e7eb` | 弱 |
| null / 非有限 | `#f3f4f6` | `#9ca3af` | `#e5e7eb` | 欠損 |

### 4.2 増減率色 `pctColor(v)`

増配率・YoY・QoQ・OP 修正率・進捗超過に**共通**で使う。

| 条件 | 色 |
|---|---|
| `v >= 10` | `#15803d`（濃緑） |
| `v > 0` | `#16a34a`（緑） |
| `v < 0` | `#dc2626`（赤） |
| `v === 0` | `#6b7280`（灰） |
| null / 非有限 | `#9ca3af` |

### 4.3 引け後判定 `isAfterClose(discTime)`

`HH:MM` を先頭一致でパースし、**15:30 以降を引け後**とみなす → 翌営業日 D+1 寄り対象。
（東証現物の大引けは 2024-11-05 から 15:30。それ以前は 15:00 だが、現行データ範囲では 15:30 固定で扱う。）

### 4.4 鮮度判定 `classifyFreshness(latestIso, now)`

閑散期に「今日のデータ」と誤読されるのを防ぐための中核ロジック。

- `businessDaysBetween(fromIso, to)` — **土日のみスキップ**する営業日差（祝日は非考慮の近似）。
- `isQuietMonth(d)` — 3 / 6 / 9 / 12 月（0-indexed で `2,5,8,11`）を閑散期とみなす。

| 営業日差 `bdays` | level | label | icon | 配色 | hint |
|---|---|---|---|---|---|
| `<= 0` | `live` | 本日 (LIVE) | 🟢 | 緑 | 本日の開示データ |
| `1` | `fresh` | 1営業日前 | 🟢 | 緑 | 前営業日の開示データ |
| `2-5` | `stale` | N営業日前 | 🟡 | 琥珀 | 開示が無い日が続いています |
| `>= 6` | `old` | N営業日前 | 🔴 | 赤 | 閑散期なら「決算閑散期 (3/6/9/12 月) のため新規開示が無い時期です」／そうでなければ「長期間新規開示がありません — データ供給を確認してください」 |

**`old` かつ `inQuietMonth` のときだけ**、ページ上部に赤の説明バナーを出す（`showQuietBanner`）。

---

## 5. データ取得層 `lib/earningsQualityFetch.ts`

```ts
export type EarningsQualitySnapshot = {
  latestDate: string | null
  rows: EarningsQualityRow[]
  eventsInDay: number
  availableDates: string[]
  error?: string | null   // fetch 失敗時のメッセージ（成功時 null）
}
```

### 5.1 `fetchEarningsQualitySnapshot(date?)`

1. `date` 未指定なら `fetchLatestDate()`（`date desc limit 1`）で直近開示日を解決。並行して `fetchAvailableDates()`。
2. 対象日で `select('*').eq('date', targetDate).order('score3', desc).order('rank_in_day', asc)`。
3. `eventsInDay` は `rows[0]?.events_in_day ?? rows.length`。
4. エラー時も **例外を投げず** `rows: []` + `error: message` を返す（画面は ErrorBanner を出して継続）。

### 5.2 `fetchAvailableDates(maxDates = 60)` — ページングが必要な理由

集中日は 1 日に数百行入る。Supabase は **1 リクエスト 1000 行で打ち切る**ため、行数 limit だと数日分しかカバーできず日付ピッカーが埋まらない。
そこで **PK と同じ安定順序**（`date desc, code asc, cur_per_type asc`）で `.range()` ページングし、distinct な日付が `maxDates` 件集まった時点で打ち切る。

### 5.3 `fetchPeakDays(threshold = 100, limit = 10)`

`events_in_day >= threshold` の日を新しい順に distinct 化して返す（footer 用途。現行 UI からは未使用だが契約として残す）。

---

## 6. UI 設計

### 6.1 ページ `app/earnings/page.tsx`（client component）

- タイトル: `Earnings Quality` / サブタイトル: 「決算品質 — 当日決算開示銘柄の品質スコア（0-7）・翌営業日（D+1）寄り買い候補 ※ 1Q-3Q のみ対象（本決算除外）／3・6・9・12月は構造的閑散期」
- ヘッダ右: `最新開示日` + **鮮度バッジ** + **日付セレクト**（`availableDates`、先頭に「（最新）」）+ 最新でないときのみ「最新に戻る」ボタン。
- **競合ガード**: 日付を高速に切り替えたとき、古い応答が新しい表示を上書きしないよう `requestIdRef` でリクエスト ID を比較し、古い応答は破棄する。
- 状態別の表示:
  - 閑散期 + 6営業日以上前 → 赤バナー
  - 最新以外を表示中 → 琥珀バナー「{date} のスナップショットを表示中」
  - `snapshot.error` → `ErrorBanner`（再試行つき）
  - 初回ロード中（行 0 件） → 「読み込み中…」カード
  - 完了・0 件 → 「データが見つかりません」＋ テーブル名と供給時刻の案内
- **再取得中も直前の内容を出し続ける**（全面ローディングは初回のみ）。

### 6.2 セクション `components/earnings/EarningsQualitySection.tsx`

構成: サマリカード（開示件数）→ 集中日バナー → セクターフィルタ → ランキングテーブル → 凡例。

- **集中日バナー**: `eventsInDay >= 100` のとき紫バナー「🔥 集中日 (ピーク) — 開示 N 件 ≥ 100 — 検証で Top の質が高い日」。
- **フィルタ**: `sector_s33` のマルチセレクトチップのみ（`ja` ロケールでソート、選択時のみ「クリア」表示）。
- **ソート**: 全 `SortKey` で昇降トグル。既定は `score3` 降順。
  - 文字列キー（`co_name` / `sector_s33`）は `localeCompare(..., 'ja')`。
  - 数値の欠損は `-Infinity`（`rank_in_day` のみ `+Infinity`）に寄せる。
  - **同値の tie-break は必ず `rank_in_day` 昇順**。
  - 初回クリック時の向き: `rank_in_day` / `co_name` / `sector_s33` は `asc`、それ以外は `desc`。
- **行キー**: `${code}-${cur_per_type}`。
- **満点行**は背景を `bg-emerald-50/60` でハイライト。

### 6.3 テーブル列定義（左から）

| # | 見出し | ソート | 揃え | 内容 / ツールチップ |
|---|---|---|---|---|
| 1 | 順位 | `rank_in_day` | 中央 | `rank_in_day`。Top 1% は ⭐（title: 当日 Top 1% (検証 end_per_risk 1.509)） |
| 2 | Score | `score3` | 中央 | `N/max` のピル型バッジ。満点は title「パーフェクト (7/7)」/「Q1 構造的最高 (5/5)」 |
| 3 | Verdict | — | 左 | `verdict` |
| 4 | Code | — | 左 | `code` → **TradingView** リンク |
| 5 | 銘柄名 | `co_name` | 左 | `co_name` → **四季報** リンク（`max-w-[200px] truncate`） |
| 6 | セクター | `sector_s33` | 左 | `sector_s33` |
| 7 | 売上 YoY/QoQ | `sales_yoy_pct` | 右 | 2 段（上 YoY / 下 QoQ）。1Q かつ QoQ 欠損は灰色の `Q1` 表記 |
| 8 | EPS YoY/QoQ | `eps_yoy_pct` | 右 | 同上 |
| 9 | 増配率 | `div_change_pct` | 右 | `+N.N%`、`>= 10` は太字 + ★ |
| 10 | 通期 OP | `fop_rev_pct` | 右 | 符号付き % |
| 11 | 進捗超過 | `progress_excess_pct` | 右 | `先行 +N.Npt` / `遅延 -N.Npt` / `0pt` |
| 12 | 終値 | — | 右 | `close`（小数 0 桁） |
| 13 | 売買代金 | `turnover_oku` | 右 | `N.N億` |
| 14 | SMA200 | — | 中央 | true=✓（positive）/ false=✗（negative）/ null=— |
| 15 | 開示時刻 | — | 中央 | `HH:MM`。引け後は琥珀の太字 + ⏰（title: 引け後開示 → 翌営業日 (D+1) 寄り対象） |
| 16 | Q | — | 中央 | `1Q`=青 / `2Q`=紫 / `3Q`=橙 のピル |

- テーブルは `min-w-[1500px]` + 親 `overflow-x-auto`（横スクロール前提）。
- 数値セルは全て `font-mono tabular-nums`、右揃え。欠損は em ダッシュ `—`。
- 0 件時: 「条件に合う銘柄はありません — フィルタを緩めてください」。

### 6.4 凡例（テーブル下部）

`満点(#86efac)` / `強 5-6(#dcfce7)` / `中 3-4(#fef3c7)` / `弱 0-2(#f3f4f6)` ｜ ⭐ 当日 Top 1% ｜ ⏰ 引け後開示 (D+1 寄り対象)

---

## 7. 移植に必要な依存インベントリ

### 7.1 コピーするファイル（4 点）

```
types/earningsQuality.ts                      # 純ロジック（依存ゼロ）
lib/earningsQualityFetch.ts                   # 依存: lib/supabase
components/earnings/EarningsQualitySection.tsx# 依存: lib/format, lib/tickerLinks, components/shared/Tooltip
app/earnings/page.tsx                         # 依存: components/shared/PageHeader, ErrorBanner
```

### 7.2 共有依存（移植先に無ければ用意する）

| 依存 | 必要な API | 代替の容易さ |
|---|---|---|
| `lib/supabase` | `export const supabase = createClient(url, anonKey)` | 容易（env 2 本） |
| `lib/format` | `formatPct(v, { digits, sign })` — null は `—`、`sign` で正値に `+` | 容易（数行） |
| `lib/tickerLinks` | `tradingViewUrl(code)` = `https://jp.tradingview.com/chart/?symbol=TSE:{code}`<br>`shikihoUrl(code)` = `https://shikiho.toyokeizai.net/stocks/{code}` | 容易 |
| `components/shared/Tooltip` | `<Tooltip content="...">{children}</Tooltip>`（portal でホバー表示） | 中（`title` 属性で代替可） |
| `components/shared/PageHeader` | `title` / `subtitle` / `onRefresh` / `refreshing` / `children` | 中（素の `<header>` で代替可） |
| `components/shared/ErrorBanner` | `detail` / `message` / `onRetry` | 容易 |

### 7.3 CSS 変数（`app/globals.css` の `:root`）

コンポーネントが参照するもの。移植先に無ければ定義するか、生の色に置換する。

```css
--bg-primary: #fdf6e3;   --bg-card: #fdf6e3;   --bg-card-hover: #f5ecd5;
--border: #e6dcc0;       --border-subtle: #efe6cf;
--text-primary: #1a1d23; --text-secondary: #6b7280; --text-muted: #9ca3af;
--positive: #16a34a;     --negative: #dc2626;  --neutral-color: #92400e;
--accent: #1d4ed8;
```

> 注: スコアバッジ・鮮度バッジ・凡例の色は **CSS 変数ではなくハードコードされた 16 進値**（`types/earningsQuality.ts` 内）。
> テーマを切り替える予定があるなら、この関数群を変数化する箇所が唯一の改修点になる。

### 7.4 ナビ登録

`components/NavBar.tsx` に `{ href: '/earnings', label: 'Earnings' }` を追加する。

### 7.5 環境変数

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

`NEXT_PUBLIC_*` はビルド時に公開 JS へ埋め込まれる。anon key + RLS 前提で運用すること。

---

## 8. 移植手順

1. `earnings_quality` テーブルを用意（§2 のスキーマ・PK・RLS）。供給ジョブは別途。
2. `types/earningsQuality.ts` をコピー（無改修で動く）。
3. `lib/supabase` を用意 → `lib/earningsQualityFetch.ts` をコピー。
4. §7.2 の共有依存を用意（無ければ最小実装で代替）→ セクションとページをコピー。
5. NavBar にリンク追加。
6. 動作確認: 満点行 / 1Q の `5/5` / 欠損セルの `—` / 集中日バナー / 閑散期の赤バナー / 日付セレクトの往復。

---

## 9. 既知の制約・引き継ぎメモ

- **祝日非考慮**: `businessDaysBetween` は土日のみスキップ。連休明けは鮮度が実際より新しく見える（1 段階ゆるい）。
- **`isAfterClose` は 15:30 固定**: 2024-11-05 以前の開示を遡って表示すると、15:00-15:30 の開示が「引け前」判定になる。
- **`availableDates` は最大 60 日**: それ以前の日付は日付セレクトから選べない（URL 直指定の口も現状なし）。
- **`eventsInDay` は先頭行依存**: 供給側が行ごとに異なる値を入れると表示が壊れる。
- **`scale_cat` / `mkt` は UI 未使用**: 契約として温存しているだけ。フィルタ追加の余地。
- **`fetchPeakDays` は現行 UI から未使用**: footer 実装時に使う想定で残置。
- **フィルタはセクターのみ**: スコア下限・売買代金・SMA200 などのフィルタは意図的に未実装（列ソートで代替）。
