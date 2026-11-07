'use client'

// Journal の成績カード（JournalSummary）と R 分布（RDistribution）、基準の切り替え。
// 勝率ではなく期待値（平均 R）・R 分布・上位依存度・保有日数の非対称性・連敗を見る。
// R は「損切り基準」と「ATR 基準」を切り替えて別々に集計する（混ぜない）。

import Tooltip from '@/components/shared/Tooltip'
import { formatPct, formatYen, pnlColorClass } from '@/lib/format'
import { DEEP_LOSS, R_BASIS_LABEL, R_UNIT, rBins, RBasis, RBin, RStats, SLOWDOWN_MONTH_R, SLOWDOWN_STREAK } from '@/lib/rStats'

function fmtU(v: number | null, unit: string): string {
  if (v == null || !Number.isFinite(v)) return '—'
  const s = v.toFixed(2)
  return v > 0 ? `+${s}${unit}` : `${s}${unit}`
}

/** 基準の切り替え（件数付き）。Journal 内の R 表示すべてに効く */
export function RBasisToggle({
  basis, onChange, counts,
}: { basis: RBasis; onChange: (b: RBasis) => void; counts: Record<RBasis, number> }) {
  return (
    <div className="inline-flex gap-0.5 bg-[var(--bg-card)] rounded-lg border border-[var(--border)] p-0.5" role="group" aria-label="R の基準">
      {(['atr', 'stop'] as RBasis[]).map(b => (
        <button
          key={b}
          type="button"
          onClick={() => onChange(b)}
          aria-pressed={basis === b}
          title={b === 'stop'
            ? '損切り基準: (決済 − 建値) ÷ (建値 − 初期ストップ)。計画どおりの損切りは -1R'
            : 'ATR 基準: (決済 − 建値) ÷ 買う前日の ATR14。値動きが 1 日平均値幅の何倍だったか（損切り価格の代用）'}
          className={`px-2.5 py-1 text-caption rounded-md transition-colors ${
            basis === b
              ? 'bg-[var(--sem-focus-fg)] text-white'
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'
          }`}
        >
          {R_BASIS_LABEL[b]} <span className="num opacity-80">{counts[b]}</span>
        </button>
      ))}
    </div>
  )
}

function rClass(v: number | null): string | undefined {
  if (v == null) return undefined
  return v > 0 ? 'text-[var(--positive)]' : v < 0 ? 'text-[var(--negative)]' : undefined
}

function Card({
  label, value, sub, valueClass, tooltip,
}: { label: string; value: string; sub?: string; valueClass?: string; tooltip?: string }) {
  const l = (
    <span className="text-caption font-medium uppercase tracking-wide text-[var(--text-muted)]">{label}</span>
  )
  return (
    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm px-4 py-3">
      <div className="mb-1">{tooltip ? <Tooltip content={tooltip}>{l}</Tooltip> : l}</div>
      <p className={`text-title font-medium num leading-tight ${valueClass ?? 'text-[var(--text-primary)]'}`}>{value}</p>
      {sub && <p className="text-caption text-[var(--text-muted)] mt-0.5 num">{sub}</p>}
    </div>
  )
}

const BIN_COLOR: Record<RBin['tone'], string> = {
  deep: 'var(--negative)',
  loss: 'var(--negative)',
  small: 'var(--sem-idle-fg)',
  win: 'var(--positive)',
  big: 'var(--positive)',
}

function RHistogram({ bins, total, basis }: { bins: number[]; total: number; basis: RBasis }) {
  const max = Math.max(1, ...bins)
  const defs = rBins(basis)
  const u = R_UNIT[basis]
  return (
    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm px-4 py-3">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-caption font-medium uppercase tracking-wide text-[var(--text-muted)]">{u} 分布（単位 {u}）</span>
        <span className="text-caption text-[var(--text-muted)]">
          {basis === 'stop' ? '理想: -1R に山、右に長く薄い裾' : '理想: 負けは 0〜-1ATR の浅い所に集まり、右に長く薄い裾'}
        </span>
      </div>
      <div className="flex items-end gap-[2px] h-28" role="img" aria-label="決済ポジションの R 倍数分布">
        {bins.map((n, i) => {
          const b = defs[i]
          const pct = total > 0 ? (n / total) * 100 : 0
          return (
            <div
              key={b.label}
              className="flex-1 flex flex-col items-center justify-end h-full group"
              title={`${b.label}: ${n} 件（${pct.toFixed(0)}%）`}
            >
              <span className="text-caption num text-[var(--text-secondary)] mb-0.5">{n > 0 ? n : ''}</span>
              <div
                className="w-full rounded-t-[4px] group-hover:brightness-110"
                style={{
                  height: `${(n / max) * 100}%`,
                  minHeight: n > 0 ? 2 : 0,
                  backgroundColor: BIN_COLOR[b.tone],
                  opacity: b.tone === 'deep' || b.tone === 'big' ? 1 : 0.7,
                }}
              />
            </div>
          )
        })}
      </div>
      <div className="flex gap-[2px] mt-1 border-t border-[var(--border)] pt-1">
        {defs.map(b => (
          <span key={b.label} className="flex-1 text-center text-caption num text-[var(--text-muted)] leading-tight">
            {b.label}
          </span>
        ))}
      </div>
    </div>
  )
}

