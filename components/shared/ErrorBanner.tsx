'use client'

// Supabase 取得失敗を「データ 0 件」と混同させないための警告バナー。
// 空データ = 静かな相場、ではなく取得エラーであることを明示する。

type Props = {
  /** エラー詳細（Supabase の error.message など）。 */
  detail?: string | null
  /** 見出しメッセージ（省略時は共通文言）。 */
  message?: string
  /** 指定時のみ「再試行」ボタンを表示。 */
  onRetry?: () => void
}

export default function ErrorBanner({ detail, message, onRetry }: Props) {
  return (
    <div
      role="alert"
      className="mb-4 px-4 py-2.5 rounded-lg bg-[var(--sem-weak-bg)] border-[0.5px] border-[var(--sem-weak-bd)] text-[var(--sem-weak-fg)] text-small flex items-start gap-2"
    >
      <span aria-hidden className="text-lead leading-tight">⚠️</span>
      <div className="flex-1 min-w-0">
        <p className="font-medium">
          {message ?? 'データ取得に失敗しました — 表示中の内容は不完全な可能性があります'}
        </p>
        {detail && (
          <p className="text-caption mt-0.5 break-all opacity-80">{detail}</p>
        )}
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="shrink-0 px-2.5 py-1 rounded-md text-caption border-[0.5px] border-[var(--sem-weak-bd)] bg-[var(--bg-card)] text-[var(--sem-weak-fg)] hover:bg-[var(--sem-weak-bg)]"
        >
          再試行
        </button>
      )}
    </div>
  )
}
