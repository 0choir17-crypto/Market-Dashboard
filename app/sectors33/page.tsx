'use client'

import SectorSection from '@/components/sectors33/SectorSection'
import PageHeader from '@/components/shared/PageHeader'

// Sectors-33 は Market ダッシュボード (/) に統合済み。
// このルートは既存のブックマーク/リンク用に同じセクションを単体表示する。
export default function SectorSelectionPage() {
  return (
    <main className="min-h-screen p-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <PageHeader
        title="Sector Selection"
        subtitle="TOPIX-33 業種別 composite_score（今どこを買うか）"
      />
      <SectorSection showHeading={false} />
    </main>
  )
}
