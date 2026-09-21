'use client'

// マザーバー（前日）の値幅の中に、当日の値幅がどう収まったかを見せる小さな帯。
//
// range_pct（当日値幅 ÷ 前日値幅）は「どれだけ縮んだか」しか言わない。
// チャートを開く前に知りたいのは「マザーバーの上側で縮んだのか、下側か」なので、
// 位置そのものを描く。
//
//   薄い枠  = マザーバーの安値〜高値（＝翌日以降に見る 2 本の水平線）
//   濃い帯  = 当日の安値〜高値
//   縦の線  = 当日の終値の位置
//
// 色は付けない。上下や良し悪しを表すものではなく、位置と幅という事実だけを持つため
// （DESIGN_DIRECTION.md 原則 1: 色は意味にだけ付ける）。

import type { InsideDaySetupRow } from '@/types/insideDay'
import { bandGeometry, isCloseAdjustmentMismatch } from '@/types/insideDay'

function fmtPrice(v: number | null | undefined): string {
  return v != null && Number.isFinite(v)
    ? v.toLocaleString('ja-JP', { maximumFractionDigits: 1 })
    : '—'
}

export default function InsideDayBand({ row }: { row: InsideDaySetupRow }) {
  const geo = bandGeometry(row)
  if (!geo) return <span className="text-[var(--text-muted)]">—</span>

  const title =
    `マザーバー ${fmtPrice(row.mother_low)} 〜 ${fmtPrice(row.mother_high)}\n` +
    `当日 ${fmtPrice(row.low)} 〜 ${fmtPrice(row.high)}（終値 ${fmtPrice(row.close)}）` +
    (geo.closePct === null && isCloseAdjustmentMismatch(row)
      ? '\n※ 期間中に株式分割があり、終値（生の株価）と高値・安値（分割調整済み）の桁が合わないため終値の位置は表示しない'
      : '')

  return (
    <span
      className="relative inline-block align-middle w-[88px] h-[14px] rounded-[2px]"
      style={{
        backgroundColor: 'var(--sem-idle-bg)',
        border: '0.5px solid var(--border-strong)',
      }}
      title={title}
      role="img"
      aria-label={title}
    >
      {/* 当日の値幅 */}
      <span
        className="absolute top-[2px] bottom-[2px] rounded-[1px]"
        style={{
          left: `${geo.lowPct}%`,
          // 極端に縮んだ日（range_pct が 1 桁）でも線として見えるよう下限を置く
          width: `max(2px, ${geo.highPct - geo.lowPct}%)`,
          backgroundColor: 'var(--text-secondary)',
        }}
      />
      {/* 終値の位置 */}
      {geo.closePct !== null && (
        <span
          className="absolute top-0 bottom-0 w-[1.5px]"
          style={{
            left: `calc(${geo.closePct}% - 0.75px)`,
            backgroundColor: 'var(--text-primary)',
          }}
        />
      )}
    </span>
  )
}
