/** ScenarioActionGroup molecule — one group of the demo scenario panel: what to act on, its phase and one button per action. */
import { Button, Icon, type IconName } from '@/design-system/atoms'
import { Select, type SelectOption } from '@/design-system/molecules'

export interface ScenarioPicker {
  label: string
  options: SelectOption[]
  value: string
  onChange: (value: string) => void
}

export interface ScenarioButton {
  code: string
  label: string
  /** Tooltip, for an action the panel has no label for yet. */
  hint?: string
  /** The action needs a phase and the transformer has none to offer. */
  isDisabled: boolean
  onRun: () => void
}

export interface ScenarioActionGroupProps {
  title: string
  icon: IconName
  target: ScenarioPicker
  /** Phase picker, for the groups whose actions need one. */
  channel?: ScenarioPicker
  actions: ScenarioButton[]
  /** Code of the action being sent. Every button waits meanwhile, so two actions never cross. */
  runningAction: string | null
}

export function ScenarioActionGroup({
  title,
  icon,
  target,
  channel,
  actions,
  runningAction,
}: ScenarioActionGroupProps) {
  const isBusy = runningAction !== null

  return (
    <section
      aria-label={title}
      className="flex flex-col gap-3 rounded-lg border border-border-default bg-bg-surface-alt p-3"
    >
      <h4 className="flex items-center gap-2 text-sm font-semibold text-text-heading">
        <Icon name={icon} size="sm" />
        {title}
      </h4>
      {/* One picker takes the whole width, so a long fuse label is not cut. */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <PickerSelect picker={target} isDisabled={isBusy} />
        {channel && <PickerSelect picker={channel} isDisabled={isBusy} />}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {actions.map((action) => (
          <Button
            key={action.code}
            label={action.label}
            title={action.hint}
            variant="outline"
            isLoading={runningAction === action.code}
            disabled={isBusy || action.isDisabled}
            onClick={action.onRun}
          />
        ))}
      </div>
    </section>
  )
}

interface PickerSelectProps {
  picker: ScenarioPicker
  isDisabled: boolean
}

function PickerSelect({ picker, isDisabled }: PickerSelectProps) {
  return (
    <Select
      className="flex-1"
      label={picker.label}
      options={picker.options}
      value={picker.value}
      disabled={isDisabled || picker.options.length === 0}
      onChange={(event) => picker.onChange(event.target.value)}
    />
  )
}
