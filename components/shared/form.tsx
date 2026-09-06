'use client'

// フォームの見た目を 1 箇所に集める。
//
// これ以前は input / label / ボタンの class 文字列が 5 つのモーダル
// （EditTradeModal / PositionModal / CloseModal / CloseTradeModal / LoginModal）に
// そのままコピーされており、色の指定だけで 154 箇所あった。値は同じでも
// 触るときは 5 ファイル直す必要があり、実際に少しずつずれていた。
//
// class 文字列（コンポーネントではなく）で公開しているのは、input が type ごとに
// 属性が違い、ラップすると props の受け渡しばかりが増えるため。

/** 入力欄（input / select / textarea 共通）。
 *
 *  `text-base`（16px）は意図的。iOS Safari は 16px 未満の入力欄にフォーカスすると
 *  ページを勝手に拡大するので、ここだけ本文（13px）より大きい。 */
export const fieldClass =
  'w-full rounded-lg px-3 py-2.5 text-base bg-[var(--bg-card)] text-[var(--text-primary)] ' +
  'border-[0.5px] border-[var(--border-strong)] ' +
  'focus:outline-none focus:ring-2 focus:ring-[var(--sem-focus-fg)]'

/** 入力欄の見出し。 */
export const labelClass = 'block text-caption font-medium text-[var(--text-secondary)] mb-1'

/** 主ボタン（保存・実行）。min-h-[44px] は指で押せる最小寸法。 */
export const btnPrimary =
  'px-5 py-2 text-small font-medium text-white bg-[var(--sem-focus-fg)] rounded-lg ' +
  'hover:brightness-110 disabled:opacity-50 min-h-[44px]'

/** 副ボタン（キャンセル・戻る）。 */
export const btnSecondary =
  'px-4 py-2 text-small font-medium text-[var(--text-secondary)] rounded-lg ' +
  'border-[0.5px] border-[var(--border-strong)] hover:bg-[var(--bg-card-hover)] min-h-[44px]'

/** 罫線を持たないボタン（閉じるだけの導線）。 */
export const btnGhost =
  'px-4 py-2 text-small text-[var(--text-secondary)] hover:text-[var(--text-primary)]'

/** 破壊的操作（削除）。 */
export const btnDanger =
  'px-5 py-2 text-small font-medium text-white bg-[var(--negative)] rounded-lg ' +
  'hover:brightness-110 disabled:opacity-50 min-h-[44px]'

/** 必須マーク。 */
export const requiredClass = 'text-[var(--sem-weak-fg)]'

/** エラー表示。 */
export const errorClass =
  'text-caption text-[var(--sem-weak-fg)] bg-[var(--sem-weak-bg)] ' +
  'border-[0.5px] border-[var(--sem-weak-bd)] rounded-lg px-3 py-2'
