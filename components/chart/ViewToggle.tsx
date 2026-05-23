'use client'

export type ViewMode = 'cards' | 'table'

export default function ViewToggle({
  mode,
  onChange,
}: {
  mode: ViewMode
  onChange: (m: ViewMode) => void
}) {
  return (
    <div
      className="inline-flex rounded-lg border overflow-hidden text-xs font-medium"
      style={{ borderColor: 'var(--border)' }}
    >
      <button
        onClick={() => onChange('cards')}
        className={`px-3 py-1.5 transition-colors ${
          mode === 'cards'
            ? 'bg-[var(--accent)] text-white'
            : 'bg-white text-[var(--text-secondary)] hover:bg-gray-50'
        }`}
      >
        Cards
      </button>
      <button
        onClick={() => onChange('table')}
        className={`px-3 py-1.5 transition-colors border-l ${
          mode === 'table'
            ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
            : 'bg-white text-[var(--text-secondary)] border-[var(--border)] hover:bg-gray-50'
        }`}
      >
        Table
      </button>
    </div>
  )
}
