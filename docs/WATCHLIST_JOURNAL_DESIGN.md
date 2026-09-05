# Watchlist Journal 設計書（`/watchlist`・2026-09-05 時点）

> ⚠️ **2026-09-05: `DESIGN_DIRECTION.md` の step 0〜4 を適用済み。**
> 色（意味語彙 7 トークン）・フォント・面・タイプスケールが変わっています。
> §7 の配色表と §4 の鮮度バッジは更新済み。列構成（§5 / §6）は step 7 で変わる予定です。

デザイン見直しのベースとして、**実装から起こした現状**をまとめたもの。
「なぜそうなっているか」を併記してあるので、変える前に読んで、意図ごと置き換えるか
意図を残して見た目だけ変えるかを判断できる。

---

## 1. この画面の目的と制約

### 目的は 2 つだけ

1. **上昇・下降する銘柄の特徴を掴めているか** — 自分が拾った銘柄はどういう姿だったか
2. **見逃したのはなぜか** — 入れたのに買わずに落とした銘柄がその後どうなったか

### 性格を決めている制約

| 制約 | 影響 |
|---|---|
| **読み取り専用** | 追加・編集・削除の UI を持たない。編集は TradingView 側。Supabase にも write policy が無い |
| **日中は更新されない** | 前夜の状態を見る画面。「今の株価」を出す場所ではない |
| **記録は土日祝も発生する** | 営業日カレンダー（`DateContext`）を使えない |
| **`watchlist_current` に履歴が無い** | 毎晩 delete-all → insert。過去日に遡れないので日付ピッカーを持たない |
| **サンプルが少ない**（2026-08-13 開始） | 勝率・PF・期待値を出さない。集計は中央値までで件数を明記する |

---

## 2. データソース

| テーブル | 粒度 | 更新 | 指標の時点 | 画面での用途 |
|---|---|---|---|---|
| `watchlist_current`（28 列） | 1 行 = 1 銘柄 | 毎晩 delete-all → insert | **今日**の値 | Current State |
| `watchlist_events`（39 列） | 1 行 = 1 イベント | upsert（直近 90 日を送り直す） | **イベント日**の値。値動き 7 列だけ毎晩更新 | Missed Board / 鮮度バッジ |

- 配信は **毎日 23:30**（土日祝も）。手動更新はデスクトップのショートカット
- 取得は `select('*')` の 4 クエリ（`current` / 最終 `ts` / Watch list からの `exit` 全件 / `HOLD` 履歴）
- ページングは `lib/pagedFetch.ts`（PostgREST の 1000 行上限対策）。安定順序は PK `(snapshot_id, code)`

---

## 3. 画面構造

```
main (min-h-screen, p-6, bg: --bg-primary)
│
├─ PageHeader                                    共通コンポーネント
│    title    "Watchlist Journal"                 ← 英語（画面の固有名）
│    subtitle "TradingView の操作記録 — 何を拾い、何を落としたか"
│    children SnapshotFreshnessBadge              ← 右側スロット
│    onRefresh load()                             ← 「更新」ボタン
│
├─ ErrorBanner                                   取得失敗時のみ・再試行ボタン付き
│
├─ [読み込み中] / [記録がまだありません]           排他表示のカード
│
├─ flex-col gap-10
│   ├─ CurrentStateTable   ← 現在のリスト（15 列・state でグループ化）
│   └─ MissedBoard         ← 主役（サマリタイル + 11 列）
│
└─ 注記（text-[11px], --text-muted）
     読み取り専用であること / HOLD→SOLD は約定日ではないこと /
     記録開始日に現れた 4 銘柄は開始前からの建玉であること
```

**日付ピッカーは無い**。以前は「今日の差分」セクションのために持っていたが、
当日の移動は Current State の `Since` / `Days` に出るため差分ごと削除した。

---

## 4. ヘッダー — 鮮度バッジ

記録パイプラインが黙って止まるのが、この画面で一番怖い障害。**表示自体が必須**。

