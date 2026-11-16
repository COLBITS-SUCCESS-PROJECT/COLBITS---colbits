/** SelectCardButton — invisible button over a whole panel card: clicking the card centers the map on its node and opens its detail (M13). */
import { useTranslation } from 'react-i18next'

export interface SelectCardButtonProps {
  nodeId: string
  onSelect: (nodeId: string) => void
}

/**
 * Goes inside a `relative` card. The card keeps its `article` role and its text; the button only
 * adds the click, the keyboard focus and a name that says what it does.
 */
export function SelectCardButton({ nodeId, onSelect }: SelectCardButtonProps) {
  const { t } = useTranslation('dashboard')
  return (
    <button
      type="button"
      aria-label={t('panel.showOnMap', { nodeId })}
      onClick={() => onSelect(nodeId)}
      className="absolute inset-0 z-10 cursor-pointer rounded-lg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-border-focus"
    />
  )
}

/** Extra classes of a card that can be selected. */
export const SELECTABLE_CARD_CLASS = 'transition-colors hover:border-border-strong'
