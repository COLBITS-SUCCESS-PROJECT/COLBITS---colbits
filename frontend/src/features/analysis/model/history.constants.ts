/** Constants of the Historical Analysis feature. */
import type { PeriodPreset, PhaseClassification, ScopeFilter } from './history.types'

/** Value of a scope select that applies no filter at that level. */
export const ALL = 'ALL'

export const EMPTY_SCOPE: ScopeFilter = { zone: ALL, substation: ALL, circuit: ALL, node: ALL }

/** Order of the period chips in Figma (Period & Scope Selector). */
export const PERIOD_PRESETS: PeriodPreset[] = [
  'LAST_WEEK',
  'LAST_MONTH',
  'LAST_6_MONTHS',
  'LAST_YEAR',
  'CUSTOM',
]

/** Figma selects "Last month" when the view opens. */
export const DEFAULT_PRESET = 'LAST_MONTH' satisfies PeriodPreset

export const DAYS_PER_WEEK = 7
export const MONTHS_PER_HALF_YEAR = 6
export const MONTHS_PER_YEAR = 12

export const PHASE_CLASSIFICATIONS: PhaseClassification[] = ['MONOPHASIC', 'BIPHASIC', 'TRIPHASIC']

/** Semantic tokens (styles/semantic.css) — SVG attributes cannot take Tailwind classes. */
export const CHART_COLORS = {
  fuse: 'var(--color-chart-fuse)',
  voltage: 'var(--color-chart-voltage)',
  grid: 'var(--color-chart-grid)',
  axis: 'var(--color-chart-axis)',
  surface: 'var(--color-bg-surface)',
} as const

export const PHASE_COLORS: Record<PhaseClassification, string> = {
  MONOPHASIC: 'var(--color-phase-monophasic)',
  BIPHASIC: 'var(--color-phase-biphasic)',
  TRIPHASIC: 'var(--color-phase-triphasic)',
}

/** Tailwind classes of the legend squares, same colors as the chart marks. */
export const PHASE_SWATCH: Record<PhaseClassification, string> = {
  MONOPHASIC: 'bg-phase-monophasic',
  BIPHASIC: 'bg-phase-biphasic',
  TRIPHASIC: 'bg-phase-triphasic',
}

export const PERCENT = 100
