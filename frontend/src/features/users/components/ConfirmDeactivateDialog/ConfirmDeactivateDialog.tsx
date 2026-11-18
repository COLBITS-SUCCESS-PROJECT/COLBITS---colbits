/** ConfirmDeactivateDialog organism — asks before a user loses access (Figma: Confirm Deactivate, F-05). */
import { useId, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Icon } from '@/design-system/atoms'
import { useDialogFocus } from '../../hooks/useDialogFocus'

export interface ConfirmDeactivateDialogProps {
  userName: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDeactivateDialog({
  userName,
  onConfirm,
  onCancel,
}: ConfirmDeactivateDialogProps) {
  const { t } = useTranslation('users')
  const dialogRef = useRef<HTMLDivElement>(null)
  // Cancel gets the first focus so an accidental Enter never deactivates the account.
  const cancelRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  useDialogFocus(dialogRef, onCancel, cancelRef)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div aria-hidden="true" className="absolute inset-0 bg-bg-overlay" onClick={onCancel} />
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="relative flex w-full max-w-105 flex-col items-center gap-3.5 rounded-2xl bg-bg-surface p-7 text-center shadow-card"
      >
        <span className="flex rounded-full bg-feedback-danger-bg p-3.5 text-action-primary">
          <Icon name="power" size="xl" />
        </span>
        <h2 id={titleId} className="text-lg font-bold text-text-heading">
          {t('deactivate.title')}
        </h2>
        <p id={descriptionId} className="text-label text-text-secondary">
          {t('deactivate.description', { name: userName })}
        </p>
        <div className="flex flex-wrap justify-center gap-2.5">
          <Button
            ref={cancelRef}
            label={t('deactivate.cancel')}
            variant="outline"
            onClick={onCancel}
          />
          <Button label={t('deactivate.confirm')} onClick={onConfirm} />
        </div>
      </div>
    </div>
  )
}
