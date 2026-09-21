'use client'

import { useMemo, useState } from 'react'
import type { InsideDaySetupRow } from '@/types/insideDay'
import {
  MARKETS,
  distToMotherHighPct,
  distToMotherLowPct,
  isCloseAdjustmentMismatch,
} from '@/types/insideDay'
import type { Trade } from '@/types/trades'
import DataTable, { type Column } from '@/components/shared/DataTable'
import TickerCell from '@/components/shared/TickerCell'
import CopyTickerButton from '@/components/shared/CopyTickerButton'
import PositionModal from '@/components/portfolio/PositionModal'
import InsideDayBand from './InsideDayBand'
import { formatPct } from '@/lib/format'

type Props = {
  rows: InsideDaySetupRow[]
  /** このセクションが実際に表示している date（テーブルの最大値、または選択日以前の直近日）。 */
  date: string | null
  hotSectors: string[]
  /**
   * 本日 Structure Pivot / EMA Setups にも出た銘柄の code。
   * この表の行数は他スキャナーより一桁多い（最多 204 件/日）ので、inside_day 自体は
   * 複数スキャナー重複（multiHitCodes）の数え上げに入れない。ここでは「他にも出ている」
   * という事実の印を付けるだけに留める（0choir17 と確認済み）。
   */
  alsoHitCodes: Set<string>
  title: string
  subtitle: string
  /** inside_day_setups の DDL が未実行（テーブル未配備）。「0 件の日」と区別して案内する。 */
  tableMissing?: boolean
}

function isNum(v: number | null | undefined): v is number {
  return v !== null && v !== undefined && Number.isFinite(v)
}

function fmt(v: number | null | undefined, decimals = 1): string {
  return isNum(v) ? v.toFixed(decimals) : '—'
}

function fmtPrice(v: number | null | undefined): string {
  return isNum(v) ? v.toLocaleString('ja-JP', { maximumFractionDigits: 1 }) : '—'
}

function fmtSignedPct(v: number | null | undefined, decimals = 1): string {
  return formatPct(v, { digits: decimals, sign: true })
}

// rs (0–100, 高いほど強い)。他セクションと同じ配色。
function rsColor(v: number | null): string {
  if (!isNum(v)) return 'var(--text-muted)'
  if (v >= 80) return 'var(--positive)'
  if (v >= 60) return 'var(--accent)'
  if (v >= 40) return 'var(--text-secondary)'
  return 'var(--negative)'
}

// 値幅のスライダー。range_pct は中央値 57（p25 46 / p75 69）。
// 100 = フィルタなし（既定）。配信側は上限を掛けずに全件出しているので既定は必ず「なし」。
const RANGE_MIN = 10
const RANGE_MAX = 100
const RANGE_STEP = 5

// RS 下限スライダー。0 = フィルタなし（既定）。
const RS_STEP = 5
const RS_MAX = 90

// 1 ページの行数。件数は日によって 2〜204 件と振れるので、行数に関わらず高さを保つ。
const PAGE_SIZE = 100

