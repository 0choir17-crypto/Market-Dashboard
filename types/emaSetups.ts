// EMA Setups（下落 → EMA 到達 → 踏みとどまった日）— Daily Watch の新テーブル。
// Source table: public.ema_setups  (PK: date + code + ema, anon SELECT 可・RLS public read)
// Pipeline: jquants-scanner (別リポ) `scripts/daily/scan_ema_setups.py`（本番 run_daily Step1d）が
//   毎晩、直近5営業日ぶんを冪等 upsert。過去行は書き換わらない（status の概念なし）。
//
// 検出条件（EMA 9 / 21 / 50 をそれぞれ独立に判定）:
//   上から接近  前日終値 > 前日EMA        … 上から降りてきたことの担保
//   到達        当日安値 <= EMA
//   耐えた      当日安値 >= EMA − 0.10 × ATR14(前日)
// つまり「安値が EMA のすぐ下 0.1ATR という薄い帯にぴたりと収まった日」。
// 帯を下に抜けた日（EMA を明確に割った日）は対象外。
//
// ⚠️ 位置づけ（配信側で検証済み・承知の上で採用）:
//   このスキャナーに統計的エッジは無い。勝率 23.6% に対し同ユニバースのベースラインが 23.1%。
//   「耐えの深さ」「ヒゲか実体か」「どのEMAか」「翌日寄りで上昇したか」はいずれも AUC 0.50
//   ＝勝ち負けについて情報ゼロ。したがってダッシュ側では
//     - スコア / グレード / ランク付けをしない（根拠が無いため、無い情報があるように見せてしまう）
//     - 「買いシグナル」「エントリー推奨」という表現を使わない
//   正しい位置づけは「毎朝チャートを開く銘柄を機械的に絞り込んだリスト」。最終判断は手動。
//
// ユニバース（このテーブルに載っている時点で全て充足）:
//   個別株のみ / 売買代金20日平均 1億円以上 / ADR%₂₀ ≥ 2.5 / EMA150 上向き / EMA21 ≥ SMA150
//   → 約 370〜450 銘柄/日

// 対象 EMA。DB の `ema` 列はこの3値のいずれか。
export const EMA_PERIODS = [9, 21, 50] as const
export type EmaPeriod = (typeof EMA_PERIODS)[number]

// 'WICK' = 実体は EMA の上、下ヒゲだけが刺さった（実測 約81%）
// 'BODY' = 実体下限が EMA を割った（実測 約19%）
export type TouchType = 'WICK' | 'BODY'

// DB の 1 行 = 1 タッチ。同じ銘柄が同日に 9/21/50 の複数 EMA へタッチすれば最大 3 行出る。
export type EmaSetupRow = {
  date: string                       // タッチ日（PK）。引け後に確定
  code: string                       // 銘柄コード（PK）
  ema: EmaPeriod                     // 9 / 21 / 50（PK）
  touch_type: TouchType | null

  co_name: string | null
  sector_s33: string | null          // 東証33業種名

  close: number | null               // タッチ日の終値
  ema_value: number | null           // その日の EMA の値
  low_atr: number | null             // (安値 − EMA) / ATR14(前日)。定義上 0 〜 −0.10
  body_atr: number | null            // (min(始値,終値) − EMA) / ATR14(前日)。正なら WICK、負なら BODY
  atr: number | null                 // ATR14（前日値）

  adr_pct: number | null             // ADR%（20日）
  turnover_oku: number | null        // 売買代金 20日平均（億円/日）
  vol_ratio: number | null           // 出来高比（対 20日平均）
  rs_topix_avg: number | null        // 対TOPIX RS 平均（21/63/126d）0-100
  dist_from_high_pct: number | null  // 52週高値からの乖離%（0 に近いほど高値圏）
  ext_sma150_pct: number | null      // 終値の 150SMA からの乖離%

  // 直近10営業日に「同じ EMA」へのタッチが無い＝初回。情報列であってフィルタ条件ではない。
  // （注: 廃止済みの旧押し目テーブルの fresh は「直近5営業日・EMA の区別なし」で定義が異なる）
  fresh: boolean | null
}

// 1 タッチぶんの内訳。カード上で EMA バッジとして並べる。
export type EmaTouch = {
  ema: EmaPeriod
  touch_type: TouchType | null
  low_atr: number | null
  ema_value: number | null
  body_atr: number | null
  fresh: boolean | null
}

// 表示単位（案1: 銘柄で1行にまとめ、タッチした EMA をバッジで併記）。
// 銘柄単位の列（co_name / close / RS / 売買代金 …）は EMA 行をまたいで同値なので、
// 代表行から引き写す。EMA ごとに違うのは touches[] に入る値だけ。
export type EmaSetupCardRow = {
  date: string
  code: string
  co_name: string | null
  sector_s33: string | null

  close: number | null
  adr_pct: number | null
  turnover_oku: number | null
  vol_ratio: number | null
  rs_topix_avg: number | null
  dist_from_high_pct: number | null
  ext_sma150_pct: number | null

  // タッチした EMA を短い順（9 → 21 → 50）に並べたもの。1〜3 件。
  touches: EmaTouch[]
}

function isNum(v: number | null | undefined): v is number {
  return v !== null && v !== undefined && Number.isFinite(v)
}

// touch_type が欠けていても body_atr から復元できる（正なら WICK / 負なら BODY）。
// 供給側が touch_type を落とした場合のフォールバック。
export function resolveTouchType(t: EmaTouch): TouchType | null {
  if (t.touch_type === 'WICK' || t.touch_type === 'BODY') return t.touch_type
  if (isNum(t.body_atr)) return t.body_atr >= 0 ? 'WICK' : 'BODY'
  return null
}

// DB の 1タッチ=1行 を銘柄単位へ畳む（案1）。
// 銘柄共通列は「値が入っている最初の行」を採用する（EMA 行をまたいで同値の想定だが、
// 供給側が一部行で null を返しても表示が欠けないようにする）。
export function groupByCode(rows: EmaSetupRow[]): EmaSetupCardRow[] {
  const byCode = new Map<string, EmaSetupCardRow>()

  for (const r of rows) {
    let card = byCode.get(r.code)
    if (!card) {
      card = {
        date: r.date,
        code: r.code,
        co_name: r.co_name,
        sector_s33: r.sector_s33,
        close: r.close,
        adr_pct: r.adr_pct,
        turnover_oku: r.turnover_oku,
        vol_ratio: r.vol_ratio,
        rs_topix_avg: r.rs_topix_avg,
        dist_from_high_pct: r.dist_from_high_pct,
        ext_sma150_pct: r.ext_sma150_pct,
        touches: [],
      }
      byCode.set(r.code, card)
    } else {
      card.co_name ??= r.co_name
      card.sector_s33 ??= r.sector_s33
      card.close ??= r.close
      card.adr_pct ??= r.adr_pct
      card.turnover_oku ??= r.turnover_oku
      card.vol_ratio ??= r.vol_ratio
      card.rs_topix_avg ??= r.rs_topix_avg
      card.dist_from_high_pct ??= r.dist_from_high_pct
      card.ext_sma150_pct ??= r.ext_sma150_pct
    }

    card.touches.push({
      ema: r.ema,
      touch_type: r.touch_type,
      low_atr: r.low_atr,
      ema_value: r.ema_value,
      body_atr: r.body_atr,
      fresh: r.fresh,
    })
  }

  for (const card of byCode.values()) {
    card.touches.sort((a, b) => a.ema - b.ema)
  }
  return [...byCode.values()]
}
