'use client'

// 表の共通実装。
//
// ソート state が 9 コンポーネントに散り、SortTh が 3 箇所に重複していたのを
// ここに集約する。DESIGN_DIRECTION.md §5.2 の 4 点を担当する:
//
//   1. 列見出しのソート UI（↑ / ↓ / ↕、ソート中は --sem-focus）
//   2. NULL を昇順・降順いずれでも末尾に置くソート規則
//   3. グループ化と折りたたみ
//   4. 要約 / 全列トグルと詳細行
//
// 設計原則との対応:
//   - 一覧は比較のため、詳細は決断のため（原則 3）
//     → 横断比較しない数値は summary: false にして詳細行へ落とす
//   - 面は静止する（原則 2）→ ホバーは背景色の変化のみ
//   - 階層は余白と文字サイズで作る（原則 4）→ 罫線は 0.5px の 1 種類だけ

import { Fragment, useMemo, useState, type ReactNode } from 'react'
import SortTh, { compareValues, type SortDirection } from '@/components/shared/SortTh'

export type Column<Row> = {
  /** ソートキー兼 React key。 */
  key: string
  label: ReactNode
  /** ホバーで出す説明。 */
  tooltip?: string
  align?: 'left' | 'right' | 'center'
  /** ソート対象外にする列（表示専用）。 */
  sortable?: boolean
  /** ソートに使う値。省略時はソート不可として扱う。 */
  value?: (row: Row) => string | number | null
  /** その列を初めて選んだときの向き。順位や名前は昇順で見たいので 'asc' を指定する。 */
  defaultDir?: SortDirection
  render: (row: Row) => ReactNode
  /**
   * 要約ビューに出すか。false の列は詳細行にだけ現れる。
   * 「22 行を横断比較するための数値か、1 銘柄を決めるための数値か」で分ける。
   */
  summary?: boolean
  /** セルに足すクラス（幅の指定など）。 */
  className?: string
}

type Group<Row> = { key: string; rows: Row[] }

type Props<Row> = {
  rows: Row[]
  columns: Column<Row>[]
  rowKey: (row: Row) => string
  defaultSort: { key: string; dir: SortDirection }

  /** グループ化するとき。省略すると単純な 1 枚の表になる。 */
  groupBy?: (row: Row) => string
  /** グループの並び順。省略すると出現順。 */
  groupRank?: (groupKey: string) => number
  /** グループ見出しの中身（バッジではなくラベル + 件数を想定）。 */
  renderGroupHeader?: (groupKey: string, count: number) => ReactNode
  /** 既定で畳んでおくグループ。 */
  defaultCollapsed?: string[]

  /**
   * 行の左端に引くレール（重みの表現）。色を返すと 2px のレールが出る。
   * 塗りのバッジの代わりに、面積の小さいレールで重みを示す。
   */
  rail?: (row: Row) => string | null

  /** 詳細行に出す追加の中身（summary:false の列の下に置かれる）。 */
  renderDetail?: (row: Row) => ReactNode
  /** 行全体のクリックで詳細を開閉する（専用ボタンを出さない）。 */
  expandOnRowClick?: boolean
  /** 行に足すクラス。信頼度の低い行を減光する、といった用途。 */
  rowClassName?: (row: Row) => string
  /** 全列ビューのときだけ必要な最小幅。要約ビューは min-w を持たない。 */
  fullMinWidth?: number
  /** 要約 / 全列トグルを出すか。false なら常に全列。 */
  summaryToggle?: boolean
}

