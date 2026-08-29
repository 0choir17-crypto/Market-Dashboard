// Advanced Structure Pivot（ロング）1st / 2nd ヒット — Daily Watch の新テーブル。
// Source table: public.structure_pivot_events  (PK: date + code + signal, RLS public read)
// Pipeline: scripts/daily/scan_structure_pivot.py（本番 run_daily Step1j）が毎営業日・引け後に
//   「直近10営業日にヒットしたもの」を冪等 upsert。DDL は生成元リポ側。
//
// 構造: 押し安値が切り上がる (Higher Low = HL) と、その手前のスイングハイを「2nd Pivot」、
//   HL→2nd の 0.618 戻し地点を「1st Pivot（建玉ライン）」とする。
//   1st ヒット = 高値が 1st Pivot に到達した日 / 2nd ヒット = 高値が 2nd Pivot に到達した日。
//
// 位置づけ: 素のシグナル単体に保有エッジは薄い。エッジは 1st 建玉＋3段ストップ＋TP の
//   トレード管理側にある → 買い指示ではなくウォッチリスト。執行は手動チャート判断。
//
// 本テーブルの肝（他の日次テーブルと違い「最新 date だけ読む」モデルではない）:
//   - 1 ヒット = 1 行。1 つの構造は 1st と 2nd で別日に別行が立つ（最大2行）。
//   - status と各 hit_date は後続日の再実行で後追い更新される（同じ行が育つ）。
//   - 10営業日窓から外れた行はそれ以上更新されず凍結（テーブルには残る）。
//
// ユニバース（ADR%20≥2.5 / 売買代金20日≥1億 / 150日線上向き / 終値>50MA / 個別株のみ）は
//   配信前に適用済み。テーブルに乗っている時点で通過済み。

export type StructurePivotSignal = '1st' | '2nd'

// data_max 時点の到達段階。1st/2nd 両行に同じ値が入る。
//   ACTIVE（まだ 2nd 未到達）→ REACHED_2ND → TP1 → TP2、または途中で STOPPED。
export type StructurePivotStatus =
  | 'ACTIVE'
  | 'REACHED_2ND'
  | 'TP1'
  | 'TP2'
  | 'STOPPED'

export type StructurePivotEventRow = {
  date: string // ヒット日（PK）。「いつ 1st/2nd に到達したか」
  code: string
  signal: StructurePivotSignal // '1st' or '2nd'（PK）
  status: StructurePivotStatus | string | null // 構造の到達段階

  last_1st_date: string | null // この銘柄が直近で 1st をヒットした日（全構造横断, per-code）
  last_2nd_date: string | null // この銘柄が直近で 2nd をヒットした日（全構造横断, per-code）

  co_name: string | null
  sector_s33: string | null

  close: number | null // ヒット日終値
  adr_pct: number | null // ADR%（20日）
  turnover_oku: number | null // 売買代金 20日平均（億円/日）。流動性
  rs_topix_avg: number | null // 対TOPIX RS 平均（21/63/126d）0–100。強さ主指標
  rs_topix_63d: number | null // 対TOPIX RS 63日 0–100
  dist_from_high_pct: number | null // 52週高値からの乖離%（0 に近いほど高値圏）
  vol_ratio: number | null // 出来高比（対 平均）

  structure_len: number | null // 採用された pivot length（2–5, tightest）
  hl_date: string | null // 構造の起点 Higher Low の日
  hl_price: number | null // HL の価格
  prev_pivot_price: number | null // 直前の押し安値(LL)価格
  first_pivot: number | null // 1st Pivot = 建玉ライン（HL + 0.618）
  pivot_2nd: number | null // 2nd Pivot = スイングハイ（break_val）
  tp1: number | null // TP1（HL + 1.764）
  tp2: number | null // TP2（HL + 2.618）

  second_hit_date: string | null // この構造の 2nd 到達日（未達 null）
  tp1_hit_date: string | null // この構造の TP1 到達日（未達 null）
  tp2_hit_date: string | null // この構造の TP2 到達日（未達 null）
  stop_hit_date: string | null // この構造の Stop（21EMA of Low 割れ）到達日（未達 null）
  is_active: boolean | null // 追跡継続中か（TP2 or Stop で false）

  updated_at?: string | null
}

