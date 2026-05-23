import {
  IChartApi,
  ISeriesApi,
  LineSeries,
  LineStyle,
  SeriesType,
  Time,
} from 'lightweight-charts'
import type { StructurePivotPhase } from '@/types/chart'

const COLOR_PIVOT = '#2196f3' // Pivot horizontal — current phase

export type DrawOptions = {
  /**
   * Earliest visible bar date. The phase's anchor dates may pre-date this
   * because the phase started before the chart's lookback window — clip
   * inward so lightweight-charts doesn't drop the out-of-axis points and
   * mis-position the horizontal line.
   */
  clipBefore?: string
}

/**
 * Render the (minimal) Structure Pivot overlay onto an existing chart.
 *
 * Only one element is drawn: the latest phase's Pivot horizontal line
 * (= struct_long_break_val) with a "Pivot N" price label on the right axis.
 * Historical phases, HL/LL markers, the LL→HL structure diagonal, the
 * HL_BREAK ▲ marker and the Counter Trend line are intentionally omitted
 * to keep the chart uncluttered.
 *
 * "Latest phase" = the last entry in the (already date-asc) `phases` array,
 * regardless of whether broke_at is set — the Pivot level that just got
 * broken is the most relevant info on a HL_BREAK card.
 */
export function drawStructurePivot(
  chart: IChartApi,
  _candleSeries: ISeriesApi<SeriesType>,
  phases: StructurePivotPhase[] | undefined,
  opts: DrawOptions = {},
): void {
  const clipBefore = opts.clipBefore
  if (!phases || phases.length === 0) return

  const latest = phases[phases.length - 1]

  // Drop the phase entirely if it ended before the visible window.
  if (clipBefore != null && latest.phase_end_date < clipBefore) return

  const startDate =
    clipBefore != null && latest.phase_start_date < clipBefore
      ? clipBefore
      : latest.phase_start_date

  const pivotLine = chart.addSeries(LineSeries, {
    color: COLOR_PIVOT,
    lineWidth: 2,
    lineStyle: LineStyle.Solid,
    priceLineVisible: false,
    lastValueVisible: true,
    crosshairMarkerVisible: false,
    title: 'Pivot',
  })
  pivotLine.setData([
    { time: startDate as Time, value: latest.break_val },
    { time: latest.phase_end_date as Time, value: latest.break_val },
  ])
}
