/** FaultTrendChart — fuse openings and voltage absences per interval as two areas, with totals in the legend (F-66, Figma: Chart Card · Fault trend). */
import { useTranslation } from 'react-i18next'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { CHART_COLORS } from '../../model/history.constants'
import type { HistorySummary } from '../../model/history.types'
import { fromIsoDate } from '../../model/periodRange'

export interface FaultTrendChartProps {
  summary: HistorySummary
  expanded?: boolean
}

const CHART_HEIGHT = 190
const FILL_OPACITY = 0.08
const STROKE_WIDTH = 2
const AXIS_FONT_SIZE = 11

const SERIES = [
  { key: 'fuseOpenings', color: CHART_COLORS.fuse, swatch: 'bg-chart-fuse' },
  { key: 'voltageAbsences', color: CHART_COLORS.voltage, swatch: 'bg-chart-voltage' },
] as const

export function FaultTrendChart({ summary, expanded = false }: FaultTrendChartProps) {
  const { t, i18n } = useTranslation('analysis')
  const dayFormat = new Intl.DateTimeFormat(i18n.language, {
    day: '2-digit',
    month: 'short',
    ...(summary.interval === 'MONTH' && { day: undefined, year: 'numeric' }),
  })
  const formatStart = (start: string) =>
    dayFormat.format(fromIsoDate(start)).replace(/\./g, '').replace(/ de /g, ' ')

  return (
    <>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
        {SERIES.map(({ key, swatch }) => (
          <li key={key} className="flex items-center gap-2 text-label">
            <span aria-hidden="true" className={`size-2.5 rounded-[3px] ${swatch}`} />
            <span className="font-medium text-text-primary">{t(`trend.${key}`)}</span>
            <span className="font-semibold text-text-secondary tabular-nums">
              {summary.totals[key]}
            </span>
          </li>
        ))}
      </ul>
      <div aria-hidden="true" className="min-w-0 flex-1">
        <ResponsiveContainer width="100%" height={expanded ? 320 : CHART_HEIGHT}>
          <AreaChart data={summary.trend} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
            <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
            <YAxis hide allowDecimals={false} />
            <XAxis
              dataKey="start"
              tickFormatter={formatStart}
              tick={{ fill: CHART_COLORS.axis, fontSize: expanded ? 14 : AXIS_FONT_SIZE }}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
              interval="preserveStartEnd"
            />
            <Tooltip
              labelFormatter={(start) => formatStart(String(start))}
              cursor={{ stroke: CHART_COLORS.axis, strokeDasharray: '3 3' }}
              contentStyle={{
                backgroundColor: CHART_COLORS.surface,
                borderColor: CHART_COLORS.grid,
                borderRadius: 8,
                fontSize: '0.75rem',
                lineHeight: 1.35,
                padding: '0.375rem 0.5rem',
              }}
              itemStyle={{ padding: 0 }}
              labelStyle={{ fontWeight: 600 }}
              separator=": "
              isAnimationActive={false}
            />
            {SERIES.map(({ key, color }) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                name={t(`trend.${key}`)}
                stroke={color}
                strokeWidth={STROKE_WIDTH}
                dot={summary.trend.length === 1}
                fill={color}
                fillOpacity={FILL_OPACITY}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {/* The same numbers for screen readers (AGENT.md §16): the SVG is decorative. */}
      <div className="sr-only top-0 left-0">
        <table>
          <caption>{t('trend.tableCaption')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('trend.interval')}</th>
              <th scope="col">{t('trend.fuseOpenings')}</th>
              <th scope="col">{t('trend.voltageAbsences')}</th>
            </tr>
          </thead>
          <tbody>
            {summary.trend.map((point) => (
              <tr key={point.start}>
                <th scope="row">{formatStart(point.start)}</th>
                <td>{point.fuseOpenings}</td>
                <td>{point.voltageAbsences}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
