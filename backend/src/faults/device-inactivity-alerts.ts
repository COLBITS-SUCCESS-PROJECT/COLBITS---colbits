import type { InactiveDeviceRow } from '../device/inactive-devices.service';
import { RecordGap, inactivityPeriods } from '../device/inactivity-periods';
import type { ActiveFaultDto } from './dto/faults.dto';
import {
  toFalconAlertDto,
  toTransformerAlertDto,
} from './device-alert-queries';
import type { PerDeviceSetting } from './faults.service';
import { openDurationSeconds } from './source-alarms';

/**
 * DEVICE_INACTIVITY of the fault list (F-38, F-39, F-46; NF-07). It is the alarm that
 * GET /device/inactive derives: the same statement (INACTIVE_DEVICES_SQL), the same thresholds and
 * the same rule (device/inactivity-periods.ts), reused as they are. A device is silent from
 * `previous record + threshold` (a gap strictly longer than the threshold) until its next record
 * (the period end); the period is OPEN while that record does not exist. A device that never
 * reported has no period and no entry here: it is only listed in GET /device/inactive (Product
 * Owner decision, 15 Nov 2026).
 */

/**
 * Every inactivity period of the devices of one statement result that touches the window
 * [windowStart, now], as a fault-list entry: OPEN with no end, RESOLVED with the end taken from the
 * record that ended it. The caller keeps the ones it needs (the open ones, or those that ended in
 * a window). `hours` are the thresholds the statement was run with.
 */
export function toInactivityAlertDtos(
  rows: readonly InactiveDeviceRow[],
  hours: PerDeviceSetting,
  windowStart: Date,
  now: Date,
): ActiveFaultDto[] {
  const alerts: ActiveFaultDto[] = [];
  for (const row of rows) {
    const thresholdHours = row.kind === 'FALCON' ? hours.falcon : hours.smac;
    const rawGaps =
      typeof row.gaps === 'string' ? JSON.parse(row.gaps) : row.gaps;
    const gaps: RecordGap[] = (
      rawGaps as { from: string; next: string | null }[]
    ).map((gap) => ({
      from: new Date(gap.from),
      next: gap.next === null ? null : new Date(gap.next),
    }));
    for (const period of inactivityPeriods(
      gaps,
      thresholdHours,
      windowStart,
      now,
    )) {
      alerts.push(toInactivityAlertDto(row, period.start, period.end, now));
    }
  }
  return alerts;
}

/**
 * One period as a fault-list entry. A Falcon is a fuse-level entry (fuse set, branch and the phase
 * of its fuse, like FREE_FALL) and a SMAC a transformer-level one (like OVERLOAD_UNBALANCE). The id
 * is `DEVICE_INACTIVITY:<source>:<start>`: the start is previous record + threshold, so it does not
 * change while the period is open nor when it resolves.
 */
export function toInactivityAlertDto(
  row: Pick<
    InactiveDeviceRow,
    | 'kind'
    | 'source_id'
    | 'node_id'
    | 'circuit_id'
    | 'circuit_name'
    | 'fuses_set_id'
    | 'branch'
    | 'phase'
  >,
  start: Date,
  end: Date | null,
  now: Date,
): ActiveFaultDto {
  const open =
    row.kind === 'FALCON'
      ? toFalconAlertDto(
          'DEVICE_INACTIVITY',
          {
            source_id: row.source_id,
            node_id: row.node_id,
            circuit_id: row.circuit_id,
            circuit_name: row.circuit_name,
            fuses_set_id: row.fuses_set_id as number | string,
            branch: row.branch ?? null,
            phase: row.phase ?? null,
            started_at: start,
          },
          now,
        )
      : toTransformerAlertDto('DEVICE_INACTIVITY', row, start, now);
  if (end !== null) {
    open.state = 'RESOLVED';
    open.ended_at = end.toISOString();
    open.duration_seconds = openDurationSeconds(start, now, end);
  }
  return open;
}
