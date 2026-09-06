'use client'

import Modal from './Modal'
import { btnSecondary } from '@/components/shared/form'

type Props = {
  open: boolean
  message: string
  onConfirm: () => void
  onCancel: () => void
  /** 確定ボタンのラベル。省略時は「削除」。 */
  confirmLabel?: string
  /** danger=赤（破壊的操作）/ primary=青（通常の確定）。省略時は danger。 */
  variant?: 'danger' | 'primary'
}

export default function ConfirmDialog({
  open,
  message,
  onConfirm,
  onCancel,
  confirmLabel = '削除',
  variant = 'danger',
}: Props) {
  const confirmClass =
    variant === 'danger'
      ? 'bg-[var(--negative)] hover:brightness-110'
      : 'bg-[var(--sem-focus-fg)] hover:brightness-110'
  return (
    <Modal open={open} onClose={onCancel} title="Confirm">
      <div className="px-6 py-5">
        <p className="text-[var(--text-primary)] text-sm mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className={btnSecondary}
          >
            キャンセル
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors min-h-[44px] ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}
