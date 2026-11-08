'use client'

import { useMemo, useState } from 'react'
import type { DailyStage, WeeklyMaReclaimRow } from '@/types/weeklyMaReclaim'
import { DAILY_STAGES } from '@/types/weeklyMaReclaim'
import type { Trade } from '@/types/trades'
import WeeklyMaReclaimCard from './WeeklyMaReclaimCard'
import PositionModal from '@/components/portfolio/PositionModal'

type Props = {
  rows: WeeklyMaReclaimRow[]
  /** 表示している週（その週の最後の営業日） */
  weekDate: string | null
  title: string
  subtitle: string
  // weekly_ma_reclaim の DDL が未実行（テーブル未配備）。「0 件の週」と区別して案内する。
  tableMissing?: boolean
  // 日次スキャナーの重複銘柄の code 集合（背景を黄色で強調）。週次はこの集合の計算には入れない。
  multiHitCodes: Set<string>
}

function isNum(v: number | null | undefined): v is number {
  return v !== null && v !== undefined && Number.isFinite(v)
}

// YYYY-MM-DD → M/D
function shortDate(d: string | null): string {
  if (!d) return '—'
  const [, m, day] = d.split('-')
  return `${Number(m)}/${Number(day)}`
}

type Cmp = (a: WeeklyMaReclaimRow, b: WeeklyMaReclaimRow) => number

// null は末尾。dir = 1 で小さい順、-1 で大きい順。
function by(value: (r: WeeklyMaReclaimRow) => number | null, dir: 1 | -1): Cmp {
  return (a, b) => {
    const av = value(a)
    const bv = value(b)
    if (!isNum(av) && !isNum(bv)) return 0
    if (!isNum(av)) return 1
    if (!isNum(bv)) return -1
    return dir * (av - bv)
  }
}

// 日足の段階ごとの「基準の線」との距離（ATR 単位）。50-150EMA と Below 150EMA はどちらも 150EMA。
function refDistance(r: WeeklyMaReclaimRow): number | null {
  const v =
    r.daily_stage === 'Above 9EMA'
      ? r.d_ema9
      : r.daily_stage === '9-21EMA'
        ? r.d_ema21
        : r.daily_stage === '21-50EMA'
          ? r.d_ema50
          : r.daily_stage === '50-150EMA' || r.daily_stage === 'Below 150EMA'
            ? r.d_ema150
            : null
  return isNum(v) ? Math.abs(v) : null
}

type SortDef = { key: string; label: string; compare: Cmp }

// 並べ替えは「中立な事実」に限る（スコア / ランク付けはしない）。グループの中に適用する。
const SORTS: SortDef[] = [
  { key: 'ref', label: '基準の線に近い順', compare: by(refDistance, 1) },
  { key: 'high', label: '高値から深い順', compare: by(r => r.dist_high_pct, 1) },
  { key: 'mcap', label: '時価総額 小さい順', compare: by(r => r.mcap_oku, 1) },
  { key: 'turnover', label: '売買代金 大きい順', compare: by(r => r.turnover10_pre_oku, -1) },
  { key: 'adr', label: 'ADR% 大きい順', compare: by(r => r.adr_pct, -1) },
  { key: 'code', label: 'コード順', compare: (a, b) => a.code.localeCompare(b.code) },
]

const STAGE_TITLE: Record<DailyStage, string> = {
  'Above 9EMA': '日足の終値が 9EMA の上（基準の線 = 9EMA）',
  '9-21EMA': '日足の終値が 9EMA の下・21EMA の上（基準の線 = 21EMA）',
  '21-50EMA': '日足の終値が 21EMA の下・50EMA の上（基準の線 = 50EMA）',
  '50-150EMA': '日足の終値が 50EMA の下・150EMA の上（基準の線 = 150EMA）',
  'Below 150EMA': '日足の終値が 150EMA の下（基準の線 = 150EMA）',
}

const UNKNOWN_STAGE = '段階なし'

