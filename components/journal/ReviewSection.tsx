'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Trade } from '@/types/trades'
import { CATEGORY_LABELS, ReviewTagCategory, groupTagsByCategory } from '@/lib/reviewTags'
import { calculateMissedRate } from '@/lib/mfeMae'
import TradeChart from './TradeChart'

type Props = {
  trade: Trade
  onSaved: () => void
  onCancel: () => void
}

export default function ReviewSection({ trade, onSaved, onCancel }: Props) {
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(trade.review_tags ?? [])
  const [entryReason, setEntryReason] = useState(trade.entry_reason ?? '')
  const [lessonLearned, setLessonLearned] = useState(trade.lesson_learned ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setSelectedTagIds(trade.review_tags ?? [])
    setEntryReason(trade.entry_reason ?? '')
    setLessonLearned(trade.lesson_learned ?? '')
    setError('')
  }, [trade.id, trade.review_tags, trade.entry_reason, trade.lesson_learned])

  const grouped = groupTagsByCategory()
  const isWin = trade.result === 'WIN'

  function toggleTag(id: string) {
    setSelectedTagIds(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    )
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    const { error: err } = await supabase
      .from('trades')
      .update({
        review_tags: selectedTagIds,
        lesson_learned: lessonLearned.trim() || null,
        entry_reason: entryReason.trim() || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', trade.id)
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return (
    <div
      className="rounded-lg border border-gray-200 bg-slate-50 border-l-2 border-l-blue-400 px-4 py-4 space-y-4"
    >
      {/* ヘッダー */}
      <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-gray-200">
        <span className="text-sm font-semibold text-gray-800">
          🔍 Review: <span className="font-mono">{trade.ticker}</span> {trade.company_name ?? ''}
        </span>
        <span className="text-xs text-gray-500">
          {trade.entry_date} → {trade.exit_date}
        </span>
        <span className={`text-xs font-semibold ${isWin ? 'text-emerald-600' : 'text-red-600'}`}>
          {(trade.pnl_pct ?? 0) >= 0 ? '+' : ''}{(trade.pnl_pct ?? 0).toFixed(2)}%
        </span>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
          isWin ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
        }`}>
          {trade.result}
        </span>
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>
      )}

      {/* チャート */}
      <div>
        <p className="text-xs font-semibold text-gray-700 mb-2">📈 チャート</p>
        <TradeChart trade={trade} />
      </div>

      {/* MFE / MAE */}
      {trade.mfe_pct != null && trade.mae_pct != null ? (
        <div>
          <p className="text-xs font-semibold text-gray-700 mb-2">📏 MFE / MAE</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div className="bg-white border border-gray-200 rounded-lg px-3 py-2.5">
              <p className="text-[11px] text-gray-500">Peak gain (MFE)</p>
              <p className="text-xl font-bold text-emerald-600 mt-0.5">
                {trade.mfe_pct >= 0 ? '+' : ''}{trade.mfe_pct.toFixed(1)}%
              </p>
              {trade.mfe_date && (
                <p className="text-[11px] text-gray-400 mt-0.5">{trade.mfe_date}</p>
              )}
            </div>
            <div className="bg-white border border-gray-200 rounded-lg px-3 py-2.5">
              <p className="text-[11px] text-gray-500">Worst drawdown (MAE)</p>
              <p className="text-xl font-bold text-red-600 mt-0.5">
                {trade.mae_pct >= 0 ? '+' : ''}{trade.mae_pct.toFixed(1)}%
              </p>
              {trade.mae_date && (
                <p className="text-[11px] text-gray-400 mt-0.5">{trade.mae_date}</p>
              )}
            </div>
            <div className="bg-white border border-gray-200 rounded-lg px-3 py-2.5">
              <p className="text-[11px] text-gray-500">Missed rate</p>
              <p className="text-xl font-bold text-amber-600 mt-0.5">
                {calculateMissedRate(trade.mfe_pct, trade.pnl_pct).toFixed(0)}%
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                MFE {trade.mfe_pct.toFixed(1)}% → Actual {trade.pnl_pct != null ? `${trade.pnl_pct >= 0 ? '+' : ''}${trade.pnl_pct.toFixed(1)}%` : '—'}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-xs text-gray-500 bg-white border border-gray-200 rounded-lg px-3 py-2">
          📏 MFE/MAEデータなし（保有期間中の終値データが不足している可能性）
        </div>
      )}

      {/* タグ選択 */}
      {(Object.keys(grouped) as ReviewTagCategory[]).map(category => (
        <div key={category} className="space-y-1.5">
          <p className="text-xs font-semibold text-gray-700">{CATEGORY_LABELS[category]}</p>
          <div className="flex flex-wrap gap-1.5">
            {grouped[category].map(tag => {
              const checked = selectedTagIds.includes(tag.id)
              return (
                <label
                  key={tag.id}
                  title={tag.description}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs cursor-pointer transition-colors ${
                    checked
                      ? 'bg-blue-100 border-blue-400 text-blue-800'
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleTag(tag.id)}
                    className="w-3 h-3 accent-blue-600"
                  />
                  <span>{tag.label}</span>
                </label>
              )
            })}
          </div>
        </div>
      ))}

      {/* エントリー理由 */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">💭 Entry thesis</label>
        <textarea
          value={entryReason}
          onChange={e => setEntryReason(e.target.value)}
          rows={2}
          placeholder="なぜこのタイミングでエントリーしたか"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-white"
        />
      </div>

      {/* 教訓 */}
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">📝 Lesson learned</label>
        <textarea
          value={lessonLearned}
          onChange={e => setLessonLearned(e.target.value)}
          rows={2}
          placeholder="このトレードから学んだこと"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-white"
        />
      </div>

      {/* フッター */}
      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save & Done'}
        </button>
      </div>
    </div>
  )
}