```
最終記録: 9/5 23:30  [🟢 0 時間前]
```

| 経過 | level | 語彙 | ラベル | hint |
|---|---|---|---|---|
| < 24h | `ok` | **`idle`（無色）** | `N 時間前` | 直近 24 時間以内に記録されています |
| 24–48h | `aging` | `watch` | `N 時間更新なし` | 丸 1 日撮れていません。拡張は TradingView を開いた時にしか撮らないため… |
| > 48h | `old` | `weak` | `N 日更新なし` | 48 時間以上更新されていません。TV を開いていないだけの場合も… |
| 記録なし | `unknown` | `idle`（無色） | `記録なし` | — |

正常（`ok`）は面を持たず、グレーのドットと時刻だけになる。
**正常が目立たない状態を作ることが、異常の発見を速くする。**

**設計上の決めごと**

- 配色とバッジ形状は `/earnings` の `FreshnessBadge` に揃えるが、**判定ロジックは流用しない**。
  あちらは営業日ベースなので、金曜夜に ingest が落ちても火曜まで緑のままになる
- 文言は「異常」と**断定しない**。拡張は TradingView を開いた時にしか撮らないので、
  旅行等で開かない日が続けば正常でも古くなる。事実（N 時間更新されていない）だけを書く
- `ts` は timestamptz で UTC 返却。表示は必ず JST に変換（`lib/dates.ts#formatJstDateTime`）

---

## 5. Current State

### レイアウト

```
Current State                          22 銘柄 — 指標は今日の値。並び順は列見出しをクリック（既定: 滞在日数の長い順）
┌──────────────────────────────────────────────────────────────────────┐
│ [列見出し 15 列 / クリックでソート / bg: --bg-card-hover]              │
├──────────────────────────────────────────────────────────────────────┤
│ ▶ [HOLD] 2 銘柄                                    ← グループ見出し行 │
│   … 行 …                                                             │
│ ▶ [READY] 1 銘柄 — エントリー可と判断した銘柄。滞在が伸びているものは… │
│   … 行 …                                                             │
│ ▶ [SOLD] 4 銘柄 — 売却済アーカイブ。現在のウォッチ対象ではない（既定で折りたたみ）│
└──────────────────────────────────────────────────────────────────────┘
min-w-[1320px] / 横スクロール
```

### グループ

- 順序 `HOLD → READY → FOCUS → SECOND → SHORT → OTHERS → INBOX → SOLD`
- **行が存在するグループだけ**描画（日によって SOLD / INBOX の有無が変わる）
- 見出し行はクリックで開閉。**`SOLD` だけ既定で折りたたむ**
  （売却済アーカイブで現在のウォッチ対象ではなく、記録開始前からの建玉が混ざるため）
- `STATE_ORDER` に無い状態が来たら末尾に「（不明）」で出し、表の下に警告文を出す

### 列（15 列）

| # | 見出し | 元データ | 表示 | 揃え |
|---|---|---|---|---|
| 1 | `Code / Name` | `code` / `co_name` | コード=等幅 accent 色、名前=小さいミュート色 | 左 |
| 2 | `Sector` | `sector_s33` | text-xs secondary | 左 |
| 3 | `Since` | `since` | 等幅 text-xs | 左 |
| 4 | `Days` | `days` | `12日`（暦日） | 右 |
| 5 | `Entry → Now` | `close_at_since` → `close_adj` | `4,110 → 4,250` | 右 |
| 6 | `Return` | `ret_since_pct` | 損益色 + 符号 | 右 |
| 7 | `ADR %` | `adr_pct_20` | `4.5%` | 右 |
| 8 | `ATR14` | `atr_14` | `278.1` | 右 |
| 9 | `1R（21EMA Low）` | `dist_ema21_low_yen` | `¥915`（整数丸め） | 右 |
| 10 | `1R %（21EMA Low）` | 派生 `100 × #9 ÷ close_adj` | `22.25%` **中立色** | 右 |
| 11 | `RR2（21EMA Low）` | `rr2_ema21_low_yen` | `¥1,829` | 右 |
| 12 | `RR2 %（21EMA Low）` | 派生 | `44.51%` **中立色** | 右 |
| 13 | `RS` | `rs_vs_topix_avg` | `71` | 右 |
| 14 | `52W High` | `dist_from_high_pct` | `-10.9%` | 右 |
| 15 | `Ext R (50MA)` | `ext_r` | `2.7R` | 右 |