/** R 分布タブの中身: ヒストグラム + 上位依存度 + 除外件数 */
export function RDistribution({ stats: s }: { stats: RStats }) {
  const u = R_UNIT[s.basis]
  const fmtR = (v: number | null) => fmtU(v, u)
  return (
    <div className="space-y-2">
      <RHistogram bins={s.bins} total={s.withR} basis={s.basis} />
      <p className="text-caption text-[var(--text-muted)] flex flex-wrap gap-x-4 gap-y-1">
        {s.top10Share != null && (
          <span title="上位 10 ポジションの合計が総計に占める割合。この手法では高いのが普通（大勝ちを伸ばせている）">
            上位10件で総計の <strong className="text-[var(--text-primary)] num">{formatPct(s.top10Share, { digits: 0 })}</strong>（{fmtR(s.top10R)}）
          </span>
        )}
        {s.deepLosses > 0 && (
          <span className="text-[var(--negative)]">
            {s.basis === 'stop' ? '損切り遅れ' : '大きな負け'}（{DEEP_LOSS[s.basis]}{u} 未満）{s.deepLosses} 件
          </span>
        )}
        {s.missingR > 0 && <span>{s.basis === 'stop' ? '初期ストップ未設定' : 'ATR 未記録'}で除外 {s.missingR} 件</span>}
        <span>分割決済は 1 ポジションにまとめて集計</span>
      </p>
    </div>
  )
}

/** Journal 最上段: 成績カード 1 行（と減速ルールの警告） */
export default function JournalSummary({ stats: s }: { stats: RStats }) {
  if (s.positions === 0) return null
  const u = R_UNIT[s.basis]
  const fmtR = (v: number | null) => fmtU(v, u)
  const wrGap = s.winRate != null && s.breakevenWinRate != null ? s.winRate - s.breakevenWinRate : null
  const pf = s.profitFactor

  return (
    <div className="space-y-3 mb-4">
      {s.slowdown.active && (
        <div className="rounded-xl border border-[var(--sem-watch-bd)] bg-[var(--sem-watch-bg)] px-4 py-2.5 text-small text-[var(--sem-watch-fg)]">
          <span className="font-medium">⚠ 減速ルール: 次のトレードはリスク % を半分に</span>
          <span className="ml-2">{s.slowdown.reasons.join(' / ')}</span>
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card
          label="期待値"
          tooltip={`1 回あたりの平均（${u}）。プラスなら勝率が低くても戦略として成り立っている。`}
          value={fmtR(s.expectancy)}
          sub={`${s.withR} 件`}
          valueClass={rClass(s.expectancy)}
        />
        <Card
          label="勝率"
          tooltip="勝ち ÷ (勝ち + 負け)。分岐 = 平均勝ちと平均負けから出した、損益トントンになる勝率。これを上回れば期待値プラス。"
          value={s.winRate != null ? formatPct(s.winRate, { digits: 1 }) : '—'}
          sub={s.breakevenWinRate != null ? `分岐 ${formatPct(s.breakevenWinRate, { digits: 1 })}` : undefined}
          valueClass={wrGap == null ? undefined : wrGap >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}
        />
        <Card
          label={`平均 勝ち / 負け（${u}）`}
          value={`${s.avgWinR != null ? `+${s.avgWinR.toFixed(1)}` : '—'} / ${s.avgLossR != null ? s.avgLossR.toFixed(1) : '—'}`}
          sub={s.avgWinR != null && s.avgLossR != null && s.avgLossR !== 0
            ? `損益比 ${(s.avgWinR / Math.abs(s.avgLossR)).toFixed(1)}`
            : undefined}
        />
        <Card
          label="損益合計"
          tooltip="決済済みの合計（手数料は未控除）。PF = 総利益 ÷ 総損失。1.5 以上が目安。"
          value={formatYen(s.totalPnl, { sign: true })}
          sub={pf == null ? undefined : `PF ${pf === Infinity ? '∞' : pf.toFixed(2)}`}
          valueClass={pnlColorClass(s.totalPnl)}
        />
        <Card
          label="保有日数 勝ち / 負け"
          tooltip="平均保有日数（暦日）。負けは短く、勝ちは長くが理想。"
          value={`${s.avgHoldWin != null ? s.avgHoldWin.toFixed(1) : '—'} / ${s.avgHoldLoss != null ? s.avgHoldLoss.toFixed(1) : '—'}日`}
          valueClass={s.avgHoldWin != null && s.avgHoldLoss != null && s.avgHoldWin < s.avgHoldLoss ? 'text-[var(--negative)]' : undefined}
        />
        <Card
          label="連敗"
          tooltip={`今の連敗と過去最大。${SLOWDOWN_STREAK} 連敗 または 当月 ${SLOWDOWN_MONTH_R}${u} 以下で減速ルールを表示。`}
          value={`${s.currentLossStreak}`}
          sub={`最大 ${s.maxLossStreak} · 当月 ${fmtR(s.monthR)}`}
          valueClass={s.currentLossStreak >= SLOWDOWN_STREAK ? 'text-[var(--negative)]' : undefined}
        />
      </div>
    </div>
  )
}
