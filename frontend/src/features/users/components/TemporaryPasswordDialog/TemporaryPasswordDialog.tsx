/**
 * TemporaryPasswordDialog organism — shows the new user's temporary password once, so the
 * administrator can share it (F-07). Not in Figma.
 * TEMPORARY: remove once the backend emails a set-password link instead (spec Q3).
 */
import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Icon } from '@/design-system/atoms'
import { useDialogFocus } from '../../hooks/useDialogFocus'

export interface TemporaryPasswordDialogProps {
  userName: string
  email: string
  password: string
  onClose: () => void
}

type CopyState = 'idle' | 'copied' | 'failed'

export function TemporaryPasswordDialog({
  userName,
  email,
  password,
  onClose,
}: TemporaryPasswordDialogProps) {
  const { t } = useTranslation('users')
  const dialogRef = useRef<HTMLDivElement>(null)
  const copyRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  const passwordLabelId = useId()
  const [copyState, setCopyState] = useState<CopyState>('idle')
  useDialogFocus(dialogRef, onClose, copyRef)

  async function copy() {
    try {
      await navigator.clipboard.writeText(password)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div aria-hidden="true" className="absolute inset-0 bg-bg-overlay" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="relative flex w-full max-w-105 flex-col items-center gap-3.5 rounded-2xl bg-bg-surface p-7 text-center shadow-card"
      >
        <span className="flex rounded-full bg-bg-surface-alt p-3.5 text-action-link">
          <Icon name="shield" size="xl" />
        </span>
        <h2 id={titleId} className="text-lg font-bold text-text-heading">
          {t('password.title')}
        </h2>
        <p id={descriptionId} className="text-label text-text-secondary">
          {t('password.description', { name: userName, email })}
        </p>
        {/* Not a live region: screen readers must not read the password out on their own. */}
        <div className="flex w-full flex-col gap-1 text-left">
          <span id={passwordLabelId} className="text-xs font-semibold text-text-secondary">
            {t('password.label')}
          </span>
          <code
            aria-labelledby={passwordLabelId}
            className="rounded-lg border border-border-default bg-bg-surface-alt px-3.5 py-2.5 text-center font-mono text-base break-all text-text-heading select-all"
          >
            {password}
          </code>
        </div>
        <p className="text-xs text-text-subtle">{t('password.onceNotice')}</p>
        <p role="status" className="min-h-4 text-xs text-text-subtle">
          {copyState !== 'idle' && t(`password.${copyState}`)}
        </p>
        <div className="flex flex-wrap justify-center gap-2.5">
          <Button
            ref={copyRef}
            label={t('password.copy')}
            variant="outline"
            iconLeft={copyState === 'copied' ? 'check' : undefined}
            onClick={() => void copy()}
          />
          <Button label={t('password.done')} onClick={onClose} />
        </div>
      </div>
    </div>
  )
}
