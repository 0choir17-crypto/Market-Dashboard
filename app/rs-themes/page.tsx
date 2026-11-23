'use client'

// RS Themes — 強い銘柄 (RS 上位 約 2%) がどのテーマに集まっているかを毎日数え、
// 主役のテーマがいつ切り替わったかを見る。RS は加重せず 21 日と 63 日を別々に出す。
// 日付は rs_themes の max(date) (今日の日付は使わない)。

import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchRsThemesSnapshot, type RsThemesSnapshot } from '@/lib/rsThemesFetch'
import ThemeHeatmap from '@/components/rsThemes/ThemeHeatmap'
import ThemeMomentum from '@/components/rsThemes/ThemeMomentum'
import ThemeDivergence from '@/components/rsThemes/ThemeDivergence'
import ThemeMembers from '@/components/rsThemes/ThemeMembers'
import ErrorBanner from '@/components/shared/ErrorBanner'
import PageHeader from '@/components/shared/PageHeader'

export default function RsThemesPage() {
  const [snap, setSnap] = useState<RsThemesSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const requestIdRef = useRef(0)

  const load = useCallback(async () => {
    const reqId = ++requestIdRef.current
    setLoading(true)
    const s = await fetchRsThemesSnapshot()
    if (reqId !== requestIdRef.current) return
    setSnap(s)
    setLoading(false)
  }, [])

  useEffect(() => {
    load() // eslint-disable-line react-hooks/set-state-in-effect
  }, [load])

  const hasData = !!snap && snap.grids[21].dates.length + snap.grids[63].dates.length > 0

  return (
    <main className="min-h-screen p-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <PageHeader
        title="RS Themes"
        subtitle="強い銘柄（RS 上位 約 2%）がどのテーマに集まっているかを毎日数え、主役のテーマがいつ切り替わったかを見る"
        onRefresh={load}
        refreshing={loading}
      >
        {/* 毎晩の更新にまだ入っていないので、他のページより古いことがある。日付が見えれば十分 (警告・色分けはしない) */}
        {snap?.date && (
          <span className="text-small text-[var(--text-secondary)] num" title="rs_themes の最新日">
            As of <span className="font-mono text-[var(--text-primary)]">{snap.date}</span>
          </span>
        )}
      </PageHeader>

      {snap?.error && <ErrorBanner detail={snap.error} onRetry={load} />}

      <div className="mb-4 text-caption text-[var(--text-secondary)] space-y-0.5">
        <p>
          21d は早い（テーマが抜けるのを 2〜3 週早く拾う）がノイズがあり、下げ相場では「下げなかっただけ」のディフェンシブ株も入る。
          63d は遅いが確か。主役のテーマの確認用。
        </p>
        <p>
          読み方: 21d で増えたのに 63d にはまだ無い ＝ テーマの出始め、63d にはあるが 21d から消えた ＝ 勢いの落ち始め。
        </p>
        <p className="text-[var(--text-muted)]">
          テーマは有報の「事業の内容」から付けたもので、量子・防衛などの市場の物語テーマは拾えていないことがある。
        </p>
      </div>

      {loading && !snap ? (
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-8 text-center text-[var(--text-muted)]">
          <p className="text-title font-medium">Loading…</p>
        </div>
      ) : !hasData ? (
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] shadow-sm p-8 text-center text-[var(--text-muted)]">
          <p className="text-title font-medium mb-2">No data</p>
          <p className="text-small">
            Supabase の <code className="font-mono">rs_themes</code> /{' '}
            <code className="font-mono">rs_themes_members</code> テーブルにデータがあるか確認してください。
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <ThemeHeatmap grids={snap!.grids} />
          <ThemeMomentum grids={snap!.grids} />
          <ThemeDivergence grids={snap!.grids} />
          <ThemeMembers members={snap!.members} grids={snap!.grids} />
        </div>
      )}
    </main>
  )
}
