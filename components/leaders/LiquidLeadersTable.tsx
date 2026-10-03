'use client'

// 1 段 (大型 / 中小) の一覧。t21 と t63 を横に並べ、それぞれに 5 日比を添える。
// t63 の右に t21 − t63 (直近の勢いと 3 か月の強さのずれ)、補足の代金の勢い (va_trend) を置き、
// 最後に t21 / t63 の一覧に入った日を 1 列ずつ並べる。
// 代金の勢いは「高い = 良い」ではない (高いほどその後 3 か月の伸びが小さい傾向) ので色を付けない。
// 「t63 は高いが t21 は落ちてきた」というずれが一目で読めるのがこの表の読みどころ。
//
// 色は 5 日比 (括弧の中) だけ: +0.1 以上 緑 / −0.1 以下 赤 / それ以外・新規 灰。
// t の値そのものは、その期間の一覧に入っていれば普通の文字、入っていなければ灰色。

import { useMemo } from 'react'
import {
  byListOrder,
  diffColor,
  fmtDiff,
  tDiff,
  type LiquidLeader,
  type LiquidPeriod,
} from '@/types/liquidLeaders'
import DataTable, { type Column } from '@/components/shared/DataTable'
import TickerCell from '@/components/shared/TickerCell'

// 'YYYY-MM-DD' → 'M/D'
function md(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`
}

// 入る線は段ごとに違う (大型 2.0 / 中小 1.5)
function tNote(enter: number): string {
  const e = enter.toFixed(1)
  return `この段は t が ${e} 以上で一覧に入り、入った後の最高値から 1 下がるまで残る。そのため ${e} 未満の銘柄も一覧にいる。括弧内は 5 営業日前からの増減（5 営業日前に一覧にいなければ「新規」）`
}

function TCell({
  row,
  period,
  prev,
}: {
  row: LiquidLeader
  period: LiquidPeriod
  /** 5 営業日前の行 (code → row)。null = 比べる日が無い / undefined = 読み込み中 */
  prev: Map<string, LiquidLeader> | null | undefined
}) {
  const v = period === 't21' ? row.t21 : row.t63
  const inList = (period === 't21' ? row.in_t21 : row.in_t63) === true
  if (v === null || !Number.isFinite(v)) return <span className="text-[var(--sem-idle-fg)]">—</span>
  const d = prev ? tDiff(v, prev.get(row.code), period) : null
  return (
    <span className="num whitespace-nowrap">
      <span style={{ color: inList ? 'var(--text-primary)' : 'var(--text-muted)' }}>
        {v.toFixed(2)}
      </span>
      <span className="text-caption ml-1" style={{ color: diffColor(d) }}>
        ({prev === undefined ? '…' : fmtDiff(d)})
      </span>
    </span>
  )
}

function num(v: number | null | undefined): number | null {
  return v !== null && v !== undefined && Number.isFinite(v) ? v : null
}

function gapOf(r: LiquidLeader): number | null {
  const a = r.t21
  const b = r.t63
  return a !== null && b !== null && Number.isFinite(a) && Number.isFinite(b) ? a - b : null
}

function sinceOf(r: LiquidLeader, period: LiquidPeriod): string | null {
  return period === 't21' ? (r.in_t21 ? r.t21_since : null) : r.in_t63 ? r.t63_since : null
}

type Props = {
  rows: LiquidLeader[]
  prev: Map<string, LiquidLeader> | null | undefined
  title: string
  hint: string
  /** この段の一覧に入る t の線 */
  enter: number
  query: string
}

export default function LiquidLeadersTable({ rows, prev, title, hint, enter, query }: Props) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      r => r.code.toLowerCase().includes(q) || (r.co_name ?? '').toLowerCase().includes(q),
    )
  }, [rows, query])

  const columns: Column<LiquidLeader>[] = useMemo(
    () => [
      {
        key: 'code',
        label: 'Code / Name',
        tooltip: 'コード → TradingView / 銘柄名 → 四季報',
        align: 'left',
        value: r => r.code,
        defaultDir: 'asc',
        render: r => (
          <div className="max-w-[9rem]">
            <TickerCell code={r.code} name={r.co_name} />
          </div>
        ),
      },
      {
        key: 'sector_s33',
        label: '業種',
        tooltip: '東証 33 業種（五十音順ソート）',
        align: 'left',
        value: r => r.sector_s33,
        defaultDir: 'asc',
        render: r => (
          <span className="block max-w-[5.5rem] truncate text-small text-[var(--text-secondary)]" title={r.sector_s33 ?? undefined}>
            {r.sector_s33 ?? '—'}
          </span>
        ),
      },
      {
        key: 't21',
        label: (
          <span className="inline-block leading-tight">
            t21
            <br />
            <span className="font-normal">(5日比)</span>
          </span>
        ),
        tooltip: `自力の t 値（直近 21 日）。TOPIX につられた分を除いた強さが毎日どれだけ安定しているか。2 以上で強い。${tNote(enter)}`,
        align: 'right',
        value: r => r.t21,
        render: r => <TCell row={r} period="t21" prev={prev} />,
      },
      {
        key: 't63',
        label: (
          <span className="inline-block leading-tight">
            t63
            <br />
            <span className="font-normal">(5日比)</span>
          </span>
        ),
        tooltip: `自力の t 値（直近 63 日）。2 以上で強い。${tNote(enter)}。並べ替えは t63 の一覧にいる銘柄が先`,
        align: 'right',
        // t63 の一覧にいない銘柄は null 扱いで後ろへ (tieBreak で t21 の高い順)
        value: r => (r.in_t63 ? r.t63 : null),
        render: r => <TCell row={r} period="t63" prev={prev} />,
      },
      {
        key: 'gap',
        label: (
          <span className="inline-block leading-tight">
            t21
            <br />
            −t63
          </span>
        ),
        tooltip:
          't21 − t63。プラス = 直近 1 か月の強さが 3 か月の強さを上回っている（勢いが増している）、マイナス = 3 か月の先導に比べて直近は勢いが落ちている',
        align: 'right',
        value: gapOf,
        render: r => {
          const g = gapOf(r)
          if (g === null) return <span className="text-[var(--sem-idle-fg)]">—</span>
          const v = Math.round(g * 100) / 100
          return (
            <span className="num text-[var(--text-secondary)]">
              {v === 0 ? '±0.00' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`}
            </span>
          )
        },
      },
      {
        key: 'va_trend',
        label: (
          <span className="inline-block leading-tight">
            代金
            <br />
            <span className="font-normal">勢い</span>
          </span>
        ),
        tooltip:
          '代金の勢い = 直近 20 日の売買代金の平均 ÷ 前日までの 60 日の代金の中央値。1.0 = いつもどおり、2.0 = いつもの倍。高いほど「商いが膨らんで一覧に入った」銘柄で、一覧には長く残るが、その後 3 か月の伸びは小さい傾向がある（10 年の検証で一貫）。高い = 良い、ではない',
        align: 'right',
        value: r => num(r.va_trend),
        render: r => {
          const v = num(r.va_trend)
          return v === null ? (
            <span className="text-[var(--sem-idle-fg)]">—</span>
          ) : (
            <span className="num text-[var(--text-secondary)]">{v.toFixed(2)}×</span>
          )
        },
      },
      ...(['t21', 't63'] as const).map(
        (k): Column<LiquidLeader> => ({
          key: `${k}_since`,
          label: (
            <span className="inline-block leading-tight">
              入った日
              <br />
              <span className="font-normal">({k})</span>
            </span>
          ),
          tooltip: `${k} の一覧に今回入った日。${k} の一覧にいなければ —`,
          align: 'right',
          value: r => sinceOf(r, k),
          render: r => {
            const d = sinceOf(r, k)
            return d ? (
              <span className="text-caption num whitespace-nowrap text-[var(--text-secondary)]" title={`${k} の一覧に入った日: ${d}`}>
                {md(d)}
              </span>
            ) : (
              <span className="text-[var(--sem-idle-fg)]">—</span>
            )
          },
        }),
      ),
    ],
    [prev, enter],
  )

  return (
    <section className="min-w-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
        <h2 className="text-small font-medium text-[var(--text-primary)]">{title}</h2>
        <span className="text-caption text-[var(--text-muted)]">{hint}</span>
        <span className="ml-auto text-caption text-[var(--text-muted)]">
          <span className="num">{filtered.length}</span> 銘柄
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-[var(--bg-card)] rounded-xl border-[0.5px] border-[var(--border)] py-8 text-center text-[var(--text-muted)] text-small">
          {query ? `「${query}」に一致する銘柄はありません` : '該当なし'}
        </div>
      ) : (
        <DataTable
          rows={filtered}
          columns={columns}
          rowKey={r => r.code}
          defaultSort={{ key: 't63', dir: 'desc' }}
          tieBreak={byListOrder}
          summaryToggle={false}
        />
      )}
    </section>
  )
}
