/** FaultPanelResizeHandle — draggable, keyboard-operable edge to widen the fault panel (desktop only). */
import { useTranslation } from 'react-i18next'
import type { useResizablePanel } from '../../hooks/useResizablePanel'

export type FaultPanelResizeHandleProps = Pick<
  ReturnType<typeof useResizablePanel>,
  'width' | 'min' | 'max' | 'handleProps'
>

export function FaultPanelResizeHandle({
  width,
  min,
  max,
  handleProps,
}: Readonly<FaultPanelResizeHandleProps>) {
  const { t } = useTranslation('dashboard')

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t('panel.resize')}
      aria-controls="fault-panel"
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title={t('panel.resizeHint')}
      className="hidden w-1.5 shrink-0 cursor-col-resize touch-none transition-colors hover:bg-border-focus/40 focus-visible:bg-border-focus focus-visible:outline-none xl:block"
      {...handleProps}
    />
  )
}