// 本日ヒット銘柄を1枚へ集約したカード用の派生行。fetch 側で算出して付与する。
// 表示は「本日（anchor 日）にヒットした銘柄のみ」。カードには 1st / 2nd それぞれの
// 直近ヒット日（last_1st_date / last_2nd_date）を並べ、本日ヒットしたシグナルを強調する。
export type StructurePivotCardRow = StructurePivotEventRow & {
  today_1st: boolean // 本日 1st にヒットしたか
  today_2nd: boolean // 本日 2nd にヒットしたか
}

// signal バッジ（1st=建玉ライン / 2nd=ブレイク進行）の表示定義。
export type SignalMeta = {
  label: string
  palette: { bg: string; fg: string; border: string }
  title: string
}

export const SIGNAL_META: Record<StructurePivotSignal, SignalMeta> = {
  '1st': {
    label: '1st 建玉ライン',
    palette: { bg: '#eef2ff', fg: '#3730a3', border: '#c7d2fe' },
    title:
      '1st ヒット = 押し目からの再上昇入口。1st Pivot（HL+0.618 戻し）に高値が到達。建玉ライン。',
  },
  '2nd': {
    label: '2nd ブレイク',
    palette: { bg: '#eff6ff', fg: '#1e40af', border: '#bfdbfe' },
    title: '2nd ヒット = 構造ブレイク進行。手前のスイングハイ（2nd Pivot）に高値が到達。',
  },
}

export function signalMeta(signal: StructurePivotSignal | string | null | undefined): SignalMeta {
  if (signal === '1st' || signal === '2nd') return SIGNAL_META[signal]
  return {
    label: signal ?? '—',
    palette: { bg: '#f3f4f6', fg: '#6b7280', border: '#d1d5db' },
    title: '',
  }
}

// status バッジの表示定義。終了済み（TP2 / STOPPED）はダッシュ側で除外するが、色定義は残す。
export type StatusMeta = {
  label: string
  palette: { bg: string; fg: string; border: string }
  title: string
}

export const STATUS_META: Record<StructurePivotStatus, StatusMeta> = {
  ACTIVE: {
    label: '追跡中',
    palette: { bg: '#f1f5f9', fg: '#475569', border: '#cbd5e1' },
    title: 'ACTIVE: まだ 2nd 未到達。1st 建玉ラインを見張る段階。',
  },
  REACHED_2ND: {
    label: '2nd到達',
    palette: { bg: '#ecfeff', fg: '#0e7490', border: '#a5f3fc' },
    title: 'REACHED_2ND: 構造ブレイク（2nd Pivot）まで進行。',
  },
  TP1: {
    label: 'TP1',
    palette: { bg: '#dcfce7', fg: '#166534', border: '#86efac' },
    title: 'TP1: 第1利確目標（HL+1.764）まで到達。追跡継続中。',
  },
  TP2: {
    label: 'TP2',
    palette: { bg: '#bbf7d0', fg: '#14532d', border: '#4ade80' },
    title: 'TP2: 第2利確目標（HL+2.618）達成。追跡終了。',
  },
  STOPPED: {
    label: 'Stop',
    palette: { bg: '#f3f4f6', fg: '#6b7280', border: '#d1d5db' },
    title: 'STOPPED: Stop（21EMA of Low 割れ）到達。既に失敗した建て玉。追跡終了。',
  },
}

export function statusMeta(status: StructurePivotStatus | string | null | undefined): StatusMeta {
  if (status && status in STATUS_META) return STATUS_META[status as StructurePivotStatus]
  return {
    label: status ?? '—',
    palette: { bg: '#f3f4f6', fg: '#6b7280', border: '#d1d5db' },
    title: '',
  }
}
