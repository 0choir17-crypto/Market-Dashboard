'use client'

// 業種一覧 (最新日)。並びは self_t63 の高い順 (null = 所属 5 社未満の業種は最後)。
// 列: 業種・Self t63 (5 日差の矢印 + 注意の印)・Self t21・Med vs Idx・VA share z・VA up %・N (対象 / 全銘柄)。
// 行を開くと期間リターン / TOPIX 超過と空売り内訳。

import { useMemo, useState } from 'react'
import { SectorSelectionRow, isNum, SELF_T63_CAUTION, SELF_DIFF_STEP } from '@/types/sectorSelection'
import { SectorChangeInline } from './SectorChangeCells'
import type { SectorIndexChangeEntry } from '@/lib/sectorIndexChangeFetch'
import DataTable, { type Column } from '@/components/shared/DataTable'
import { CautionMark, DiffArrow, TValue, CAUTION_NOTE } from './SelfStrength'

function fmtPctPlain(v: number | null | undefined): string {
  return isNum(v) ? `${v.toFixed(0)}%` : '—'
}

// リターン/超過は DB が倍率−1（0.067 = +6.7%）なので ×100 で%化。
function fmtSignedPct(v: number | null | undefined, decimals = 1): string {
  if (!isNum(v)) return '—'
  const p = v * 100
  return `${p >= 0 ? '+' : ''}${p.toFixed(decimals)}%`
}

// 空売り比率は 0〜1 の割合なので ×100 で%化（符号なし）。
function fmtRatioPct(v: number | null | undefined, decimals = 1): string {
  return isNum(v) ? `${(v * 100).toFixed(decimals)}%` : '—'
}

// 売り代金（円）を億円で読みやすく。
function fmtOku(v: number | null | undefined): string {
  if (!isNum(v)) return '—'
  return `${(v / 1e8).toLocaleString('ja-JP', { maximumFractionDigits: 1 })}億`
}

function pctColor(v: number | null | undefined): string {
  if (!isNum(v) || v === 0) return 'var(--text-muted)'
  return v > 0 ? 'var(--positive)' : 'var(--negative)'
}

// 4期間（5/21/63/126d）× リターン/TOPIX超過 のミニ表
function ReturnsBlock({ row }: { row: SectorSelectionRow }) {
  const periods: {
    label: string
    ret: number | null | undefined
    exc: number | null | undefined
  }[] = [
    { label: '5d', ret: row.sector_index_ret_5d_s33, exc: row.sector_index_excess_5d_s33 },
    { label: '21d', ret: row.sector_index_ret_21d_s33, exc: row.sector_index_excess_21d_s33 },
    { label: '63d', ret: row.sector_index_ret_63d_s33, exc: row.sector_index_excess_63d_s33 },
    { label: '126d', ret: row.sector_index_ret_126d_s33, exc: row.sector_index_excess_126d_s33 },
  ]
  return (
    <div className="grid grid-cols-4 gap-2">
      {periods.map((p) => (
        <div
          key={p.label}
          className="rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1.5 text-center"
        >
          <p className="text-caption text-[var(--text-muted)] font-mono">{p.label}</p>
          <p className="text-small font-mono font-medium tabular-nums" style={{ color: pctColor(p.ret) }}>
            {fmtSignedPct(p.ret)}
          </p>
          <p className="text-caption font-mono tabular-nums" style={{ color: pctColor(p.exc) }}>
            <span className="text-[var(--text-muted)]">vs TPX </span>
            {fmtSignedPct(p.exc)}
          </p>
        </div>
      ))}
    </div>
  )
}

