'use client'

// 記録パイプラインの生存確認バッジ。
//
// 判定は営業日ではなく実時間（時間単位）で行う: この画面のイベントは土日祝にも
// 発生するため、営業日で測ると金曜夜に ingest が落ちても火曜まで正常に見える。
//
// 正常（ok）は **無色** にする。正常が目立たない状態を作ることが、異常の発見を
// 速くする。aging で初めて警戒色、old で弱い色が付く。
// 絵文字は環境ごとに字形とサイズが変わり密度の高い UI で位置が揃わないので、
// 状態は 6px のドットで示す。

import { classifySnapshotFreshness } from '@/types/watchlistJournal'
import { toneVars } from '@/types/semantic'
import { formatJstDateTime } from '@/lib/dates'

export default function SnapshotFreshnessBadge({ lastTs }: { lastTs: string | null }) {
  // 描画中に現在時刻を読んでいるが hydration mismatch にはならない:
  // データはクライアントで取得するので、プリレンダ時とハイドレーション時の
  // lastTs はどちらも null（=「記録なし」表示）で一致する。
  const fresh = classifySnapshotFreshness(lastTs)
  const tone = toneVars(fresh.tone)
  const plain = fresh.tone === 'idle' // 正常・記録なしは面を持たない

  return (
    <span className="inline-flex items-center gap-2 text-small">
      <span className="text-[var(--text-muted)]">最終記録:</span>
      <span className="font-mono text-[var(--text-primary)]">{formatJstDateTime(lastTs)}</span>
      <span
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-caption whitespace-nowrap"
        style={
          plain
            ? { color: 'var(--text-muted)' }
            : { backgroundColor: tone.bg, color: tone.fg, border: `0.5px solid ${tone.bd}` }
        }
        title={fresh.hint}
      >
        <span
          aria-hidden
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: plain ? 'var(--sem-idle-bd)' : tone.fg }}
        />
        {fresh.label}
      </span>
    </span>
  )
}
