/** PhaseDistributionChart — donut of faults by single-, two- and three-phase classification, with count and share (F-67, Figma: Chart Card · Phase distribution). */
import { useTranslation } from 'react-i18next'
import { Cell, Pie, PieChart } from 'recharts'
import {
  CHART_COLORS,
  PHASE_CLASSIFICATIONS,
  PHASE_COLORS,
  PHASE_SWATCH,
} from '../../model/history.constants'
import type { PhaseClassification } from '../../model/history.types'
import { phaseShares } from '../../model/phaseShares'

export interface PhaseDistributionChartProps {
  unclassified?: number
  expanded?: boolean
  distribution: Record<PhaseClassification, number>
}

const DONUT_SIZE = 160
const OUTER_RADIUS = 64
const INNER_RADIUS = 40
const SLICE_GAP = 2
/** Figma starts the first slice at 12 o'clock and goes clockwise. */
const START_ANGLE = 90
const END_ANGLE = -270

export function PhaseDistributionChart({
  distribution,
  unclassified = 0,
  expanded = false,
}: PhaseDistributionChartProps) {
  const { t } = useTranslation('analysis')
  const scale = expanded ? 1.5 : 1
  const shares = phaseShares(distribution)
  const slices = PHASE_CLASSIFICATIONS.map((key) => ({ key, value: distribution[key] }))

  return (
    <div className="flex flex-1 flex-wrap content-center items-center justify-center gap-x-8 gap-y-2">
      <div className="relative shrink-0">
        <PieChart
          width={DONUT_SIZE * scale}
          height={DONUT_SIZE * scale}
          role="img"
          aria-label={t('phase.chartLabel', distribution)}
        >
          <Pie
            data={slices}
            dataKey="value"
            nameKey="key"
            innerRadius={INNER_RADIUS * scale}
            outerRadius={OUTER_RADIUS * scale}
            startAngle={START_ANGLE}
            endAngle={END_ANGLE}
            stroke={CHART_COLORS.surface}
            strokeWidth={SLICE_GAP}
            isAnimationActive={false}
          >
            {slices.map(({ key }) => (
              <Cell key={key} fill={PHASE_COLORS[key]} />
            ))}
          </Pie>
        </PieChart>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
        >
          <span className="text-lg font-semibold leading-tight text-text-heading tabular-nums">
            {slices.reduce((total, slice) => total + slice.value, 0)}
          </span>
          <span className="text-xs text-text-secondary">{t('phase.total')}</span>
        </div>
      </div>
      <ul className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-3">
        {PHASE_CLASSIFICATIONS.map((key) => (
          <li key={key} className="col-span-3 grid grid-cols-subgrid items-center text-label">
            <span aria-hidden="true" className={`size-2.5 rounded-[3px] ${PHASE_SWATCH[key]}`} />
            <span className="font-medium text-text-primary">{t(`phase.${key}`)}</span>
            <span className="text-end font-semibold whitespace-pre text-text-secondary tabular-nums">
              {`${distribution[key]}  (${shares[key]}%)`}
            </span>
          </li>
        ))}
      </ul>
      {unclassified > 0 && (
        <p className="basis-full text-center text-xs text-text-secondary">
          {t('phase.unclassified', { count: unclassified })}
        </p>
      )}
    </div>
  )
}
