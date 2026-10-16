/** LoginForm organism — username and password with validation and the error of a failed login (Figma: Login / Default). */
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { Button } from '@/design-system/atoms'
import { FormField } from '@/design-system/molecules'
import { loginSchema, type LoginFormValues } from '../../schemas/login.schema'

export interface LoginFormProps {
  onSubmit: (values: LoginFormValues) => void
  isSubmitting: boolean
  /** Translated message of the last failed attempt, shown above the button. */
  errorMessage?: string
}

const EMPTY_FORM: LoginFormValues = { username: '', password: '' }

export function LoginForm({ onSubmit, isSubmitting, errorMessage }: LoginFormProps) {
  const { t } = useTranslation('auth')
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema), defaultValues: EMPTY_FORM })

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <FormField
        label={t('login.username')}
        placeholder={t('login.usernamePlaceholder')}
        autoComplete="username"
        required
        error={errors.username?.message && t(errors.username.message)}
        {...register('username')}
      />
      <FormField
        type="password"
        label={t('login.password')}
        placeholder={t('login.passwordPlaceholder')}
        autoComplete="current-password"
        required
        error={errors.password?.message && t(errors.password.message)}
        {...register('password')}
      />
      {errorMessage && (
        <p
          role="alert"
          className="rounded-lg bg-feedback-danger-bg px-3 py-2.5 text-sm text-feedback-danger-text"
        >
          {errorMessage}
        </p>
      )}
      <Button type="submit" label={t('login.submit')} isLoading={isSubmitting} isFullWidth />
    </form>
  )
}