export default function DataTable<Row>({
  rows,
  columns,
  rowKey,
  defaultSort,
  groupBy,
  groupRank,
  renderGroupHeader,
  defaultCollapsed = [],
  rail,
  renderDetail,
  expandOnRowClick = false,
  rowClassName,
  fullMinWidth,
  summaryToggle = true,
}: Props<Row>) {
  const [sortKey, setSortKey] = useState(defaultSort.key)
  const [sortDir, setSortDir] = useState<SortDirection>(defaultSort.dir)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(defaultCollapsed))
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [showAll, setShowAll] = useState(!summaryToggle)

  const hasSummary = columns.some(c => c.summary === false)
  const visible = showAll || !hasSummary ? columns : columns.filter(c => c.summary !== false)
  const hiddenInSummary = columns.filter(c => c.summary === false)
  // 詳細行を開けるのは、隠れている列があるか renderDetail があるとき。
  // renderDetail は列の出し分けとは独立した中身なので、全列ビューでも開ける。
  const detailAvailable = renderDetail != null || (!showAll && hiddenInSummary.length > 0)
  // 行クリックで開く場合は専用ボタンの列を作らない
  const detailButton = detailAvailable && !expandOnRowClick

  function handleSort(key: string) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir(columns.find(c => c.key === key)?.defaultDir ?? 'desc')
    }
  }

  function toggle(set: Set<string>, apply: (s: Set<string>) => void, key: string) {
    const next = new Set(set)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    apply(next)
  }

  const groups: Group<Row>[] = useMemo(() => {
    const col = columns.find(c => c.key === sortKey)
    const getValue = col?.value
    const cmp = (a: Row, b: Row) =>
      getValue ? compareValues(getValue(a), getValue(b), sortDir) : 0

    if (!groupBy) return [{ key: '', rows: [...rows].sort(cmp) }]

    const byKey = new Map<string, Row[]>()
    for (const r of rows) {
      const k = groupBy(r)
      const list = byKey.get(k)
      if (list) list.push(r)
      else byKey.set(k, [r])
    }
    const entries = [...byKey.entries()]
    if (groupRank) entries.sort((a, b) => groupRank(a[0]) - groupRank(b[0]))
    return entries.map(([key, list]) => ({ key, rows: [...list].sort(cmp) }))
  }, [rows, columns, sortKey, sortDir, groupBy, groupRank])

  const colSpan = visible.length + (detailButton ? 1 : 0)

  const body = (group: Group<Row>) =>
    group.rows.map(row => {
      const id = rowKey(row)
      const railColor = rail?.(row) ?? null
      const open = expanded.has(id)
      return (
        <Fragment key={id}>
          <tr
            onClick={expandOnRowClick && detailAvailable ? () => toggle(expanded, setExpanded, id) : undefined}
            className={`border-t-[0.5px] border-[var(--border)] hover:bg-[var(--bg-card-hover)] ${
              expandOnRowClick && detailAvailable ? 'cursor-pointer' : ''
            } ${rowClassName?.(row) ?? ''}`}
          >
            {visible.map((c, i) => (
              <td
                key={c.key}
                className={`px-2.5 py-2 ${
                  c.align === 'left' ? 'text-left' : c.align === 'center' ? 'text-center' : 'text-right'
                } ${i === 0 ? 'border-l-2' : ''} ${c.className ?? ''}`}
                style={i === 0 ? { borderLeftColor: railColor ?? 'transparent' } : undefined}
              >
                {c.render(row)}
              </td>
            ))}
            {detailButton && (
              <td className="px-2.5 py-2 text-right">
                <button
                  onClick={() => toggle(expanded, setExpanded, id)}
                  aria-expanded={open}
                  aria-label={open ? '詳細を閉じる' : '詳細を開く'}
                  className="text-caption text-[var(--sem-idle-fg)] hover:text-[var(--sem-focus-fg)]"
                >
                  {open ? '▲' : '▼'}
                </button>
              </td>
            )}
          </tr>

          {detailAvailable && open && (
            <tr className="border-t-[0.5px] border-[var(--border)] bg-[var(--bg-primary)]">
              <td colSpan={colSpan} className="px-4 py-3">
                {/* 一覧に置かなかった列を、決断のための面としてここに並べる */}
                {!showAll && hiddenInSummary.length > 0 && (
                  <dl className="grid gap-x-6 gap-y-1.5 grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
                    {hiddenInSummary.map(c => (
                      <div key={c.key} className="flex items-baseline justify-between gap-2">
                        <dt className="text-caption text-[var(--text-muted)] whitespace-nowrap">
                          {c.label}
                        </dt>
                        <dd className="text-body">{c.render(row)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {renderDetail?.(row)}
              </td>
            </tr>
          )}
        </Fragment>
      )
    })

  return (
    <>
      {hasSummary && summaryToggle && (
        <div className="flex justify-end mb-2">
          <div className="inline-flex rounded-lg border-[0.5px] border-[var(--border)] overflow-hidden text-caption">
            {([false, true] as const).map((all, i) => (
              <button
                key={String(all)}
                onClick={() => setShowAll(all)}
                className={`px-2.5 py-1 ${
                  showAll === all
                    ? 'bg-[var(--sem-focus-bg)] text-[var(--sem-focus-fg)]'
                    : 'bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)]'
                } ${i > 0 ? 'border-l-[0.5px] border-[var(--border)]' : ''}`}
              >
                {all ? `全 ${columns.length} 列` : '要約'}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bg-[var(--bg-card)] rounded-xl border-[0.5px] border-[var(--border)] overflow-x-auto">
        <table
          className="w-full text-body"
          style={showAll && fullMinWidth ? { minWidth: `${fullMinWidth}px` } : undefined}
        >
          <thead className="border-b-[0.5px] border-[var(--border)]">
            <tr>
              {visible.map(c =>
                c.value && c.sortable !== false ? (
                  <SortTh
                    key={c.key}
                    label={c.label}
                    tooltip={c.tooltip}
                    sortKey={c.key}
                    currentKey={sortKey}
                    currentDir={sortDir}
                    onSort={handleSort}
                    align={c.align}
                    className={c.className}
                  />
                ) : (
                  <th
                    key={c.key}
                    title={c.tooltip}
                    className={`px-2.5 py-2 text-caption tracking-wide text-[var(--text-muted)] whitespace-nowrap ${
                      c.align === 'left' ? 'text-left' : c.align === 'center' ? 'text-center' : 'text-right'
                    } ${c.className ?? ''}`}
                  >
                    {c.label}
                  </th>
                ),
              )}
              {detailButton && <th className="w-8" aria-label="詳細" />}
            </tr>
          </thead>

          {groups.map(group =>
            groupBy ? (
              <tbody
                key={group.key}
                className="border-b-[0.5px] border-[var(--border)] last:border-b-0"
              >
                <tr className="bg-[var(--bg-primary)]">
                  <td colSpan={colSpan} className="px-2.5 py-1.5">
                    <button
                      onClick={() => toggle(collapsed, setCollapsed, group.key)}
                      aria-expanded={!collapsed.has(group.key)}
                      className="inline-flex items-center gap-2 text-left"
                    >
                      <span
                        aria-hidden
                        className={`text-caption text-[var(--sem-idle-fg)] inline-block transition-transform ${
                          collapsed.has(group.key) ? '' : 'rotate-90'
                        }`}
                      >
                        ▶
                      </span>
                      {renderGroupHeader?.(group.key, group.rows.length) ?? (
                        <span className="text-caption tracking-wide text-[var(--text-secondary)]">
                          {group.key}
                          <span className="ml-2 text-[var(--text-muted)]">{group.rows.length}</span>
                        </span>
                      )}
                    </button>
                  </td>
                </tr>
                {!collapsed.has(group.key) && body(group)}
              </tbody>
            ) : (
              <tbody key={group.key}>{body(group)}</tbody>
            ),
          )}
        </table>
      </div>
    </>
  )
}