// ── 行を開いたときの中身。表の骨格（tr / td / colSpan）は DataTable が持つ。
function DrilldownBody({ row }: { row: SectorSelectionRow }) {
  return (
    <>
        {/* 期間リターン / TOPIX超過 */}
        <div>
          <p className="text-caption font-medium text-[var(--text-secondary)] mb-2">
            期間リターン / TOPIX超過 — {row.sector_name_s33}
            {row.sector_code_s33 && (
              <span className="ml-2 text-[var(--text-muted)] font-mono">[{row.sector_code_s33}]</span>
            )}
          </p>
          <ReturnsBlock row={row} />
        </div>

        {/* 空売り内訳（当日） */}
        <div className="mt-5">
          <div className="flex items-baseline gap-3 mb-2">
            <p className="text-caption font-medium text-[var(--text-secondary)]">空売り内訳（当日）</p>
            <p className="text-caption text-[var(--text-secondary)]">
              比率{' '}
              <span className="font-mono font-medium text-[var(--text-primary)]">
                {fmtRatioPct(row.sector_short_va_ratio_s33)}
              </span>
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-caption">
            <Stat label="空売り以外(円)" value={fmtOku(row.sector_sell_ex_short_va_s33)} />
            <Stat label="規制有 空売り(円)" value={fmtOku(row.sector_shrt_with_res_va_s33)} />
            <Stat label="規制無 空売り(円)" value={fmtOku(row.sector_shrt_no_res_va_s33)} />
          </div>
        </div>
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-dashed border-[var(--border)] py-0.5">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span className="font-mono tabular-nums text-[var(--text-primary)]">{value}</span>
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────
export default function SectorSelectionTable({
  rows,
  changes = {},
  diffs = {},
}: {
  rows: SectorSelectionRow[]
  /** sector_name_s33 → 1D / 1W / 1M / 6M / 1Y の騰落率（後着でもよい） */
  changes?: Record<string, SectorIndexChangeEntry>
  /** sector_name_s33 → self_t63 の 5 営業日前との差（履歴が後着でもよい） */
  diffs?: Record<string, number>
}) {
  // 既定で信頼度低を除外する
  const [hideLowConf, setHideLowConf] = useState(true)

  const filtered = useMemo(
    () => (hideLowConf ? rows.filter(r => r.confidence_low !== 1) : rows),
    [rows, hideLowConf],
  )

  const lowConfCount = rows.filter(r => r.confidence_low === 1).length
  const columns: Column<SectorSelectionRow>[] = useMemo(
    () => [
      {
        key: 'sector_name_s33',
        label: 'Sector',
        tooltip: 'TOPIX-33 業種名。行をクリックすると期間リターンと空売り内訳が開く',
        align: 'left' as const,
        value: (r: SectorSelectionRow) => r.sector_name_s33,
        defaultDir: 'asc' as const,
        render: (r: SectorSelectionRow) => (
          <div className="flex items-center gap-4 whitespace-nowrap">
            <span className="text-[var(--text-primary)]">
              {r.sector_name_s33}
              {r.confidence_low === 1 && (
                <span
                  className="ml-1.5 text-caption text-[var(--text-muted)]"
                  title="信頼度低: 銘柄数が少ないためノイズ大"
                >
                  低
                </span>
              )}
            </span>
            <span className="ml-auto">
              <SectorChangeInline entry={changes[r.sector_name_s33]} />
            </span>
          </div>
        ),
      },
      {
        key: 'self_t63',
        label: (
          <span className="inline-block leading-tight">
            Self t63
            <br />
            <span className="font-normal">(5d)</span>
          </span>
        ),
        tooltip: `業種の自力（TOPIX につられた分を除いた強さ・配当込み）の直近 63 営業日の t 値。主の列。${CAUTION_NOTE}。矢印は 5 営業日前との差（±${SELF_DIFF_STEP} 以上）。所属が 5 社未満の業種は —`,
        value: (r: SectorSelectionRow) => (isNum(r.self_t63) ? r.self_t63 : null),
        className: 'w-28',
        render: (r: SectorSelectionRow) => (
          <span className="inline-flex items-center justify-end gap-1.5 whitespace-nowrap">
            <CautionMark row={r} />
            <TValue v={r.self_t63} strong />
            <span className="w-2.5 inline-block text-left">
              <DiffArrow diff={diffs[r.sector_name_s33]} />
            </span>
          </span>
        ),
      },
      {
        key: 'self_t21',
        label: 'Self t21',
        tooltip: '同じく直近 21 営業日の t 値。直近 1 か月。回復・失速の確認用',
        value: (r: SectorSelectionRow) => (isNum(r.self_t21) ? r.self_t21 : null),
        render: (r: SectorSelectionRow) => <TValue v={r.self_t21} />,
      },
      {
        key: 'med_vs_idx_t21',
        label: (
          <span className="inline-block leading-tight">
            Med vs Idx
            <br />
            <span className="font-normal">t21</span>
          </span>
        ),
        tooltip: '業種内の中央値の銘柄が業種指数より強いかの t 値（21 日）。+ = 中小型が強い / − = 大型主導。状況の説明用（成績の予測には効かない）',
        value: (r: SectorSelectionRow) => (isNum(r.med_vs_idx_t21) ? r.med_vs_idx_t21 : null),
        render: (r: SectorSelectionRow) => <TValue v={r.med_vs_idx_t21} />,
      },
      {
        key: 'va_share21_z250',
        label: (
          <span className="inline-block leading-tight">
            VA share
            <br />
            <span className="font-normal">z250</span>
          </span>
        ),
        tooltip: '業種の代金シェア（21 日）が、その業種の普段（直近 250 営業日）より多いか（z 値）。+1 以上 = 普段より資金が集まっている。状況の説明用',
        value: (r: SectorSelectionRow) => (isNum(r.va_share21_z250) ? r.va_share21_z250 : null),
        render: (r: SectorSelectionRow) => <TValue v={r.va_share21_z250} />,
      },
      {
        key: 'va21_vs63_up_pct',
        label: (
          <span className="inline-block leading-tight">
            VA up
            <br />
            <span className="font-normal">21/63</span>
          </span>
        ),
        tooltip: '対象銘柄のうち、直近 21 営業日の平均代金が 63 営業日の平均代金の 1.2 倍を超える銘柄の割合。代金の増加が業種全体に広がっているか。状況の説明用',
        value: (r: SectorSelectionRow) => (isNum(r.va21_vs63_up_pct) ? r.va21_vs63_up_pct : null),
        render: (r: SectorSelectionRow) => (
          <span className="num text-[var(--text-secondary)]">{fmtPctPlain(r.va21_vs63_up_pct)}</span>
        ),
      },
      {
        key: 'n_stocks',
        label: (
          <span className="inline-block leading-tight">
            N
            <br />
            <span className="font-normal">対象</span>
          </span>
        ),
        tooltip: 'その日の業種の対象銘柄数（60 日売買代金の中央値で 1,000 位以内）。自力の値はこの銘柄で計算。少ない業種は値がぶれやすい',
        value: (r: SectorSelectionRow) => (isNum(r.n_stocks) ? r.n_stocks : null),
        className: 'w-14',
        render: (r: SectorSelectionRow) => (
          <span className="num text-[var(--text-secondary)]">{isNum(r.n_stocks) ? r.n_stocks : '—'}</span>
        ),
      },
      {
        key: 'sector_stock_count_s33',
        label: (
          <span className="inline-block leading-tight">
            N
            <br />
            <span className="font-normal">全銘柄</span>
          </span>
        ),
        tooltip: '業種に属する全銘柄数（売買代金の順位で絞る前）',
        value: (r: SectorSelectionRow) => r.sector_stock_count_s33,
        className: 'w-14',
        render: (r: SectorSelectionRow) => (
          <span className="num text-[var(--text-muted)]">{r.sector_stock_count_s33 ?? '—'}</span>
        ),
      },
    ],
    [changes, diffs],
  )

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 flex-wrap">
        <p className="text-small font-medium text-[var(--text-primary)]">業種の自力（self_t63 の高い順）</p>
        <label className="ml-auto flex items-center gap-2 text-caption text-[var(--text-secondary)] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={hideLowConf}
            onChange={e => setHideLowConf(e.target.checked)}
            className="accent-[var(--accent)]"
          />
          信頼度低を除外
          {lowConfCount > 0 && (
            <span className="text-[var(--text-muted)]">（<span className="font-mono">{lowConfCount}</span> 件）</span>
          )}
        </label>
        <span className="text-caption text-[var(--text-muted)]">
          <span className="num">{filtered.length}</span> セクター
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-[var(--bg-card)] rounded-xl border-[0.5px] border-[var(--border)] py-10 text-center text-[var(--text-muted)] text-small">
          データがありません
        </div>
      ) : (
        <DataTable
          rows={filtered}
          columns={columns}
          rowKey={r => r.sector_name_s33}
          defaultSort={{ key: 'self_t63', dir: 'desc' }}
          // 行のどこを押しても内訳が開く（専用ボタンは置かない）
          expandOnRowClick
          renderDetail={row => <DrilldownBody row={row} />}
          // 信頼度低（銘柄数が少なくノイズが大きい）は減光して沈める
          rowClassName={row => (row.confidence_low === 1 ? 'opacity-60' : '')}
          summaryToggle={false}
        />
      )}

      {/* Legend */}
      <div className="flex items-center justify-center gap-5 py-3 text-caption border-t border-[var(--border-subtle)] flex-wrap text-[var(--text-secondary)]">
        <span>
          <span className="font-medium text-[var(--sem-watch-fg)]">注意</span> = self_t63 ≤ {SELF_T63_CAUTION}（入る時期を遅らせる目安）
        </span>
        <span className="text-[var(--text-muted)]">|</span>
        <span>
          <span className="font-mono" style={{ color: 'var(--positive)' }}>↑</span>
          <span className="font-mono" style={{ color: 'var(--negative)' }}>↓</span>
          {` self_t63 の 5 営業日前との差（±${SELF_DIFF_STEP} 以上）`}
        </span>
        <span className="text-[var(--text-muted)]">|</span>
        <span>Med vs Idx / VA share / VA up は状況の説明用（成績の予測には効かない）</span>
        <span className="text-[var(--text-muted)]">|</span>
        <span>所属 5 社未満の業種は —（並びの最後）</span>
      </div>
    </div>
  )
}