**並びの意図**: 銘柄の身元（1-3）→ 経過と成績（4-6）→ **速さとリスク**（7-12）→ 相場強弱（13-15）。
ATR 系 5 列を隣接させ、`Ext R` は 50MA 基準で 21EMA 基準の `1R` とは別物なので見出しに基準を書く。

---

## 6. Missed Board（主役）

**「見逃し」= Watch list に入れたが、その exit の date より前に HOLD になっていない銘柄。**
同一 code の exit は畳まず全件出す（1 回ごとが独立した判断）。

### レイアウト

```
Missed Board          Watch list に入れたのに、買わないまま落とした銘柄がその後どうなったか
                                        — 並び順は列見出しをクリック（既定: 落とした後に伸びた順）
┌────────┬────────┬────────┬────────┬────────┬────────┐  ← from_state 別サマリ
│ 全部   │ READY  │ FOCUS  │ SECOND │ OTHERS │ …      │     クリックで絞り込み
│ 146    │ [21]   │ [31]   │ [44]   │ [49]   │        │     READY は青枠で強調
│        │ 中央 現在 -2.46% / 最大 +1.69%                │
└────────┴────────┴────────┴────────┴────────┴────────┘
n=146 — 件数がまだ少ないため中央値のみ。勝率・PF・期待値は出しません
┌──────────────────────────────────────────────────────┐
│ [列見出し 11 列 / クリックでソート]                    │
│ … 行（READY 由来は bg-blue-50/40 で薄く強調）…         │
└──────────────────────────────────────────────────────┘
min-w-[980px]
```

### 列（11 列）

| # | 見出し | 元データ | 表示 | 揃え |
|---|---|---|---|---|
| 1 | `Date` | `date` | 等幅 text-xs（落とした日） | 左 |
| 2 | `Days` | `bars_since` | `14日` — **営業日**数 | 右 |
| 3 | `Code / Name` | `code` / `co_name` | Current State と同じ | 左 |
| 4 | `Price` | `close_adj` | `¥2,140`（落とした日の終値・右 3 列の基準） | 右 |
| 5 | `Sector` | `sector_s33` | text-xs secondary | 左 |
| 6 | `From` | `from_state` | 状態バッジ | 左 |
| 7 | `Stay` | `dwell_days` | `3日` — **暦日**数 | 右 |
| 8 | `Return` | `ret_since_pct` | 損益色 + 符号 | 右 |
| 9 | `Max Gain` | `max_ret_pct` | 損益色 + 符号・`font-semibold` | 右 |
| 10 | `Max Draw` | `min_ret_pct` | 損益色 + 符号 | 右 |
| 11 | `ADR %` | `adr_pct_20` | `4.5%` | 右 |

> ⚠️ **`Days` と `Stay` は数え方が違う**（営業日 vs 暦日）。表記を Current State に揃えた結果
> どちらも「日」になっているので、ツールチップで明示している。デザイン見直しで
> 単位を見分けさせたいなら `Days` を「営業日」表記にする余地がある。

### グループ順と強調

- サマリの並び `READY → FOCUS → SECOND → SHORT → OTHERS → INBOX`
- **`READY` が最も重い**（エントリー可と判断しておいて買わなかった）。
  サマリタイルは青枠（`border-blue-300 bg-blue-50/60`）、行は `bg-blue-50/40`
- ソートの `From` 列だけは五十音順ではなく**この重み順**で並ぶ

---

## 7. 共通の表示規則

### 色

