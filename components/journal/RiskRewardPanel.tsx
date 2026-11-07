'use client'

// R ベースの成績パネル（Journal 最上段）。
// 勝率ではなく期待値（平均 R）・R 分布・上位依存度・保有日数の非対称性・連敗を見る。

import Tooltip from '@/components/shared/Tooltip'
import { formatPct } from '@/lib/format'
import { R_BINS, RStats, SLOWDOWN_MONTH_R, SLOWDOWN_STREAK } from '@/lib/rStats'

function fmtR(v: number | null, sign = true): string {
  if (v == null || !Number.isFinite(v)) return '—'
  const s = v.toFixed(2)
  return sign && v > 0 ? `+${s}R` : `${s}R`
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

const BIN_COLOR: Record<(typeof R_BINS)[number]['tone'], string> = {
  deep: 'var(--negative)',
  loss: 'var(--negative)',
  small: 'var(--sem-idle-fg)',
  win: 'var(--positive)',
  big: 'var(--positive)',
}

function RHistogram({ bins, total }: { bins: number[]; total: number }) {
  const max = Math.max(1, ...bins)
  return (
    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm px-4 py-3">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-caption font-medium uppercase tracking-wide text-[var(--text-muted)]">R 分布</span>
        <span className="text-caption text-[var(--text-muted)]">理想: -1R に山、右に長く薄い裾</span>
      </div>
      <div className="flex items-end gap-[2px] h-28" role="img" aria-label="決済ポジションの R 倍数分布">
        {bins.map((n, i) => {
          const b = R_BINS[i]
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
        {R_BINS.map(b => (
          <span key={b.label} className="flex-1 text-center text-caption num text-[var(--text-muted)] leading-tight">
            {b.label}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function RiskRewardPanel({ stats }: { stats: RStats }) {
  const s = stats
  if (s.positions === 0) return null

  const wrGap = s.winRate != null && s.breakevenWinRate != null ? s.winRate - s.breakevenWinRate : null
  const holdRatio = s.avgHoldWin != null && s.avgHoldLoss != null && s.avgHoldLoss > 0
    ? s.avgHoldWin / s.avgHoldLoss : null

  return (
    <div className="mb-6 space-y-3">
      {/* 減速ルール */}
      {s.slowdown.active && (
        <div className="rounded-xl border border-[var(--sem-watch-bd)] bg-[var(--sem-watch-bg)] px-4 py-3 text-small text-[var(--sem-watch-fg)]">
          <span className="font-medium">⚠ 減速ルール発動: リスク % を半分に</span>
          <span className="ml-2">{s.slowdown.reasons.join(' / ')}</span>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card
          label="Expectancy"
          tooltip="期待値 = 1 ポジションあたりの平均 R（総 R ÷ R 算出済み件数）。プラスなら勝率が低くても戦略として成立している。"
          value={fmtR(s.expectancy)}
          sub={`総 ${fmtR(s.totalR)} / n=${s.withR}`}
          valueClass={rClass(s.expectancy)}
        />
        <Card
          label="勝率 vs 分岐点"
          tooltip="損益分岐勝率 = |平均負け| ÷ (平均勝ち + |平均負け|)。今の勝率がこれを上回っていれば期待値プラス。例: 平均勝ち 4R・平均負け -1R → 20%。"
          value={s.winRate != null ? formatPct(s.winRate, { digits: 1 }) : '—'}
          sub={s.breakevenWinRate != null
            ? `分岐 ${formatPct(s.breakevenWinRate, { digits: 1 })}${wrGap != null ? `（${wrGap >= 0 ? '+' : ''}${wrGap.toFixed(1)}pt）` : ''}`
            : undefined}
          valueClass={wrGap == null ? undefined : wrGap >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}
        />
        <Card
          label="Avg Win / Loss"
          tooltip="勝ちポジションの平均 R と負けポジションの平均 R。負けは -1R 前後に収まっているのが理想。"
          value={`${fmtR(s.avgWinR)} / ${fmtR(s.avgLossR)}`}
          sub={s.avgWinR != null && s.avgLossR != null && s.avgLossR !== 0
            ? `損益比 ${(s.avgWinR / Math.abs(s.avgLossR)).toFixed(2)}`
            : undefined}
        />
        <Card
          label="Top10 依存"
          tooltip="R 上位 10 ポジションの合計が総 R に占める割合。この戦略では高いのが普通。大勝ちを伸ばせているかの指標。"
          value={s.top10Share != null ? formatPct(s.top10Share, { digits: 0 }) : '—'}
          sub={s.top10R != null ? `上位10 = ${fmtR(s.top10R)}` : undefined}
        />
        <Card
          label="Hold W / L"
          tooltip="勝ち・負けポジションの平均保有日数（暦日、同日決済 = 0）。負けは短く、勝ちは長くが理想。"
          value={`${s.avgHoldWin != null ? s.avgHoldWin.toFixed(1) : '—'} / ${s.avgHoldLoss != null ? s.avgHoldLoss.toFixed(1) : '—'}日`}
          sub={holdRatio != null ? `勝ちは負けの ${holdRatio.toFixed(1)} 倍` : undefined}
          valueClass={holdRatio != null && holdRatio < 1 ? 'text-[var(--negative)]' : undefined}
        />
        <Card
          label="連敗"
          tooltip={`現在の連敗数と過去最大。${SLOWDOWN_STREAK} 連敗 または 当月 ${SLOWDOWN_MONTH_R}R 以下で減速ルール（リスク % 半減）を表示。建値撤退は連敗を止めない。`}
          value={`${s.currentLossStreak}`}
          sub={`最大 ${s.maxLossStreak} / 当月 ${fmtR(s.monthR)}`}
          valueClass={s.currentLossStreak >= SLOWDOWN_STREAK ? 'text-[var(--negative)]' : undefined}
        />
      </div>

      <RHistogram bins={s.bins} total={s.withR} />

      {(s.deepLosses > 0 || s.missingR > 0) && (
        <p className="text-caption text-[var(--text-muted)]">
          {s.deepLosses > 0 && (
            <span className="text-[var(--negative)] mr-3">
              損切り遅れ（-1.5R 未満）: {s.deepLosses} 件
            </span>
          )}
          {s.missingR > 0 && <span>初期ストップ未設定で R 集計から除外: {s.missingR} 件</span>}
          <span className="ml-3">※ 分割決済は 1 ポジションに束ねて株数加重</span>
        </p>
      )}
    </div>
  )
}
