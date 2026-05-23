export type ReviewTagCategory = 'entry' | 'exit' | 'external'

export interface ReviewTag {
  id: string
  category: ReviewTagCategory
  label: string
  description: string
}

export const REVIEW_TAGS: ReviewTag[] = [
  // エントリー判断
  { id: 'entry_good',          category: 'entry',    label: '良いエントリー',     description: '後から見てもタイミング適切' },
  { id: 'entry_too_early',     category: 'entry',    label: '早すぎた',           description: 'もう少し待てば良い位置で買えた' },
  { id: 'entry_too_late',      category: 'entry',    label: '遅すぎた',           description: '追いかけ買い、高値掴み' },
  { id: 'entry_regime_wrong',  category: 'entry',    label: 'レジーム誤認',       description: 'MC判定を誤った' },
  // イグジット判断
  { id: 'exit_good',           category: 'exit',     label: '適切な利確/損切',    description: 'タイミング適切' },
  { id: 'exit_too_early',      category: 'exit',     label: '利確早すぎ',         description: 'MFEを活かせず' },
  { id: 'exit_too_late',       category: 'exit',     label: '損切遅延',           description: 'SLを動かした/無視した' },
  { id: 'exit_mechanical',     category: 'exit',     label: '機械的執行',         description: 'ルール通り、感情介入なし' },
  // 外部要因
  { id: 'ext_market_shock',    category: 'external', label: '地合い急変',         description: '日経全体ショック' },
  { id: 'ext_earnings_hit',    category: 'external', label: '決算被弾',           description: '決算で予想外の反応' },
  { id: 'ext_sector_drop',     category: 'external', label: 'セクター急落',       description: 'セクター全体の下落' },
  { id: 'ext_news_event',      category: 'external', label: '個別材料',           description: '個別ニュース/材料' },
]

export const CATEGORY_LABELS: Record<ReviewTagCategory, string> = {
  entry:    '🎯 Entry',
  exit:     '🚪 Exit',
  external: '🌊 External',
}

export function getTagById(id: string): ReviewTag | undefined {
  return REVIEW_TAGS.find(tag => tag.id === id)
}

export function groupTagsByCategory(): Record<ReviewTagCategory, ReviewTag[]> {
  return {
    entry:    REVIEW_TAGS.filter(t => t.category === 'entry'),
    exit:     REVIEW_TAGS.filter(t => t.category === 'exit'),
    external: REVIEW_TAGS.filter(t => t.category === 'external'),
  }
}
