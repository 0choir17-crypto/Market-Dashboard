'use client'

// 記録パイプラインの生存確認バッジ。
//
// 配色とバッジの形は /earnings の FreshnessBadge に揃えているが、判定は
// 営業日ではなく実時間（時間単位）で行う: この画面のイベントは土日祝にも
// 発生する（§1）ため、営業日で測ると金曜夜に ingest が落ちても火曜まで
// 緑のままになる。「記録が黙って止まる」のがこの画面で一番怖い障害。

import { classifySnapshotFreshness } from '@/types/watchlistJournal'
import { formatJstDateTime } from '@/lib/dates'

export default function SnapshotFreshnessBadge({ lastTs }: { lastTs: string | null }) {
  // 描画中に現在時刻を読んでいるが hydration mismatch にはならない:
  // データはクライアントで取得するので、プリレンダ時とハイドレーション時の
  // lastTs はどちらも null（=「記録なし」表示）で一致する。経過時間が出るのは
  // fetch 完了後の再描画からで、そこはクライアント専用。
  const fresh = classifySnapshotFreshness(lastTs)

  return (
    <span className="inline-flex items-center gap-2 text-sm">
      <span className="text-[var(--text-muted)]">最終記録:</span>
      <span className="font-mono font-semibold text-[var(--text-primary)]">
        {formatJstDateTime(lastTs)}
      </span>
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap"
        style={{ backgroundColor: fresh.bg, color: fresh.text, border: `1px solid ${fresh.border}` }}
        title={fresh.hint}
      >
        <span className="text-[9px]">{fresh.icon}</span>
        {fresh.label}
      </span>
    </span>
  )
}