export default function InsideDaySection({
  rows,
  date,
  hotSectors,
  alsoHitCodes,
  title,
  subtitle,
  tableMissing = false,
}: Props) {
  const [market, setMarket] = useState<string>('all')
  const [sector, setSector] = useState<string>('all')
  const [streakOnly, setStreakOnly] = useState(false)
  const [rangeMax, setRangeMax] = useState(RANGE_MAX)
  const [rsMin, setRsMin] = useState(0)

  const hotSet = useMemo(() => new Set(hotSectors), [hotSectors])

  const sectorOptions = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) if (r.sector_s33) set.add(r.sector_s33)
    return [...set].sort((a, b) => a.localeCompare(b, 'ja'))
  }, [rows])

  // 市場の選択肢は実データに出たものだけ（配信側の表記ゆれを拾わないよう MARKETS 順に並べる）。
  const marketOptions = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) if (r.market) set.add(r.market)
    const known = MARKETS.filter(m => set.has(m))
    const rest = [...set].filter(m => !(MARKETS as readonly string[]).includes(m)).sort()
    return [...known, ...rest]
  }, [rows])

  // 絞り込みはすべて既定「なし」。配信側が意図的に掛けていない条件なので、
  // 使う / 使わないはこの画面で選ぶ。
  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (market !== 'all' && (r.market ?? '') !== market) return false
      if (sector !== 'all' && (r.sector_s33 ?? '') !== sector) return false
      if (streakOnly && !(isNum(r.inside_streak) && r.inside_streak >= 2)) return false
      if (rangeMax < RANGE_MAX && !(isNum(r.range_pct) && r.range_pct <= rangeMax)) return false
      if (rsMin > 0 && !(isNum(r.rs_topix_avg) && r.rs_topix_avg >= rsMin)) return false
      return true
    })
  }, [rows, market, sector, streakOnly, rangeMax, rsMin])

  const [positionTarget, setPositionTarget] = useState<Partial<Trade> | null>(null)

  function toPosition(r: InsideDaySetupRow): Partial<Trade> {
    return {
      ticker: r.code,
      company_name: r.co_name ?? undefined,
      sector_s33: r.sector_s33 ?? undefined,
      screen_name: 'Inside Day',
      rs_at_entry: r.rs_topix_avg ?? undefined,
      signal_price: r.close ?? undefined,
    }
  }

  // 列は「事実」だけ。スコア / グレード / 総合順位に当たる列は作らない。
  const columns: Column<InsideDaySetupRow>[] = useMemo(
    () => [
      {
        key: 'code',
        label: 'Code / Name',
        align: 'left',
        value: r => r.code,
        defaultDir: 'asc',
        render: r => (
          <div className="flex items-center gap-1.5 min-w-0">
            <TickerCell code={r.code} name={r.co_name} />
            {alsoHitCodes.has(r.code) && (
              <span
                className="flex-shrink-0 px-1 py-0.5 rounded text-caption whitespace-nowrap"
                style={{
                  backgroundColor: 'var(--sem-watch-bg)',
                  color: 'var(--sem-watch-fg)',
                  border: '0.5px solid var(--sem-watch-bd)',
                }}
                title="本日 Structure Pivot / EMA Setups にも出ている銘柄"
              >
                他シグナル
              </span>
            )}
          </div>
        ),
      },
      {
        key: 'market',
        label: '市場',
        align: 'left',
        value: r => r.market,
        defaultDir: 'asc',
        render: r => (
          <span className="text-caption text-[var(--text-secondary)] whitespace-nowrap">
            {r.market ?? '—'}
          </span>
        ),
      },
      {
        key: 'sector',
        label: 'Sector',
        tooltip: '東証33業種。セクター選定（composite_score ≥ 60）に入っている業種は緑',
        align: 'left',
        value: r => r.sector_s33,
        defaultDir: 'asc',
        render: r => (
          <span
            className="text-small truncate"
            style={{
              color:
                r.sector_s33 != null && hotSet.has(r.sector_s33)
                  ? 'var(--positive)'
                  : 'var(--text-secondary)',
            }}
            title={r.sector_s33 ?? ''}
          >
            {r.sector_s33 ?? '—'}
          </span>
        ),
      },
      {
        key: 'close',
        label: 'Close',
        tooltip: '当日終値（生の株価）',
        value: r => r.close,
        render: r => <span className="font-mono tabular-nums">{fmtPrice(r.close)}</span>,
      },
      {
        key: 'mother',
        label: 'マザーバー 安値〜高値',
        tooltip:
          '前日の足の安値〜高値。翌日以降はこの 2 本の水平線を上抜けるか割るかを見る。高値・安値は分割調整済み',
        sortable: false,
        render: r => (
          <span className="font-mono tabular-nums whitespace-nowrap text-[var(--text-secondary)]">
            {fmtPrice(r.mother_low)} 〜 {fmtPrice(r.mother_high)}
          </span>
        ),
      },
      {
        key: 'today',
        label: '当日 安値〜高値',
        tooltip: 'インサイドデー当日の安値〜高値（ヒゲ込み）。厳密にマザーバーの内側に収まっている',
        sortable: false,
        render: r => (
          <span className="font-mono tabular-nums whitespace-nowrap">
            {fmtPrice(r.low)} 〜 {fmtPrice(r.high)}
          </span>
        ),
      },
      {
        key: 'band',
        label: '帯',
        tooltip:
          'マザーバーの値幅（薄い枠）の中で当日の値幅（濃い帯）がどこに寄って縮んだか。縦線は終値の位置',
        align: 'center',
        sortable: false,
        render: r => <InsideDayBand row={r} />,
      },
      {
        key: 'range',
        label: '収縮%',
        tooltip:
          '当日値幅 ÷ 前日値幅 × 100。定義上 0〜100 未満で、小さいほど強く縮んだ。良し悪しの順位ではない（中央値 57 / p25 46 / p75 69）',
        value: r => r.range_pct,
        defaultDir: 'asc',
        render: r => <span className="font-mono tabular-nums">{fmt(r.range_pct, 0)}</span>,
      },
      {
        key: 'streak',
        label: '連続',
        tooltip: '当日を含む連続インサイド日数。1 = 単発。2 以上は全体の約 5%',
        align: 'center',
        value: r => r.inside_streak,
        render: r =>
          isNum(r.inside_streak) && r.inside_streak >= 2 ? (
            <span
              className="px-1.5 py-0.5 rounded text-caption font-mono tabular-nums whitespace-nowrap"
              style={{
                backgroundColor: 'var(--sem-idle-bg)',
                color: 'var(--sem-idle-fg)',
                border: '0.5px solid var(--sem-idle-bd)',
              }}
              title={`${r.inside_streak} 日続けてインサイドデー`}
            >
              連続{r.inside_streak}日
            </span>
          ) : (
            <span className="font-mono tabular-nums text-[var(--text-muted)]">
              {isNum(r.inside_streak) ? r.inside_streak : '—'}
            </span>
          ),
      },
      {
        key: 'toHigh',
        label: '高値まで%',
        tooltip:
          '終値からマザーバー高値までの距離 (mother_high ÷ close − 1) × 100。DB には無い計算列。分割で終値と高値の桁がずれる行は「—」',
        value: r => distToMotherHighPct(r),
        defaultDir: 'asc',
        render: r => {
          const v = distToMotherHighPct(r)
          return (
            <span className="font-mono tabular-nums">
              {v === null ? '—' : formatPct(v, { digits: 1 })}
            </span>
          )
        },
      },
      {
        key: 'rs',
        label: 'RS',
        tooltip: '対TOPIX RS 平均（21/63/126d）0-100',
        value: r => r.rs_topix_avg,
        render: r => (
          <span className="font-mono tabular-nums" style={{ color: rsColor(r.rs_topix_avg) }}>
            {fmt(r.rs_topix_avg, 0)}
          </span>
        ),
      },
    ],
    [alsoHitCodes, hotSet],
  )

  // 一覧に置かない数値（横断比較ではなく 1 銘柄を決めるための数値）は詳細行へ。
  const renderDetail = (r: InsideDaySetupRow) => (
    <div className="flex flex-col gap-2">
      <dl className="grid gap-x-6 gap-y-1.5 grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
        {[
          { label: 'ADR%（20日）', value: fmt(r.adr_pct) },
          {
            label: '売買代金（20日平均）',
            value: isNum(r.turnover_oku) ? `${r.turnover_oku.toFixed(1)}億` : '—',
          },
          {
            label: '出来高（20日平均）',
            value: isNum(r.vol_ma20_man) ? `${r.vol_ma20_man.toFixed(1)}万株` : '—',
          },
          { label: '出来高比（対20日平均）', value: fmt(r.vol_ratio, 2) },
          { label: '52週高値からの乖離', value: fmtSignedPct(r.dist_from_high_pct) },
          { label: '150SMA からの乖離', value: fmtSignedPct(r.ext_sma150_pct) },
          {
            label: '安値まで%',
            value: (() => {
              const v = distToMotherLowPct(r)
              return v === null ? '—' : formatPct(v, { digits: 1, sign: true })
            })(),
          },
        ].map(item => (
          <div key={item.label} className="flex items-baseline justify-between gap-2">
            <dt className="text-caption text-[var(--text-muted)] whitespace-nowrap">{item.label}</dt>
            <dd className="text-body font-mono tabular-nums">{item.value}</dd>
          </div>
        ))}
      </dl>

      {isCloseAdjustmentMismatch(r) && (
        <p className="text-caption text-[var(--text-secondary)]">
          終値（生の株価）と高値・安値（分割調整済み）の桁が合いません。直近 5 営業日の間に
          株式分割があった銘柄です。終値を基準にした距離（高値まで% / 安値まで%）と帯の中の
          終値マーカーは出していません。
        </p>
      )}

      <div className="flex items-center justify-end gap-1.5">
        {/* ウォッチリストの管理は TradingView 側。ここからできるのは
            TradingView に貼れる形でティッカーを渡すことまで。 */}
        <CopyTickerButton code={r.code} />
        <button
          onClick={() => setPositionTarget(toPosition(r))}
          className="px-2 py-1 text-caption font-medium text-[var(--sem-strong-fg)] bg-[var(--sem-ok-bg)] hover:brightness-95 border border-[var(--sem-strong-bd)] rounded transition-colors"
          title="Position として保存"
        >
          ＋ Position
        </button>
      </div>
    </div>
  )

  const selectClass =
    'text-caption px-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] cursor-pointer'

  return (
    <section className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-4">
      <div className="flex items-baseline gap-2 flex-wrap mb-1">
        <h2 className="text-title font-medium text-[var(--text-primary)]">{title}</h2>
        <span className="text-caption text-[var(--text-muted)]">
          <span className="font-mono">
            {filtered.length} / {rows.length}
          </span>{' '}
          銘柄
        </span>
        {date && (
          <span
            className="text-caption text-[var(--text-muted)] font-mono"
            title="inside_day_setups の最大 date。引け後に更新される"
          >
            更新日 {date}
          </span>
        )}
      </div>
      <p className="text-caption text-[var(--text-secondary)] mb-3">{subtitle}</p>

      {/* 絞り込み。いずれも既定は「なし」。配信側はこれらを意図的に掛けていない。 */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select value={market} onChange={e => setMarket(e.target.value)} className={selectClass}>
          <option value="all">全市場</option>
          {marketOptions.map(m => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <select value={sector} onChange={e => setSector(e.target.value)} className={selectClass}>
          <option value="all">全セクター</option>
          {sectorOptions.map(s => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <button
          onClick={() => setStreakOnly(v => !v)}
          className={`text-caption font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${
            streakOnly
              ? 'bg-[var(--sem-watch-fg)] text-white border-[var(--sem-watch-bd)]'
              : 'bg-[var(--bg-card)] text-[var(--sem-watch-fg)] border-[var(--sem-watch-bd)] hover:bg-[var(--sem-watch-bg)]'
          }`}
          title="当日を含めて 2 日以上続けてインサイドデーになった銘柄だけ表示（全体の約 5%）"
        >
          連続2日以上
        </button>

        <label
          className="flex items-center gap-1.5 text-caption text-[var(--text-muted)]"
          title="当日値幅 ÷ 前日値幅（%）の上限。50 以下なら前日の半分以下まで縮んだ日だけが残る。配信側は上限を掛けずに全件出しているので既定は「なし」"
        >
          <span className="whitespace-nowrap">収縮% ≤</span>
          <input
            type="range"
            min={RANGE_MIN}
            max={RANGE_MAX}
            step={RANGE_STEP}
            value={rangeMax}
            onChange={e => setRangeMax(Number(e.target.value))}
            className="w-24 cursor-pointer"
            aria-label="収縮% の上限"
          />
          <span className="font-mono w-8 tabular-nums">
            {rangeMax >= RANGE_MAX ? 'なし' : rangeMax}
          </span>
        </label>

        <label
          className="flex items-center gap-1.5 text-caption text-[var(--text-muted)]"
          title="対TOPIX RS の下限。配信側は下限を掛けずに全件出しているので既定は「なし」"
        >
          <span className="whitespace-nowrap">RS ≥</span>
          <input
            type="range"
            min={0}
            max={RS_MAX}
            step={RS_STEP}
            value={rsMin}
            onChange={e => setRsMin(Number(e.target.value))}
            className="w-24 cursor-pointer"
            aria-label="RS 下限"
          />
          <span className="font-mono w-8 tabular-nums">{rsMin === 0 ? 'なし' : rsMin}</span>
        </label>
      </div>

      {tableMissing ? (
        <div className="py-8 text-center text-small text-[var(--text-muted)]">
          <p className="font-medium text-[var(--text-secondary)]">
            <code className="font-mono">inside_day_setups</code> テーブルがまだ Supabase にありません。
          </p>
          <p className="mt-1 text-caption">
            配信側（jquants-scanner）の DDL 実行待ちです。エラーではありません。
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-8 text-center text-small text-[var(--text-muted)]">
          {rows.length === 0 ? '本日は該当なし。' : '絞り込み条件に一致する銘柄がありません。'}
        </div>
      ) : (
        <DataTable
          rows={filtered}
          columns={columns}
          rowKey={r => r.code}
          // 既定は収縮%（range_pct）の昇順 = 値幅がより縮んだ順。
          // 「収縮の度合い」という事実の並びであって、強い順・おすすめ順ではない。
          defaultSort={{ key: 'range', dir: 'asc' }}
          // 同じ収縮%が並んだときはコード順で固定し、再描画のたびに入れ替わらないようにする。
          tieBreak={(a, b) => a.code.localeCompare(b.code)}
          renderDetail={renderDetail}
          summaryToggle={false}
          pageSize={PAGE_SIZE}
        />
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
