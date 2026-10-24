# 依頼: trades に建玉時の ATR（atr_at_entry）を入れる

Market-Dashboard の `/` の「My Trades」カード（自分の成績）を、1 トレードの損益を **ATR の何倍か** で測る形にしたい。
株価データと ATR の計算を持っているこのリポジトリで、`trades` に建玉時の ATR を入れてほしい。

---

## 背景

- 成績は本来 R（初期リスクの何倍か）で測りたいが、SBI の取り込み経由の行に初期ストップが無い。損切りも柔軟に決めているので、後から推定できない。
- 代わりに **ATR 倍 = (決済値 − 建値) ÷ 建玉時の ATR14** で測る。ATR は裁量が入らず、建玉した日の株価データだけで決まるので、過去分も正確に出せる。
  銘柄ごとの値動きの大きさの違いも揃えられる（地合いの検証でも値動きを ATR で揃えている）。
- Market-Dashboard 側は `trades` を `select('*')` で読んでいる。`atr_at_entry` 列が入れば、直近 10 件がすべて埋まった時点で自動的に ATR 倍の表示へ切り替わる（それまでは損益率 %）。

## やってほしいこと

### 1. 列を足す

```sql
alter table trades add column if not exists atr_at_entry numeric;
comment on column trades.atr_at_entry is
  '建玉時の ATR14（円）。entry_date の前営業日の値。My Trades の ATR 倍 = (決済値 − 建値) ÷ atr_at_entry';
```

マイグレーションは Market-Dashboard の `supabase/migrations/` に置く慣習なので、SQL ファイルも用意してほしい（適用はこちらで行ってもよい）。

### 2. 値の定義

| 項目 | 内容 |
|---|---|
| ATR | ATR14、Wilder 平滑（このリポジトリの既存の ATR と同じ計算。違うなら何を使ったか書く） |
| どの日の値 | `entry_date` の**前営業日**の ATR14（建玉した時点で分かっている値） |
| 単位 | 円（株価と同じ単位。% ではない） |
| 株価 | 権利落ち・分割を調整した系列で計算し、建値（`entry_price`）と同じ基準の値にする。分割前の建値に分割後の ATR を当てないこと |
| 埋めない場合 | 株価データが無い / ATR の助走（14 本）が足りない（上場直後など）→ null のまま。一覧に理由を出す |

### 3. 過去分を埋める

- 対象: `trades` のうち `atr_at_entry IS NULL` の行（`status` は `closed` / `open` / `plan` すべて。`plan` は建玉前なので飛ばしてもよい）。
- 既に値がある行は上書きしない。
- 先に **dry-run**（書き込まずに、id / ticker / entry_date / entry_price / atr_at_entry / ATR% (= ATR ÷ 建値) / 決済済みなら ATR 倍 を CSV に出す）を実装し、人が確認してから本番に書く。
- 確認用: ATR% が極端な行（0.5% 未満 / 15% 超）はたぶんデータか基準の食い違いなので、CSV で目立つようにする。

### 4. 今後も埋まるようにする

SBI の取り込み（`Market-Dashboard/scripts/imports/sbi_to_trades.py`）や建玉入力で新しく入る行にも `atr_at_entry` が入るようにする。
ATR の計算がこのリポジトリにしか無いなら、「`atr_at_entry IS NULL` の行を埋める」処理を毎日のバッチで走らせる形でよい。

## 制約

- 書き込みは `trades.atr_at_entry` だけ。ほかの列・行は触らない。
- RLS で `trades` の書き込みは authenticated 限定（`20260704_secure_user_tables.sql`）。書き込みに使う認証は既存の運用に合わせる。

## 納品物

1. マイグレーションの SQL
2. dry-run の CSV と、本番に書いた件数・埋めなかった行の一覧（理由つき）
3. 今後も埋まるようにした変更点
4. ATR の計算方法（Wilder か、調整後株価か）のメモ