export default function WeeklyMaReclaimSection({
  rows,
  weekDate,
  title,
  subtitle,
  tableMissing = false,
  multiHitCodes,
}: Props) {
  const [sector, setSector] = useState<string>('all')
  const [sortKey, setSortKey] = useState<string>(SORTS[0].key)

  const sectorOptions = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) if (r.sector_s33) set.add(r.sector_s33)
    return [...set].sort((a, b) => a.localeCompare(b, 'ja'))
  }, [rows])

  const filtered = useMemo(
    () => rows.filter(r => sector === 'all' || (r.sector_s33 ?? '') === sector),
    [rows, sector],
  )

  // daily_stage ごとのグループ（順番は TradingView のリスト「Weekly MA Reclaim」と同じ）。
  // 想定外の値・null は「段階なし」として最後に置く。
  const groups = useMemo(() => {
    const def = SORTS.find(s => s.key === sortKey) ?? SORTS[0]
    const known = new Set<string>(DAILY_STAGES)
    const buckets = new Map<string, WeeklyMaReclaimRow[]>()
    for (const r of filtered) {
      const k = r.daily_stage && known.has(r.daily_stage) ? r.daily_stage : UNKNOWN_STAGE
      const list = buckets.get(k)
      if (list) list.push(r)
      else buckets.set(k, [r])
    }
    return [...DAILY_STAGES, UNKNOWN_STAGE]
      .filter(k => buckets.has(k))
      .map(k => ({ stage: k, rows: [...(buckets.get(k) ?? [])].sort(def.compare) }))
  }, [filtered, sortKey])

  const [positionTarget, setPositionTarget] = useState<Partial<Trade> | null>(null)

  function toPosition(r: WeeklyMaReclaimRow): Partial<Trade> {
    return {
      ticker: r.code,
      company_name: r.co_name ?? undefined,
      sector_s33: r.sector_s33 ?? undefined,
      screen_name: 'Weekly MA Reclaim',
      signal_price: r.close ?? undefined,
    }
  }

  const selectClass =
    'text-caption px-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] cursor-pointer'

  return (
    <section className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-4">
      <div className="flex items-baseline gap-2 flex-wrap mb-1">
        <h2 className="text-title font-medium text-[var(--text-primary)]">{title}</h2>
        <span
          className="px-1.5 py-0.5 rounded text-caption font-medium font-mono tabular-nums border border-[var(--border-strong)] text-[var(--text-primary)]"
          title={weekDate ? `${weekDate}（週の最後の営業日）までの週。日次のセクションとは日付が違う` : '週次テーブル'}
        >
          {weekDate ? `${shortDate(weekDate)} 週` : '— 週'}
        </span>
        <span className="text-caption text-[var(--text-muted)]">
          <span className="font-mono">{filtered.length} / {rows.length}</span> 銘柄
        </span>
      </div>
      <p className="text-caption text-[var(--text-secondary)] mb-3">{subtitle}</p>

      {/* フィルタ / ソート */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select value={sector} onChange={e => setSector(e.target.value)} className={selectClass}>
          <option value="all">全セクター</option>
          {sectorOptions.map(s => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <span className="ml-auto flex items-center gap-1.5">
          <span className="text-caption text-[var(--text-muted)]">並び:</span>
          <select value={sortKey} onChange={e => setSortKey(e.target.value)} className={selectClass}>
            {SORTS.map(s => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </span>
      </div>

      {tableMissing ? (
        <div className="py-8 text-center text-small text-[var(--text-muted)]">
          <p className="font-medium text-[var(--text-secondary)]">
            <code className="font-mono">weekly_ma_reclaim</code> テーブルがまだ Supabase にありません。
          </p>
          <p className="mt-1 text-caption">配信側（jquants-scanner）の DDL 実行待ちです。エラーではありません。</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-8 text-center text-small text-[var(--text-muted)]">
          {rows.length === 0 ? '該当なし。' : '絞り込み条件に一致する銘柄がありません。'}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(g => (
            <div key={g.stage}>
              <h3
                className="mb-2 text-small font-medium text-[var(--text-primary)] flex items-baseline gap-2"
                title={STAGE_TITLE[g.stage as DailyStage] ?? 'daily_stage が無い行'}
              >
                <span className="font-mono">{g.stage}</span>
                <span className="text-caption text-[var(--text-muted)] font-mono tabular-nums">{g.rows.length}</span>
              </h3>
              <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
                {g.rows.map(r => (
                  <WeeklyMaReclaimCard
                    key={r.code}
                    row={r}
                    multiHit={multiHitCodes.has(r.code)}
                    onAddPosition={row => setPositionTarget(toPosition(row))}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <PositionModal
        open={positionTarget !== null}
        onClose={() => setPositionTarget(null)}
        onSaved={() => setPositionTarget(null)}
        initial={positionTarget ?? undefined}
      />
    </section>
  )
}
