/** UserFormDrawer organism — side panel to create or edit a consultation user and its scope (Figma: User Form Drawer · Create / Edit, F-05, F-07). */
import { useId, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { Button, IconButton } from '@/design-system/atoms'
import { FormField } from '@/design-system/molecules'
import { cn } from '@/utils/cn'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import type { ManagedUser, SaveUserResult, ScopeNode } from '../../model/users.types'
import {
  USER_NAME_MAX_LENGTH,
  userFormSchema,
  type UserFormValues,
} from '../../schemas/userForm.schema'
import { ScopePicker } from '../ScopePicker/ScopePicker'

export interface UserFormDrawerProps {
  tree: ScopeNode[]
  /** User to edit. Omit to create a new one. */
  user?: ManagedUser
  /** True when another listed user already has this email (checked before asking the backend). */
  isEmailTaken: (email: string) => boolean
  /** Saves the user. The drawer stays open, showing why, when the result is not `saved`. */
  onSubmit: (values: UserFormValues) => Promise<SaveUserResult>
  /** Edit mode, active users only: shows "Deactivate user" in the footer. */
  onDeactivate?: () => void
  onClose: () => void
}

const EMPTY_FORM: UserFormValues = { name: '', email: '', scope: [] }

export function UserFormDrawer({
  tree,
  user,
  isEmailTaken,
  onSubmit,
  onDeactivate,
  onClose,
}: UserFormDrawerProps) {
  const { t } = useTranslation('users')
  const isEdit = Boolean(user)
  const panelRef = useRef<HTMLDivElement>(null)
  const nameRef = useRef<HTMLInputElement | null>(null)
  const titleId = useId()
  const [showResetNotice, setShowResetNotice] = useState(false)
  const [submitFailed, setSubmitFailed] = useState(false)
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: user ? { name: user.name, email: user.email, scope: user.scope } : EMPTY_FORM,
  })
  // The name field gets the first focus, so the administrator can start typing right away.
  useDialogFocus(panelRef, onClose, nameRef)
  const nameField = register('name')

  const errorText = (message?: string) => message && t(message, { max: USER_NAME_MAX_LENGTH })

  const markEmailTaken = () =>
    setError('email', { message: 'form.validation.emailTaken' }, { shouldFocus: true })

  async function submit(values: UserFormValues) {
    setSubmitFailed(false)
    if (isEmailTaken(values.email)) {
      markEmailTaken()
      return
    }
    // The backend also rejects an email taken by an account that is not listed (409).
    const result = await onSubmit(values)
    if (result === 'emailTaken') markEmailTaken()
    else if (result === 'failed') setSubmitFailed(true)
  }

  return (
    <div className="fixed inset-0 z-50">
      <div aria-hidden="true" className="absolute inset-0 bg-bg-overlay" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-y-0 right-0 flex w-full max-w-120 flex-col border-l border-border-default bg-bg-surface shadow-card md:rounded-l-2xl"
      >
        <form noValidate onSubmit={handleSubmit(submit)} className="flex min-h-0 flex-1 flex-col">
          <header className="flex items-start justify-between gap-3 px-6 pt-5.5 pb-2">
            <div className="min-w-0">
              <h2 id={titleId} className="text-xl font-bold text-text-heading">
                {t(isEdit ? 'form.editTitle' : 'form.createTitle')}
              </h2>
              <p className="text-xs text-text-subtle">
                {t(isEdit ? 'form.editSubtitle' : 'form.createSubtitle')}
              </p>
            </div>
            <IconButton icon="close" label={t('form.close')} onClick={onClose} />
          </header>

          <div className="flex min-h-0 flex-1 flex-col gap-4.5 overflow-y-auto px-6 py-2">
            <FormField
              label={t('form.name')}
              placeholder={t('form.namePlaceholder')}
              autoComplete="off"
              required
              error={errorText(errors.name?.message)}
              {...nameField}
              ref={(element) => {
                nameField.ref(element)
                nameRef.current = element
              }}
            />
            <FormField
              type="email"
              label={t('form.email')}
              placeholder={t('form.emailPlaceholder')}
              autoComplete="off"
              required
              error={errorText(errors.email?.message)}
              {...register('email')}
            />
            {isEdit ? (
              <div className="flex flex-col items-center gap-1">
                {/* TODO: call POST /users/:id/password-reset once the backend has it (spec Q3, Sprint 6). */}
                <Button
                  label={t('form.resetPassword')}
                  variant="ghost"
                  onClick={() => setShowResetNotice(true)}
                />
                {showResetNotice && (
                  <p role="status" className="text-center text-xs text-text-subtle">
                    {t('form.resetPasswordNotice')}
                  </p>
                )}
              </div>
            ) : (
              <FormField
                label={t('form.password')}
                placeholder={t('form.passwordPlaceholder')}
                disabled
              />
            )}
            {/* No role selector: this form creates consultation users only (spec Q2, F-03). */}
            <hr className="border-border-default" />
            <Controller
              control={control}
              name="scope"
              render={({ field, fieldState }) => (
                <ScopePicker
                  tree={tree}
                  value={field.value}
                  onChange={field.onChange}
                  error={errorText(fieldState.error?.message)}
                />
              )}
            />
          </div>

          {submitFailed && (
            <p role="alert" className="px-6 pt-3 text-label text-feedback-danger-text">
              {t('form.submitError')}
            </p>
          )}
          <footer
            className={cn(
              'flex flex-wrap items-center gap-2.5 px-6 pt-3 pb-5.5',
              onDeactivate ? 'justify-between' : 'justify-end'
            )}
          >
            {onDeactivate && (
              <Button
                label={t('form.deactivate')}
                variant="ghost-danger"
                iconLeft="power"
                onClick={onDeactivate}
              />
            )}
            <div className="flex gap-2.5">
              <Button label={t('form.cancel')} variant="outline" onClick={onClose} />
              <Button
                type="submit"
                label={t(isEdit ? 'form.save' : 'form.create')}
                isLoading={isSubmitting}
              />
            </div>
          </footer>
        </form>
      </div>
    </div>
  )
}
