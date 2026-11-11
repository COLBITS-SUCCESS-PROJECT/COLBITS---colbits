/** UserFormDrawer organism — side panel to create a consultation user with its scope (Figma: User Form Drawer · Create, F-07). */
import { useId, useRef } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { Button, IconButton } from '@/design-system/atoms'
import { FormField, Select } from '@/design-system/molecules'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import type { ScopeNode } from '../../model/users.types'
import {
  USER_NAME_MAX_LENGTH,
  userFormSchema,
  type UserFormValues,
} from '../../schemas/userForm.schema'
import { ScopePicker } from '../ScopePicker/ScopePicker'

export interface UserFormDrawerProps {
  tree: ScopeNode[]
  /** True when another user already has this email. */
  isEmailTaken: (email: string) => boolean
  onSubmit: (values: UserFormValues) => void
  onClose: () => void
}

const EMPTY_FORM: UserFormValues = { name: '', email: '', scope: [] }

export function UserFormDrawer({ tree, isEmailTaken, onSubmit, onClose }: UserFormDrawerProps) {
  const { t } = useTranslation('users')
  const panelRef = useRef<HTMLDivElement>(null)
  const nameRef = useRef<HTMLInputElement | null>(null)
  const titleId = useId()
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<UserFormValues>({ resolver: zodResolver(userFormSchema), defaultValues: EMPTY_FORM })
  // The name field gets the first focus, so the administrator can start typing right away.
  useDialogFocus(panelRef, onClose, nameRef)
  const nameField = register('name')

  const errorText = (message?: string) => message && t(message, { max: USER_NAME_MAX_LENGTH })

  function submit(values: UserFormValues) {
    if (isEmailTaken(values.email)) {
      setError('email', { message: 'form.validation.emailTaken' }, { shouldFocus: true })
      return
    }
    onSubmit(values)
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
                {t('form.createTitle')}
              </h2>
              <p className="text-xs text-text-subtle">{t('form.createSubtitle')}</p>
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
            <FormField
              label={t('form.password')}
              placeholder={t('form.passwordPlaceholder')}
              disabled
            />
            <Select
              label={t('form.role')}
              options={[{ value: 'VIEWER', label: t('form.roleViewer') }]}
              defaultValue="VIEWER"
            />
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

          <footer className="flex flex-wrap items-center justify-end gap-2.5 px-6 pt-3 pb-5.5">
            <Button label={t('form.cancel')} variant="outline" onClick={onClose} />
            <Button type="submit" label={t('form.create')} />
          </footer>
        </form>
      </div>
    </div>
  )
}
