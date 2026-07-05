// 押し目・踏ん張りタイミング — Daily Watch の新テーブル。
// Source table: public.spring_setups  (PK: date + code, anon SELECT 可・RLS public read)
// Pipeline: jquants-scanner (別リポ) が毎日・平日引け後 (~18:00 JST) に当日分を upsert（冪等）。
//   最新 date が「今日の押し目候補」。過去日はバックフィル/履歴用（表示は max(date) のみ）。
//
// モメンタムリーダー（過去20営業日以内に 21/63/126 の閾値いずれかを満たした銘柄）が、
// 下側の基準線を防衛して短期の押しから踏ん張った局面を検出。2 検出器の和集合。
//   買い持ちシグナルではなくウォッチリスト（執行はストップ=ライン割れ+段階利確が前提）。

// ① ignition_open : 点火日（大陽線）の始値ラインを死守
// ③ swing_low     : 直近10日安値をアンダーカット&リクレイム
//    both          : ①③両方
export type SpringType = 'ignition_open' | 'swing_low' | 'both'

export type SpringSetupRow = {
  date: string
  code: string
  type: SpringType

  co_name: string | null
  sector_s33: string | null

  close: number | null

  ignition_level: number | null     // ①の防衛ライン価格（点火日=大陽線の始値）。③のみの行は null
  defended_pct: number | null       // (close/ignition_level−1)×100 = 引けがラインをどれだけ上で守ったか。小=ライン際で死守
  ignition_age: number | null       // 点火日からの経過営業日（3〜30）。①

  dist_from_high_pct: number | null // 52週高値からの距離(%)
  adr_pct: number | null            // 平均日中変動率(%)

  m21: number | null                // 21日上昇率(%)  = なぜリーダー判定されたかの内訳
  m63: number | null                // 63日上昇率(%)
  m126: number | null               // 126日上昇率(%)

  fresh: boolean | null             // 直近5営業日に本シグナルが無かった=新規点灯

  updated_at: string | null
}

// type バッジの表示定義（ラベル / 色 / ツールチップ）。
export type SpringTypeMeta = {
  label: string
  palette: { bg: string; fg: string; border: string }
  title: string
}

export const SPRING_TYPE_META: Record<SpringType, SpringTypeMeta> = {
  ignition_open: {
    label: '① 点火ライン',
    palette: { bg: '#dbeafe', fg: '#1e40af', border: '#93c5fd' },
    title: '① ignition_open: 点火日（大陽線）の始値ラインを死守',
  },
  swing_low: {
    label: '③ 安値リクレイム',
    palette: { bg: '#ede9fe', fg: '#6d28d9', border: '#c4b5fd' },
    title: '③ swing_low: 直近10日安値をアンダーカット&リクレイム',
  },
  both: {
    label: '★ 両方',
    palette: { bg: '#dcfce7', fg: '#166534', border: '#86efac' },
    title: 'both: ①点火ライン死守 と ③安値リクレイム の両方が成立',
  },
}

export function springTypeMeta(type: SpringType | null | undefined): SpringTypeMeta {
  if (type && type in SPRING_TYPE_META) return SPRING_TYPE_META[type]
  return {
    label: type ?? '—',
    palette: { bg: '#f3f4f6', fg: '#6b7280', border: '#d1d5db' },
    title: '',
  }
}
