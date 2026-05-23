# Migration to `Market-Dashboard` repo

このサブディレクトリを、新リポ <https://github.com/0choir17-crypto/Market-Dashboard> のルートとして公開するための手順です。

## 前提

- このサブディレクトリ (`market-dashboard/`) は、`21Cloud-Dashboard` の `claude/market-dashboard-migration-0uS8m` ブランチに含まれています。
- 新リポは既に作成済みで、初期は空 (または README のみ) を想定。
- 履歴は **本サブディレクトリの内容だけを切り出して** 新リポに反映します。サブディレクトリ抽出 = `git filter-repo` を使用。

## 推奨手順（履歴保持）

### 1. ローカルで作業用クローン

```bash
cd /tmp
git clone --no-local --branch claude/market-dashboard-migration-0uS8m \
  https://github.com/0choir17-crypto/21Cloud-Dashboard.git market-dashboard-export
cd market-dashboard-export
```

### 2. `market-dashboard/` をリポジトリルートに昇格

`git filter-repo` (推奨, 高速) または `git filter-branch` (fallback) を使います。

**git filter-repo (要インストール: `pip install git-filter-repo`)**

```bash
git filter-repo --subdirectory-filter market-dashboard
```

これで `market-dashboard/` 以下が新しいリポジトリルートになり、それ以外のファイル (既存 21Cloud の `app/`, `components/` 等) が履歴から除去されます。

### 3. リモートを差し替えて push

```bash
git remote remove origin
git remote add origin https://github.com/0choir17-crypto/Market-Dashboard.git

# 新リポの main にデプロイ
git branch -M main
git push -u origin main
```

### 4. GitHub 側設定

1. **Settings > Pages**: Source を **GitHub Actions** に変更
2. **Settings > Secrets and variables > Actions**: 2 つ追加
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. `main` への push で `.github/workflows/deploy.yml` が走り、`https://0choir17-crypto.github.io/Market-Dashboard/` で公開されます。

## 履歴不要・クリーンスタートの場合

```bash
cd /tmp
cp -r /path/to/21Cloud-Dashboard/market-dashboard market-dashboard-fresh
cd market-dashboard-fresh
git init -b main
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/0choir17-crypto/Market-Dashboard.git
git push -u origin main
```

## 移行後の v1 (21Cloud-Dashboard) の扱い

- `main` ブランチは現状維持で運用継続。
- 本サブディレクトリの存在は v1 のビルドに影響しません (`next.config.ts` のルートは `21Cloud-Dashboard` 直下のため `market-dashboard/` 配下は無視されます)。
- 完全に分離したい場合は、移行完了後に `claude/market-dashboard-migration-0uS8m` ブランチ または `market-dashboard/` ディレクトリを削除してください。

## 動作確認チェックリスト

新リポ側で push 後:

- [ ] GitHub Actions の `Deploy Next.js to GitHub Pages` が success
- [ ] `https://0choir17-crypto.github.io/Market-Dashboard/` でトップが表示
- [ ] Supabase からデータが取得できている (Market Scorecard が `mc_v4` 値を表示)
- [ ] `/today`, `/journal`, `/portfolio`, `/sectors`, `/sectors33`, `/watchlist`, `/guide` が遷移可能
- [ ] 静的ビルドのリンクが `/Market-Dashboard/...` で解決している
