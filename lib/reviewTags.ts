// 振り返りタグ（trades.review_tags に id の配列で保存）。
// 「なぜ買ったか（エントリー）」と「なぜ売ったか（イグジット）」の 2 種類。複数選択可。

export type ReviewTagCategory = 'entry' | 'exit'

export interface ReviewTag {
  id: string
  category: ReviewTagCategory
  label: string
  description: string
}

export const REVIEW_TAGS: ReviewTag[] = [
  // エントリー（買った理由）
  { id: 'in_earnings',     category: 'entry', label: '好決算',         description: '良い決算を受けて買った' },
  { id: 'in_ema_pb',       category: 'entry', label: 'EMA押し目',      description: '9/21EMA などへの押しで買った' },
  { id: 'in_support_pb',   category: 'entry', label: 'サポート押し目', description: '水平のサポートラインへの押しで買った' },
  { id: 'in_resist_break', category: 'entry', label: 'レジスタンス抜け', description: 'レジスタンスラインを上抜けて買った' },
  { id: 'in_surprise',     category: 'entry', label: 'サプライズ',     description: '想定外の材料・ニュースで買った' },
  // イグジット（売った理由）
  { id: 'out_profit',      category: 'exit',  label: '利確',           description: '目標・ルールどおりの利益確定' },
  { id: 'out_ema_break',   category: 'exit',  label: 'EMA割れ',        description: 'EMA を割り込んで売った' },
  { id: 'out_support_break', category: 'exit', label: 'サポート割れ',  description: 'サポートラインを割り込んで売った' },
  { id: 'out_surprise',    category: 'exit',  label: 'サプライズ',     description: '想定外の材料・ニュースで売った' },
]

export const CATEGORY_LABELS: Record<ReviewTagCategory, string> = {
  entry: 'エントリー',
  exit: 'イグジット',
}

// 旧タグ（2026-11 以前）。選択肢には出さないが、保存済みの表示用に残す。
const LEGACY_TAGS: Omit<ReviewTag, 'category'>[] = [
  { id: 'entry_good',         label: '良いエントリー', description: '旧タグ' },
  { id: 'entry_too_early',    label: '早すぎた',       description: '旧タグ' },
  { id: 'entry_too_late',     label: '遅すぎた',       description: '旧タグ' },
  { id: 'entry_regime_wrong', label: 'レジーム誤認',   description: '旧タグ' },
  { id: 'exit_good',          label: '適切な利確/損切', description: '旧タグ' },
  { id: 'exit_too_early',     label: '利確早すぎ',     description: '旧タグ' },
  { id: 'exit_too_late',      label: '損切遅延',       description: '旧タグ' },
  { id: 'exit_mechanical',    label: '機械的執行',     description: '旧タグ' },
  { id: 'ext_market_shock',   label: '地合い急変',     description: '旧タグ' },
  { id: 'ext_earnings_hit',   label: '決算被弾',       description: '旧タグ' },
  { id: 'ext_sector_drop',    label: 'セクター急落',   description: '旧タグ' },
  { id: 'ext_news_event',     label: '個別材料',       description: '旧タグ' },
]

export function getTagById(id: string): Pick<ReviewTag, 'id' | 'label' | 'description'> & { category?: ReviewTagCategory } | undefined {
  return REVIEW_TAGS.find(t => t.id === id) ?? LEGACY_TAGS.find(t => t.id === id)
}

export function tagsOf(category: ReviewTagCategory): ReviewTag[] {
  return REVIEW_TAGS.filter(t => t.category === category)
}
