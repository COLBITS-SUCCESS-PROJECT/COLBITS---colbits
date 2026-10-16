/** FormField molecule — label, input and an error message linked for screen readers (Figma: Input · Label / Error). */
import { useId } from 'react'
import { Input, Label, type InputProps } from '@/design-system/atoms'
import { cn } from '@/utils/cn'

export interface FormFieldProps extends Omit<InputProps, 'hasError' | 'aria-describedby'> {
  /** Visible label text. */
  label: string
  /** Error message. When set, the input is marked invalid and the message is announced. */
  error?: string
  /** Shows the required asterisk. Pass `required` instead to mark it for screen readers only. */
  isRequired?: boolean
}

export function FormField({
  label,
  error,
  isRequired = false,
  id,
  className,
  ...rest
}: FormFieldProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const errorId = `${inputId}-error`

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={inputId} text={label} isRequired={isRequired} />
      <Input
        id={inputId}
        hasError={Boolean(error)}
        required={isRequired || undefined}
        aria-describedby={error ? errorId : undefined}
        {...rest}
      />
      {error && (
        <p id={errorId} className="text-xs text-text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