| 用途 | トークン |
|---|---|
| 背景 | `--bg-primary` `#fdf6e3`（クリーム）/ カード `--bg-card` `#fffdf7`（**白に分離**）/ ホバー `--bg-card-hover` |
| 罫線 | `--border` `#ece3cc`（0.5px） |
| 文字 | `--text-primary` / `--text-secondary` / `--text-muted` |
| 損益 | `--positive` `#16a34a` / `--negative` `#dc2626`（**意味語彙とは別系統**） |
| 意味語彙 | `--sem-{strong,ok,watch,weak,idle,archive,focus}-{bg,fg,bd}`（7 語彙 × 3 値） |
| 欠損 | `--sem-idle-fg` の `—` |

面は静止する。**影とホバーの移動・浮上は全廃**（`.card` から `box-shadow` / `transform` を削除）。
面の分離は背景色差と 0.5px の罫線だけで行う。

### 状態の表現 — バッジは廃止

Current State は既に state でグループ化されているので、その中の全行に同じ色のバッジを
置くのは同じ情報の二重描画。**塗りのバッジをやめてテキストにした**（`StateLabel`）。
重みは色ではなく **`READY` の行だけ左端 2px のレール**（`--sem-focus-fg`）で表す。

状態 → 意味語彙の対応（`types/watchlistJournal.ts#STATE_TONE`）:

| 状態 | 語彙 | 理由 |
|---|---|---|
| `HOLD` | `strong` | 保有中 |
| `READY` / `FOCUS` | `focus` | 注目 |
| `SECOND` / `OTHERS` / `INBOX` | `idle` | **未整理は警戒ではない**ので無彩色へ移した |
| `SHORT` | `weak` | 買い方向としては弱い（別軸） |
| `SOLD` | `archive` | 済み・対象外 |

実際の色は `globals.css` の `--sem-*` が持ち、`types/*.ts` に生の 16 進は無い。

### タイポグラフィ

- 欧文・数値は TradingView と同じシステムフォントスタック
  （`-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu`）+ 和文 Noto Sans JP。
  **Sora の webfont は廃止**した
- サイズは 5 段のみ: `text-caption` 11 / `text-small` 12 / `text-body` 13 / `text-lead` 15 / `text-title` 18
- ウェイトは 400 と 500 の 2 つだけ（`font-bold` は使わない）
- 等幅（IBM Plex Mono）は**識別子だけ**: 銘柄コード・日付・時刻。
  数値の桁揃えは `.num`（`tabular-nums`）が担当し、書体はサンセリフ

> ⚠️ Trebuchet MS が `tnum` を持たない場合、桁が揃わない。実機（Windows / macOS / iPhone）で
> `/debug/font` を開いて確認し、ずれていたら `--font-sans` 先頭を IBM Plex Sans に差し替える。

### 数値

- 数値は `.num`（サンセリフ + `tabular-nums`）、**表では右揃え**
- 率は既定 1 桁、`1R %` / `RR2 %` は TradingView と突き合わせるので **2 桁**
- 金額は整数丸め + `¥` 前置（`lib/format.ts#formatYen`）

### NULL

**「0%」として扱わず、`—` で欠損と分かるように出す。**

| 列 | NULL の理由 |
|---|---|
| `ret_since_pct` / `max_ret_pct` / `min_ret_pct` | イベント当日でまだ翌営業日が来ていない |
| `dwell_days` | `enter` イベント（直前の状態が無い） |

ソートでは **NULL を昇順・降順どちらでも末尾**に置く。欠損を最小値として先頭に並べると、
まだ測れていない銘柄が上位に居座って読めなくなるため。

### リンク

プロジェクト共通規約（`lib/tickerLinks.ts`）:
**コード → TradingView / 銘柄名 → 四季報**。どちらも `target="_blank" rel="noopener noreferrer"`。

---

## 8. インタラクション

