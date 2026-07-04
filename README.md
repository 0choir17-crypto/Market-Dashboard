# Market-Dashboard

21 Cloud — 日本株マーケットコンディションダッシュボード（新リポ版）。

既存リポ [`21Cloud-Dashboard`](https://github.com/0choir17-crypto/21Cloud-Dashboard) の v1 (`main`) と並行運用するための新環境。`basePath` と `package.json#name` のみ新リポ向けに調整済みで、画面・コンポーネント・型は v1 を完全踏襲しています。

## スタック

- Next.js 16.1.6 (App Router, `output: "export"`)
- React 19 / Tailwind v4
- Supabase JS v2（anon-key, クライアント直接接続, RPC/Realtime/Storage 未使用）
- lightweight-charts v5 / recharts v3

## 環境変数

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

ローカル開発は `.env.local` を、GitHub Pages デプロイはリポジトリの Secrets に登録してください。

> **注意**: `NEXT_PUBLIC_*` はビルド時に公開 JS へ埋め込まれます。Secrets 登録は「リポジトリに平文を置かない」ためのもので、デプロイ後のサイトからは誰でも取り出せる前提で扱ってください。

## 認証とRLS

書き込み系テーブル（`trades` / `notes` / `risk_settings` / `watchlist`）は
`supabase/migrations/20260704_secure_user_tables.sql` 適用後、**閲覧は anon のまま・書き込みは authenticated 限定**になります。

セットアップ手順:

1. Supabase ダッシュボード > Authentication > Users で自分のメール + パスワードのユーザーを作成
2. Authentication > Sign In / Up で新規サインアップを無効化（Allow new users to sign up = OFF）
3. SQL Editor で `supabase/migrations/20260704_secure_user_tables.sql` と `20260704_initial_stop.sql` を実行
4. アプリのナビバー右端「🔒 ログイン」からログイン（セッションは端末に保存され、端末ごとに初回のみ）

## 開発

```bash
npm ci
npm run dev     # http://localhost:3000/Market-Dashboard
npm run build   # 静的ビルド → out/
```

## デプロイ

`main` への push で `.github/workflows/deploy.yml` が走り、GitHub Pages に公開されます。
有効化前に Settings > Pages の Source を **GitHub Actions** に設定してください。

## 既存 21Cloud との関係

- DB スキーマは同一 Supabase を共有する想定です。
- v1 (`21Cloud-Dashboard`) は `main` でそのまま運用継続。
- 本リポは UI 改修・スキーマ整理を段階的に適用していくための実験/本番ライン。

## スキーマ監査メモ（今後の整理候補）

下記は使用実績が薄いとされた列で、将来的に削除を検討する候補です。**今回のコピーでは全て温存**しています（IndexCard 用 TOPIX/Nikkei/Growth 列は引き続き使用中と確認済み）。

- `market_conditions.positive_count`, `total_count`, `positive_pct`
- `market_conditions.f01_*` 〜 `f12_*`（v1 12要因）
- `market_conditions.mc_score_v1`, `mc_score_v3`, `mc_regime_v3`, `divergence_flag`
- `market_conditions.f1_idx_momentum` 〜 `f7_idx_52wh_distance`（v3 7要因）

削除する際は以下のファイルから対応箇所を取り除きます:

- `types/market.ts`
- `app/guide/page.tsx`
- 該当画面 / コンポーネントは現状ありません（v3 系は型のみ参照）

## ディレクトリ構成

```
app/                  # App Router ページ (/, /today, /journal, /portfolio, /sectors, /sectors33, /watchlist, /guide)
components/           # 画面別 UI コンポーネント
  market/             # MC v4 ScoreGauge / FactorGrid / DynamicsCards / Breadth / IndexCard
  today/              # Today 集約画面
  journal/            # Trade Journal
  portfolio/          # Positions / History / Risk
  watchlist/          # Watchlist
  sectors/            # Sector RS / RRG / 棒グラフ
  sectors33/          # TOPIX-33 Sector Selection
  chart/              # 個別銘柄チャート（StockChartView ほか）
  vcp/                # VCP テーブル
  signals/            # Signals テーブル
  structurePivot/     # Structure Pivot テーブル / 凡例
  shared/             # Modal / Tooltip / ConfirmDialog
lib/                  # Supabase クライアント・フェッチ・指標計算
types/                # TS 型定義
contexts/             # DateContext (日付ピッカー)
supabase/             # SQL マイグレーション（参考）
scripts/              # メンテナンス用 (MFE/MAE バックフィル等)
```