| 操作 | 対象 | 挙動 |
|---|---|---|
| 列見出しクリック | 両テーブル全列 | ソート。同じ列を再クリックで昇順 ⇄ 降順。ソート中の列は accent 色 + `↑`/`↓`、未ソートは `↕` |
| グループ見出しクリック | Current State | 開閉。`▶` が 90° 回転 |
| サマリタイルクリック | Missed Board | `from_state` で絞り込み。再クリックで解除 |
| 「更新」ボタン | ヘッダー | 全 4 クエリを再取得。連打は `requestIdRef` で後着応答を破棄 |
| ホバー | 行 | `--bg-card-hover` |

**既定ソート**: Current State = `Days` 降順（READY で何日止まっているか）/
Missed Board = `Max Gain` 降順（落とした後に伸びた順）。

---

## 9. 意図的に「置かないもの」

| 置かないもの | 理由 |
|---|---|
| **勝率・PF・期待値のタイル** | 2026-08-13 開始でサンプル過少。この家では素の勝率が繰り返し `ADR%20` の影武者になることが確認されている。集計は中央値までに留め、件数を明記する |
| **8% ルールの色・印** | `1R % ≥ 8` はエントリー対象外だが、判断は数値を見て手で行う。`1R %` はほぼ常にプラス値なので損益色を当てると「良い数字」に誤読される → **中立色** |
| **「自力発見」ラベル / `scanner_names` 列** | 空の意味が「どのスキャナーも拾えなかった」と「その日リストを貼らなかった」で区別できず、集計すると誤解を招く |
| **日付ピッカー** | `watchlist_current` に履歴が無く遡れない。差分セクションも重複のため削除済み |
| **追加・編集・削除の導線** | 編集は TradingView 側。Supabase に write policy も無い |

---

## 10. ファイル構成

```
app/watchlist/page.tsx                            ページ本体・取得と状態遷移
lib/watchlistJournalFetch.ts                      4 クエリ + 見逃し判定 buildMissed()
types/watchlistJournal.ts                         型 / STATE_ORDER / stateColors /
                                                  riskPct() / classifySnapshotFreshness()
components/watchlistJournal/
  ├─ CurrentStateTable.tsx                        15 列・グループ化・ソート・折りたたみ
  ├─ MissedBoard.tsx                              サマリタイル + 11 列・ソート・絞り込み
  ├─ SnapshotFreshnessBadge.tsx                   実時間ベースの鮮度
  └─ atoms.tsx                                    StateBadge / ScannerTags / PctCell /
                                                  NumCell / YenCell / TickerCell /
                                                  SampleSizeNote / median()
components/shared/{PageHeader,ErrorBanner}.tsx    共通
lib/{format,dates,tickerLinks,pagedFetch}.ts      共通ユーティリティ
```

---

## 11. デザイン見直しで論点になりそうな箇所

1. **横幅** — Current State は `min-w-[1320px]` で常に横スクロールが出る。列の表示切替、
   2 段組、優先度の低い列のたたみ込みなどが候補
2. **`Days` / `Stay` の単位** — 表記を揃えた結果どちらも「日」だが中身は営業日 / 暦日
3. **`Entry → Now`** — 1 セルに 2 値を詰めている唯一の列。分けるか、差分だけにするか
4. **状態バッジ 8 色** — 現在は状態ごとに独立した色。READY / FOCUS の重みの差を
   色で表すか、位置と面積で表すかは再考の余地がある
5. **Missed Board のサマリタイル** — 6 枚並ぶと `lg:grid-cols-6` で細くなる。
   中央値 2 つを 1 行に詰めているので窮屈
6. **`SOLD` の折りたたみ** — 既定で畳んでいるが、そもそも Current State に出すべきかは別論点
7. **クリーム背景（`#fdf6e3`）とカード色が同一** — 枠線だけで階層を作っているので、
   テーブルが背景に沈む。グループ見出し行だけ `--bg-primary` を敷いて区切っている
8. **ダークモード非対応** — トークンは `:root` のみで `prefers-color-scheme` の定義が無い
