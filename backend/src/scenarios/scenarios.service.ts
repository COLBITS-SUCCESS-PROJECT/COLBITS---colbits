import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { isInactiveNow } from '../device/inactivity-periods';
import {
  LOW_ENERGY_SETTINGS,
  isLowEnergy,
  lowEnergyThreshold,
} from '../device/low-energy';
import {
  OVERLOAD_ALERTS_SQL,
  OverloadAlertRow,
  toOverloadAlertDto,
} from '../faults/device-alert-queries';
import { resolveDeviceAlertThresholds } from '../faults/device-alert-thresholds';
import {
  FREE_FALL_ACTIVATION_EVENT_TYPE_PATTERN,
  activeOverloadConditions,
} from '../faults/device-alerts';
import { ALERT_TYPE_DEFINITIONS } from '../faults/fault-alert-types';
import { DEFAULT_FALCON_INACTIVITY_HOURS } from '../nodes/fuse-state';
import { Node } from '../nodes/node.entity';
import { DEFAULT_SMAC_INACTIVITY_HOURS } from '../nodes/smac-state';
import { phaseCountOf, phaseOfChannel } from '../nodes/transformer-state';
import { applyNodeScope } from '../scope/scope-query.helper';
import { ScopeContext } from '../scope/scope.types';
import {
  RunScenarioDto,
  ScenarioResultDto,
  ScenariosStatusDto,
} from './dto/scenarios.dto';
import {
  CLOSED_FUSE_ANGLE,
  DEFAULT_FIRMWARE,
  DEMO_SCENARIOS_DATABASE_SETTING,
  DEMO_SCENARIOS_SETTING,
  EventScenarioActionDefinition,
  OPEN_FUSE_ANGLE,
  SCENARIO_ACTIONS,
  SCENARIO_ACTION_NAMES,
  SOLAR_PANEL_FAILED,
  ScenarioAction,
  ScenarioChannel,
  ScenarioDevice,
  SilenceScenarioActionDefinition,
  TELEMETRY_CONDITION_STATES,
  TelemetryCondition,
  TelemetryScenarioActionDefinition,
  alarmTextOf,
  alarmValueOf,
  eventCodeOf,
  expectedEffectOf,
  isScenarioAction,
  drainedEnergyLevel,
  isScenarioChannel,
  normalLoad,
  overloadedLoad,
  phaseVoltsOf,
  rechargedEnergyLevel,
  repeatsCurrentState,
  scenarioActionDefinition,
  silenceCutoff,
} from './scenario-actions';
import { nextRecordedAt } from './scenario-timestamps';

export const FUSE_TARGET_SQL = `
  SELECT f.custom_id, f.current_hw_id AS hw_id, fs.node_id,
         l.fuse_state, l.is_voltage_present
  FROM public.fuses f
  JOIN public.fuses_sets fs ON fs.id = f.fuses_set_id
  LEFT JOIN public.last_falcon_values l ON l.hw_id = f.current_hw_id
  WHERE f.custom_id = $1
`;

export const TRANSFORMER_TARGET_SQL = `
  SELECT t.custom_id, t.current_hw_id AS hw_id, t.node_id, l.va, l.vb, l.vc,
         (l.hw_id IS NOT NULL) AS has_reading
  FROM public.trafos t
  LEFT JOIN public.last_smac_vc_values l ON l.hw_id = t.current_hw_id
  WHERE t.custom_id = $1
`;

/**
 * Latest event of one alarm of the target (by custom_id, or by device when the event has none).
 * At the same instant a SET wins, the same tie rule as the fault list.
 */
export const LATEST_EVENT_SQL = `
  SELECT upper(a.event_type) AS event_type
  FROM public.alarms a
  WHERE (a.custom_id = $1 OR (a.custom_id IS NULL AND a.hw_id = $2))
    AND a.event_code ~ $3
    AND upper(a.event_type) IN ('SET', 'CLEAR')
  ORDER BY a.recorded_at DESC, (upper(a.event_type) = 'SET') DESC
  LIMIT 1
`;

/** Firmware digits of the device's latest event, so new codes look like its own. */
export const FIRMWARE_SQL = `
  SELECT substring(a.event_code FROM 3 FOR 2) AS firmware
  FROM public.alarms a
  WHERE a.hw_id = $1 AND a.event_code ~ '^(13|05)[0-9]{2}'
  ORDER BY a.recorded_at DESC
  LIMIT 1
`;

/** New Falcon reading: the latest one with the fuse or voltage state changed ($4-$6 null = keep). */
export const INSERT_FALCON_READING_SQL = `
  INSERT INTO public.falcon_values (
    hw_id, custom_id, post, recorded_at, angle_incl, internal_temperature, supercaps_per,
    solar_panel, fuse_state, is_voltage_present, is_fuse_alarm, is_free_fall_alarm,
    is_solar_panel_alarm)
  SELECT $1, $2, l.post, $3::timestamptz, COALESCE($7::float8, l.angle_incl),
         l.internal_temperature, l.supercaps_per, l.solar_panel,
         COALESCE($4::text, l.fuse_state, 'Cerrado'),
         COALESCE($5::boolean, l.is_voltage_present, true),
         COALESCE($6::boolean, l.is_fuse_alarm, false),
         COALESCE(l.is_free_fall_alarm, false), COALESCE(l.is_solar_panel_alarm, false)
  FROM (SELECT 1) AS one
  LEFT JOIN public.last_falcon_values l ON l.hw_id = $1
`;

/** New SMAC reading: the latest one with the voltage of channel $4 set to $5. */
export const INSERT_SMAC_READING_SQL = `
  INSERT INTO public.smac_vc_values (
    hw_id, custom_id, recorded_at, internal_temperature, battery_per, va, vb, vc,
    ia, ib, ic, in_, cuf_percent, vuf_percent, load_percent)
  SELECT $1, $2, $3::timestamptz, l.internal_temperature, l.battery_per,
         CASE WHEN $4 = 'A' THEN $5::float8 ELSE l.va END,
         CASE WHEN $4 = 'B' THEN $5::float8 ELSE l.vb END,
         CASE WHEN $4 = 'C' THEN $5::float8 ELSE l.vc END,
         CASE WHEN $4 = 'A' AND $6 THEN 0 ELSE l.ia END,
         CASE WHEN $4 = 'B' AND $6 THEN 0 ELSE l.ib END,
         CASE WHEN $4 = 'C' AND $6 THEN 0 ELSE l.ic END,
         l.in_, l.cuf_percent, l.vuf_percent, l.load_percent
  FROM (SELECT 1) AS one
  LEFT JOIN public.last_smac_vc_values l ON l.hw_id = $1
`;

export const INSERT_ALARM_SQL = `
  INSERT INTO public.alarms (hw_id, custom_id, event_code, event_type, alarm, value, recorded_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz)
`;

/**
 * SCRUM-253: one scenario at a time per device. Held until the transaction ends, so the state
 * check and the writes of one request never interleave with another request on the same device.
 */
export const LOCK_DEVICE_SQL = `
  SELECT pg_advisory_xact_lock(hashtextextended('colbits.scenario-device:' || $1, 0))
`;

/**
 * SCRUM-253: the database clock and the device's latest record (any reading table, any event),
 * read under the device lock to stamp the next write (scenario-timestamps.ts).
 */
export const DEVICE_CLOCK_SQL = `
  SELECT clock_timestamp() AS database_now,
         GREATEST(
           (SELECT recorded_at FROM public.last_falcon_values WHERE hw_id = $1),
           (SELECT recorded_at FROM public.last_smac_vc_values WHERE hw_id = $1),
           (SELECT recorded_at FROM public.last_smac_pw_values WHERE hw_id = $1),
           (SELECT recorded_at FROM public.last_smac_pf_values WHERE hw_id = $1),
           (SELECT max(recorded_at) FROM public.alarms WHERE hw_id = $1)
         ) AS latest_at
`;

/**
 * SCRUM-253: the database the API is connected to, and whether it has the synthetic-dataset marker
 * table (written only by the synthetic seed and the generator, never by the API or Colbits' schema).
 */
export const DEMO_DATABASE_SQL = `
  SELECT current_database() AS database_name,
         to_regclass('public.synthetic_dataset') IS NOT NULL AS has_marker_table
`;

/** SCRUM-253: a marker for this very database (a copied database still names the original one). */
export const SYNTHETIC_MARKER_SQL = `
  SELECT EXISTS (
    SELECT 1 FROM public.synthetic_dataset WHERE database_name = current_database()
  ) AS marked
`;

/** `column` holds a finite number (NaN and +-Infinity are no measurement, as in SCRUM-245). */
const finite = (column: string): string =>
  `${column} IS NOT NULL AND ${column}::text NOT IN ('NaN', 'Infinity', '-Infinity')`;

/**
 * SCRUM-253: state of the telemetry conditions, each read with the rule of the alert that shows it,
 * under the device lock. Low energy (F-44, F-45): the level of the latest reading (last_* tables),
 * as GET /device/low-energy reads it.
 */
export const SUPERCAPS_LEVEL_SQL = `
  SELECT supercaps_per::float8 AS value FROM public.last_falcon_values WHERE hw_id = $1
`;
export const BATTERY_LEVEL_SQL = `
  SELECT battery_per::float8 AS value FROM public.last_smac_vc_values WHERE hw_id = $1
`;

/** Overload (SCRUM-245): the newest finite load_percent of the transformer; NULL changes nothing. */
export const LOAD_LEVEL_SQL = `
  SELECT v.load_percent::float8 AS value FROM public.smac_vc_values v
  WHERE v.hw_id = $1 AND ${finite('v.load_percent')}
  ORDER BY v.recorded_at DESC LIMIT 1
`;

/**
 * Free fall (SCRUM-245, FREE_FALL_ALERTS_SQL): active while a 13xx01 SET or MSG event of the fuse
 * ($1 custom_id) is at or after the last reading of its device ($2) with is_free_fall_alarm false.
 * $3 the FREE_FALL code pattern, $4 the activation event types.
 */
export const FREE_FALL_ACTIVE_SQL = `
  SELECT EXISTS (
    SELECT 1 FROM public.alarms a
    WHERE a.custom_id = $1 AND a.event_code ~ $3::text AND a.event_type ~* $4::text
      AND a.recorded_at >= COALESCE(
        (SELECT max(v.recorded_at) FROM public.falcon_values v
          WHERE v.hw_id = $2 AND v.is_free_fall_alarm = false),
        '-infinity'::timestamptz)
  ) AS active
`;

/** Solar panel (SCRUM-245, CL-10): the newest non-null is_solar_panel_alarm is the alert. */
export const SOLAR_PANEL_FLAG_SQL = `
  SELECT v.is_solar_panel_alarm AS value FROM public.falcon_values v
  WHERE v.hw_id = $1 AND v.is_solar_panel_alarm IS NOT NULL
  ORDER BY v.recorded_at DESC LIMIT 1
`;

/**
 * What a stop writes back: the device's newest value from while the condition was off ($2 the
 * threshold). None found: the fallback of scenario-actions.ts.
 */
export const SUPERCAPS_RESTORE_SQL = `
  SELECT v.supercaps_per::float8 AS value FROM public.falcon_values v
  WHERE v.hw_id = $1 AND v.supercaps_per >= $2::float8
  ORDER BY v.recorded_at DESC LIMIT 1
`;
export const BATTERY_RESTORE_SQL = `
  SELECT v.battery_per::float8 AS value FROM public.smac_vc_values v
  WHERE v.hw_id = $1 AND v.battery_per >= $2::float8
  ORDER BY v.recorded_at DESC LIMIT 1
`;
export const LOAD_RESTORE_SQL = `
  SELECT v.load_percent::float8 AS value FROM public.smac_vc_values v
  WHERE v.hw_id = $1 AND ${finite('v.load_percent')} AND v.load_percent::float8 <= $2::float8
  ORDER BY v.recorded_at DESC LIMIT 1
`;
/** The solar_panel value of the newest reading without the alarm; none found: kept as it is. */
export const SOLAR_PANEL_RESTORE_SQL = `
  SELECT v.solar_panel::float8 AS value FROM public.falcon_values v
  WHERE v.hw_id = $1 AND v.is_solar_panel_alarm IS NOT TRUE AND ${finite('v.solar_panel')}
  ORDER BY v.recorded_at DESC LIMIT 1
`;

/**
 * SCRUM-253: new Falcon reading of a telemetry action: the latest one with only the action's own
 * fields changed ($4 supercaps_per, $5 solar_panel, $6 is_free_fall_alarm, $7 is_solar_panel_alarm;
 * null = keep). Everything else, including the fuse state and its angle, is copied as it is.
 */
export const INSERT_FALCON_TELEMETRY_SQL = `
  INSERT INTO public.falcon_values (
    hw_id, custom_id, post, recorded_at, angle_incl, internal_temperature, supercaps_per,
    solar_panel, fuse_state, is_voltage_present, is_fuse_alarm, is_free_fall_alarm,
    is_solar_panel_alarm)
  SELECT $1, $2, l.post, $3::timestamptz, l.angle_incl, l.internal_temperature,
         COALESCE($4::int, l.supercaps_per), COALESCE($5::real, l.solar_panel),
         l.fuse_state, l.is_voltage_present, l.is_fuse_alarm,
         COALESCE($6::boolean, l.is_free_fall_alarm),
         COALESCE($7::boolean, l.is_solar_panel_alarm)
  FROM (SELECT 1) AS one
  LEFT JOIN public.last_falcon_values l ON l.hw_id = $1
`;

/**
 * SCRUM-253: new SMAC reading of a telemetry action ($4 battery_per, $5 load_percent; null = keep).
 * Voltages, currents and the imbalance values (vuf / cuf) are always copied: overload never
 * touches an imbalance.
 */
export const INSERT_SMAC_TELEMETRY_SQL = `
  INSERT INTO public.smac_vc_values (
    hw_id, custom_id, recorded_at, internal_temperature, battery_per, va, vb, vc,
    ia, ib, ic, in_, cuf_percent, vuf_percent, load_percent)
  SELECT $1, $2, $3::timestamptz, l.internal_temperature,
         COALESCE($4::int, l.battery_per), l.va, l.vb, l.vc, l.ia, l.ib, l.ic, l.in_,
         l.cuf_percent, l.vuf_percent, COALESCE($5::numeric, l.load_percent)
  FROM (SELECT 1) AS one
  LEFT JOIN public.last_smac_vc_values l ON l.hw_id = $1
`;

/**
 * SCRUM-253: the database clock and the device's latest record by the inactivity rule (F-36, F-37,
 * the same tables as GET /device/inactive, the map and the node detail): last_falcon_values for a
 * Falcon, the newest of the three last_smac_* tables for a SMAC. $2 'FALCON' or 'SMAC'.
 */
const LAST_RECORD_AT = `
  CASE WHEN $2::text = 'FALCON'
    THEN (SELECT recorded_at FROM public.last_falcon_values WHERE hw_id = $1)
    ELSE GREATEST(
      (SELECT recorded_at FROM public.last_smac_vc_values WHERE hw_id = $1),
      (SELECT recorded_at FROM public.last_smac_pw_values WHERE hw_id = $1),
      (SELECT recorded_at FROM public.last_smac_pf_values WHERE hw_id = $1))
  END`;
export const DEVICE_LAST_RECORD_SQL = `
  SELECT clock_timestamp() AS database_now, ${LAST_RECORD_AT} AS last_at
`;

/**
 * SCRUM-253: deliberate silences. SILENCE records one row per device in
 * public.demo_silenced_devices, which only the synthetic loaders create (the seed and the
 * generator, which also empties it on every run); the API never creates it. A missing table means
 * no device is deliberately silenced.
 */
export const SILENCE_TABLE_SQL = `
  SELECT to_regclass('public.demo_silenced_devices') IS NOT NULL AS value
`;

/**
 * SCRUM-253: whether the device's silence still holds: it has a row, and no record of the device
 * is after the row's cutoff. A record after it (RESUME, the device itself, a data refresh) proves it
 * reported again, so an old row never makes a device that later went stale count as silenced.
 * No row: not silenced. $1 hw_id, $2 'FALCON' or 'SMAC'.
 */
export const SILENCE_INTACT_SQL = `
  SELECT COALESCE(${LAST_RECORD_AT} <= s.cutoff, true) AS value
  FROM public.demo_silenced_devices s WHERE s.hw_id = $1
`;

/** SCRUM-253: SILENCE records the silence, in the transaction of its deletion. */
export const RECORD_SILENCE_SQL = `
  INSERT INTO public.demo_silenced_devices (hw_id, source_id, cutoff, silenced_at)
  VALUES ($1, $2, $3::timestamptz, $4::timestamptz)
  ON CONFLICT (hw_id) DO UPDATE
    SET source_id = EXCLUDED.source_id, cutoff = EXCLUDED.cutoff, silenced_at = EXCLUDED.silenced_at
`;

/** SCRUM-253: RESUME removes it, in the transaction of its reading. */
export const CLEAR_SILENCE_SQL = `
  DELETE FROM public.demo_silenced_devices WHERE hw_id = $1
`;

/**
 * SCRUM-253: a baseline at or before the cutoff ($2), the reading RESUME copies later: in
 * falcon_values for a Falcon, in smac_vc_values for a SMAC (RESUME writes a smac_vc reading).
 */
export const FALCON_BASELINE_SQL = `
  SELECT EXISTS (
    SELECT 1 FROM public.falcon_values WHERE hw_id = $1 AND recorded_at <= $2::timestamptz
  ) AS value
`;
export const SMAC_BASELINE_SQL = `
  SELECT EXISTS (
    SELECT 1 FROM public.smac_vc_values WHERE hw_id = $1 AND recorded_at <= $2::timestamptz
  ) AS value
`;

/** SCRUM-253: alarm events of the device ($1) or of its fuse / transformer ($2) after the cutoff ($3). */
export const ALARMS_AFTER_CUTOFF_SQL = `
  SELECT count(*)::int AS value FROM public.alarms
  WHERE (hw_id = $1 OR custom_id = $2) AND recorded_at > $3::timestamptz
`;

/** SCRUM-253: RESUME copies the device's latest reading; it needs one. */
export const FALCON_HAS_READING_SQL = `
  SELECT EXISTS (SELECT 1 FROM public.last_falcon_values WHERE hw_id = $1) AS value
`;
export const SMAC_HAS_READING_SQL = `
  SELECT EXISTS (SELECT 1 FROM public.last_smac_vc_values WHERE hw_id = $1) AS value
`;

const FALCON_COLUMNS =
  'hw_id, custom_id, post, recorded_at, angle_incl, internal_temperature, supercaps_per, ' +
  'solar_panel, fuse_state, is_voltage_present, is_fuse_alarm, is_free_fall_alarm, is_solar_panel_alarm';
const SMAC_VC_COLUMNS =
  'hw_id, custom_id, recorded_at, internal_temperature, battery_per, va, vb, vc, ia, ib, ic, in_, ' +
  'cuf_percent, vuf_percent, load_percent';
const SMAC_PW_COLUMNS =
  'hw_id, custom_id, recorded_at, phase_a_active_power, phase_b_active_power, phase_c_active_power, ' +
  'phase_a_reactive_power, phase_b_reactive_power, phase_c_reactive_power, phase_a_apparent_power, ' +
  'phase_b_apparent_power';
const SMAC_PF_COLUMNS =
  'hw_id, custom_id, recorded_at, phase_c_apparent_power, phase_a_power_factor, ' +
  'phase_b_power_factor, phase_c_power_factor';

/** The three statements of one telemetry table in a SILENCE ($1 hw_id, $2 cutoff). */
export interface SilenceStatements {
  /** Removes the device's readings after the cutoff, in this table only. */
  deleteRecent: string;
  /** Empties the device's latest-value row ... */
  clearLatest: string;
  /** ... and rebuilds it from the newest reading left (none left: no row, which is inactive). */
  rebuildLatest: string;
}

const silenceStatements = (
  table: string,
  columns: string,
): SilenceStatements => ({
  deleteRecent: `DELETE FROM public.${table} WHERE hw_id = $1 AND recorded_at > $2::timestamptz`,
  clearLatest: `DELETE FROM public.last_${table} WHERE hw_id = $1`,
  rebuildLatest: `INSERT INTO public.last_${table} (${columns})
    SELECT ${columns} FROM public.${table} WHERE hw_id = $1 ORDER BY recorded_at DESC LIMIT 1`,
});

/**
 * SCRUM-253: what a SILENCE writes, per device type: a Falcon has one telemetry table, a SMAC three
 * (its latest record is the newest of the three, TD-07). Colbits' triggers only run on INSERT into
 * the history tables, so the latest-value rows are rebuilt here, in the same transaction.
 */
export const SILENCE_STATEMENTS: Readonly<
  Record<ScenarioDevice, readonly SilenceStatements[]>
> = {
  FALCON: [silenceStatements('falcon_values', FALCON_COLUMNS)],
  SMAC: [
    silenceStatements('smac_vc_values', SMAC_VC_COLUMNS),
    silenceStatements('smac_pw_values', SMAC_PW_COLUMNS),
    silenceStatements('smac_pf_values', SMAC_PF_COLUMNS),
  ],
};

/** A repository or a transaction's entity manager: whatever the query runs on. */
interface Queryable {
  query(sql: string, parameters?: unknown[]): Promise<unknown>;
}

interface FuseTarget {
  custom_id: string;
  hw_id: string | null;
  node_id: string;
  fuse_state: string | null;
  is_voltage_present: boolean | null;
}

interface TransformerTarget {
  custom_id: string;
  hw_id: string | null;
  node_id: string;
  va: number | null;
  vb: number | null;
  vc: number | null;
  has_reading: boolean;
}

/** US31 · F-100 (SCRUM-252): demo scenarios that make a device report a fault or its recovery. */
@Injectable()
export class ScenariosService {
  constructor(
    @InjectRepository(Node)
    private readonly nodesRepository: Repository<Node>,
    private readonly configService: ConfigService,
  ) {}

  /** Demo mode is on only when the setting is exactly "true" (NF-03: off everywhere else). */
  enabled(): boolean {
    return (
      String(this.configService.get(DEMO_SCENARIOS_SETTING) ?? '')
        .trim()
        .toLowerCase() === 'true'
    );
  }

  /**
   * SCRUM-253: the database scenarios may write to, from DEMO_SCENARIOS_DATABASE; null when the
   * setting is missing or blank (no database is designated).
   */
  designatedDatabase(): string | null {
    const value = String(
      this.configService.get(DEMO_SCENARIOS_DATABASE_SETTING) ?? '',
    ).trim();
    return value === '' ? null : value;
  }

  /**
   * SCRUM-253: whether the connected database is the designated one and carries a synthetic-dataset
   * marker for itself. Fails closed: a missing setting, another database, a missing or mismatched
   * marker, or any database error gives false.
   */
  private async databaseAllowed(runner: Queryable): Promise<boolean> {
    const designated = this.designatedDatabase();
    if (designated === null) return false;
    try {
      const [database] = (await runner.query(DEMO_DATABASE_SQL)) as {
        database_name: string;
        has_marker_table: boolean;
      }[];
      if (
        database?.database_name !== designated ||
        database.has_marker_table !== true
      ) {
        return false;
      }
      const [marker] = (await runner.query(SYNTHETIC_MARKER_SQL)) as {
        marked: boolean;
      }[];
      return marker?.marked === true;
    } catch {
      return false;
    }
  }

  /**
   * SCRUM-253: `enabled` is true only when scenarios could write here: demo mode is on, a database
   * is designated, and the connected database is that one and has its synthetic-dataset marker.
   */
  async status(): Promise<ScenariosStatusDto> {
    const enabled =
      this.enabled() &&
      this.designatedDatabase() !== null &&
      (await this.databaseAllowed(this.nodesRepository));
    return {
      enabled,
      actions: SCENARIO_ACTION_NAMES.map((action) => ({
        action,
        target:
          SCENARIO_ACTIONS[action].device === 'FALCON' ? 'FUSE' : 'TRANSFORMER',
        channel_required: SCENARIO_ACTIONS[action].channel,
        effect: expectedEffectOf(action),
      })),
    };
  }

  /**
   * SCRUM-253: the target and the scope are resolved first (topology only). Then, in one
   * transaction: the device is locked, its state is read again, the action is checked against that
   * state, the writes are stamped with the database clock and written. A concurrent request on the
   * same device waits for the lock and then sees this one's writes.
   */
  async run(
    body: RunScenarioDto,
    scope: ScopeContext,
  ): Promise<ScenarioResultDto> {
    if (!this.enabled()) {
      throw new ForbiddenException(
        'Demo scenarios are disabled in this environment',
      );
    }
    if (this.designatedDatabase() === null) {
      throw new ForbiddenException(
        `Demo scenarios need ${DEMO_SCENARIOS_DATABASE_SETTING} to name the database they may write to`,
      );
    }
    const { action, target, channel } = parseBody(body);
    const definition = scenarioActionDefinition(action);

    // Which device and node: only to lock the device and check the scope. The state read here is
    // not used; it is read again under the lock.
    const located = await this.resolveTarget(
      this.nodesRepository,
      definition.device,
      target,
      channel,
    );
    await this.assertInScope(located.nodeId, scope);

    return this.nodesRepository.manager.transaction(async (manager) => {
      await manager.query(LOCK_DEVICE_SQL, [located.hwId]);
      // SCRUM-253: checked in the transaction that writes, so it holds for these very writes.
      if (!(await this.databaseAllowed(manager))) {
        throw new ForbiddenException(
          'This database is not designated for demo scenarios: it is not the one named by ' +
            `${DEMO_SCENARIOS_DATABASE_SETTING}, or it has no synthetic-dataset marker for itself`,
        );
      }
      const resolved = await this.resolveTarget(
        manager,
        definition.device,
        target,
        channel,
      );
      // The scope was checked for the node found before the lock: if the target moved to another
      // node (or got another device) meanwhile, nothing is written; a retry checks the new node.
      if (
        resolved.hwId !== located.hwId ||
        resolved.nodeId !== located.nodeId
      ) {
        throw new ConflictException(
          `The device or node of ${target} changed during the request; try again`,
        );
      }

      if (definition.kind === 'silence') {
        return this.runSilence(manager, action, definition, resolved, target);
      }
      // SCRUM-253: a device silenced by SILENCE reports nothing, so nothing else may be written for
      // it until RESUME (any reading would end the silence without anyone asking). A device that is
      // only stale (no silence of its own) keeps the SCRUM-252 and telemetry behavior.
      await this.assertNotSilenced(
        manager,
        definition.device,
        resolved,
        target,
      );

      if (definition.kind === 'telemetry') {
        return this.runTelemetry(manager, action, definition, resolved, target);
      }

      const active = await this.isActive(
        manager,
        definition,
        resolved,
        channel,
      );
      if (repeatsCurrentState(action, active)) {
        throw new ConflictException(
          `${action} would not change anything: the ${definition.device === 'FALCON' ? 'fuse' : 'phase'} is already in that state`,
        );
      }

      const firmware = await this.firmwareOf(manager, resolved.hwId);
      const eventCode = eventCodeOf(action, firmware, channel);
      const recordedAt = (
        await this.recordedAtFor(manager, resolved.hwId)
      ).toISOString();

      if (definition.device === 'FALCON') {
        await manager.query(INSERT_FALCON_READING_SQL, [
          resolved.hwId,
          target,
          recordedAt,
          ...falconOverrides(action),
        ]);
      } else {
        // A phase out of range / back in range never contradicts a phase drop of the same
        // channel: while that channel is dropped, the reading is copied as it is (no channel
        // matches NULL, so every column keeps the latest value). The alarm is written anyway.
        const keepsReading =
          (action === 'PHASE_OUT_OF_RANGE' || action === 'PHASE_IN_RANGE') &&
          (await this.isActive(
            manager,
            SCENARIO_ACTIONS.DROP_PHASE,
            resolved,
            channel,
          ));
        await manager.query(INSERT_SMAC_READING_SQL, [
          resolved.hwId,
          target,
          recordedAt,
          keepsReading ? null : channel,
          phaseVoltsOf(action),
          action === 'DROP_PHASE',
        ]);
      }
      await manager.query(INSERT_ALARM_SQL, [
        resolved.hwId,
        target,
        eventCode,
        definition.eventType,
        alarmTextOf(action, channel),
        alarmValueOf(action),
        recordedAt,
      ]);

      return {
        action,
        node: resolved.nodeId,
        target,
        channel,
        hw_id: resolved.hwId,
        event_code: eventCode,
        event_type: definition.eventType,
        recorded_at: recordedAt,
        effect: expectedEffectOf(action),
      };
    });
  }

  private resolveTarget(
    runner: Queryable,
    device: 'FALCON' | 'SMAC',
    target: string,
    channel: ScenarioChannel | null,
  ): Promise<ResolvedTarget> {
    return device === 'FALCON'
      ? this.fuseTarget(runner, target)
      : this.transformerTarget(runner, target, channel);
  }

  /**
   * Stamp for the next write of the device (scenario-timestamps.ts): the database clock, or 1 ms
   * after the device's latest record. Refused (409, nothing written) when that record is too far
   * ahead of the clock.
   */
  private async recordedAtFor(runner: Queryable, hwId: string): Promise<Date> {
    const rows = (await runner.query(DEVICE_CLOCK_SQL, [hwId])) as {
      database_now: Date | string;
      latest_at: Date | string | null;
    }[];
    const row = rows[0];
    if (!row) throw new Error('The database clock could not be read');
    const decision = nextRecordedAt(
      new Date(row.database_now),
      row.latest_at === null ? null : new Date(row.latest_at),
    );
    if (!decision.ok) {
      throw new ConflictException(
        `The latest record of device ${hwId} is ${decision.aheadMs} ms ahead of the database clock; a scenario does not write future-dated telemetry`,
      );
    }
    return decision.recordedAt;
  }

  private async fuseTarget(
    runner: Queryable,
    target: string,
  ): Promise<ResolvedTarget> {
    const [fuse] = (await runner.query(FUSE_TARGET_SQL, [
      target,
    ])) as FuseTarget[];
    if (!fuse) throw new NotFoundException(`Fuse ${target} not found`);
    if (!fuse.hw_id) {
      throw new BadRequestException(`Fuse ${target} has no Falcon installed`);
    }
    return {
      targetId: fuse.custom_id,
      nodeId: fuse.node_id,
      hwId: fuse.hw_id,
      fuseOpenInTelemetry: fuse.fuse_state === 'Abierto',
      voltageCutInTelemetry: fuse.is_voltage_present === false,
    };
  }

  private async transformerTarget(
    runner: Queryable,
    target: string,
    channel: ScenarioChannel | null,
  ): Promise<ResolvedTarget> {
    const [trafo] = (await runner.query(TRANSFORMER_TARGET_SQL, [
      target,
    ])) as TransformerTarget[];
    if (!trafo) throw new NotFoundException(`Transformer ${target} not found`);
    if (!trafo.hw_id) {
      throw new BadRequestException(
        `Transformer ${target} has no SMAC installed`,
      );
    }
    // SCRUM-253: only the phase actions name a channel; the telemetry actions act on the whole SMAC.
    if (channel !== null && !hasChannel(trafo, channel)) {
      throw new BadRequestException(
        `Transformer ${target} has no phase on channel ${channel}`,
      );
    }
    return {
      targetId: trafo.custom_id,
      nodeId: trafo.node_id,
      hwId: trafo.hw_id,
      fuseOpenInTelemetry: false,
      voltageCutInTelemetry: false,
    };
  }

  /** A node outside the user's scope gives the same 404 as one that does not exist (F-10). */
  private async assertInScope(
    nodeName: string,
    scope: ScopeContext,
  ): Promise<void> {
    const query = this.nodesRepository
      .createQueryBuilder('node')
      .where('node.name = :nodeName', { nodeName });
    applyNodeScope(query, 'node.name', scope);
    if ((await query.getCount()) === 0) {
      throw new NotFoundException('Target not found');
    }
  }

  /** Current state from the alarms (the platform's source of truth, CL-01); telemetry if none. */
  private async isActive(
    runner: Queryable,
    definition: EventScenarioActionDefinition,
    target: ResolvedTarget,
    channel: ScenarioChannel | null,
  ): Promise<boolean> {
    const { device, event } = definition;
    const pattern =
      device === 'FALCON'
        ? `^13[0-9]{2}${event}$`
        : `^05[0-9]{2}${event}(${channel}|${'ABC'.indexOf(channel as string) + 1})$`;
    const rows = (await runner.query(LATEST_EVENT_SQL, [
      target.targetId,
      target.hwId,
      pattern,
    ])) as { event_type: string }[];
    if (rows.length > 0) return rows[0].event_type === 'SET';
    if (device === 'SMAC') return false;
    return event === '20'
      ? target.fuseOpenInTelemetry
      : target.voltageCutInTelemetry;
  }

  /**
   * SCRUM-253: low energy, overload, free fall and solar panel. Under the device lock (the caller
   * holds it and has checked the demo database and the target): the condition is read with its
   * alert's rule, a start or stop that would change nothing is refused (409), and one reading is
   * written with only the condition's own fields changed (free fall also sends its 13xx01 MSG).
   */
  private async runTelemetry(
    manager: Queryable,
    action: ScenarioAction,
    definition: TelemetryScenarioActionDefinition,
    resolved: ResolvedTarget,
    target: string,
  ): Promise<ScenarioResultDto> {
    const { condition, starts } = definition;
    const active = await this.conditionActive(manager, condition, resolved);
    if (repeatsCurrentState(action, active)) {
      const [subject, whenOn, whenOff] = TELEMETRY_CONDITION_STATES[condition];
      throw new ConflictException(
        `${action} would not change anything: ${subject} is already ${starts ? whenOn : whenOff}`,
      );
    }

    const fields = await this.telemetryFields(
      manager,
      condition,
      starts,
      resolved.hwId,
    );
    const eventCode =
      definition.event === undefined
        ? null
        : eventCodeOf(
            action,
            await this.firmwareOf(manager, resolved.hwId),
            null,
          );
    const recordedAt = (
      await this.recordedAtFor(manager, resolved.hwId)
    ).toISOString();

    if (definition.device === 'FALCON') {
      await manager.query(INSERT_FALCON_TELEMETRY_SQL, [
        resolved.hwId,
        target,
        recordedAt,
        fields.supercaps,
        fields.solarPanel,
        fields.freeFall,
        fields.solarPanelAlarm,
      ]);
    } else {
      await manager.query(INSERT_SMAC_TELEMETRY_SQL, [
        resolved.hwId,
        target,
        recordedAt,
        fields.battery,
        fields.load,
      ]);
    }
    if (eventCode !== null) {
      await manager.query(INSERT_ALARM_SQL, [
        resolved.hwId,
        target,
        eventCode,
        definition.eventType,
        alarmTextOf(action, null),
        alarmValueOf(action),
        recordedAt,
      ]);
    }

    return {
      action,
      node: resolved.nodeId,
      target,
      channel: null,
      hw_id: resolved.hwId,
      event_code: eventCode,
      event_type: eventCode === null ? null : (definition.eventType ?? null),
      recorded_at: recordedAt,
      effect: expectedEffectOf(action),
    };
  }

  /**
   * SCRUM-253: SILENCE_* and RESUME_*. Under the device lock (the caller holds it and has checked
   * the demo database and the target).
   *
   * SILENCE removes only what keeps the device from looking silent: its readings after
   * cutoff = database clock - inactivity threshold - 1 minute, in its own telemetry tables, and
   * rebuilds its latest-value rows from what is left. It is refused (409, nothing written) when the
   * device is already silent, has no reading at or before the cutoff (RESUME would have nothing to
   * copy), has alarm events after the cutoff, or has another scenario active. After the deletion it
   * checks, still in the transaction, that the device is now inactive and that no scenario
   * condition came back from older readings and, for a SMAC, that its OVERLOAD_UNBALANCE alert
   * (an imbalance can be on) is exactly as before; otherwise everything is rolled back. Last, it
   * records the silence in demo_silenced_devices (refused, with nothing written, without that table).
   *
   * RESUME (of a deliberately silenced or of a merely stale device) removes the silence record and
   * writes one reading copied from the device's latest one, stamped like every other write: the
   * device is active again and the silence stays in its history as an inactivity period.
   */
  private async runSilence(
    manager: Queryable,
    action: ScenarioAction,
    definition: SilenceScenarioActionDefinition,
    resolved: ResolvedTarget,
    target: string,
  ): Promise<ScenarioResultDto> {
    const { device, starts } = definition;
    const hours = this.inactivityHours(device);
    const state = await this.silenceState(manager, device, resolved.hwId);
    const before = await this.lastRecord(manager, device, resolved.hwId);
    const silent =
      state.silenced || isInactiveNow(before.lastAt, hours, before.databaseNow);
    if (repeatsCurrentState(action, silent)) {
      throw new ConflictException(
        `${action} would not change anything: the ${device === 'FALCON' ? 'Falcon' : 'SMAC'} of ${target} is already ${starts ? 'silent' : 'reporting'}`,
      );
    }
    const result = (recordedAt: string): ScenarioResultDto => ({
      action,
      node: resolved.nodeId,
      target,
      channel: null,
      hw_id: resolved.hwId,
      event_code: null,
      event_type: null,
      recorded_at: recordedAt,
      effect: expectedEffectOf(action),
    });

    if (!starts) {
      const hasReading = await valueOf<boolean>(
        manager,
        device === 'FALCON' ? FALCON_HAS_READING_SQL : SMAC_HAS_READING_SQL,
        [resolved.hwId],
      );
      if (hasReading !== true) {
        throw new ConflictException(
          `${action}: the device of ${target} has no reading to report again from`,
        );
      }
      if (state.hasTable) {
        await manager.query(CLEAR_SILENCE_SQL, [resolved.hwId]);
      }
      const recordedAt = (
        await this.recordedAtFor(manager, resolved.hwId)
      ).toISOString();
      if (device === 'FALCON') {
        await manager.query(INSERT_FALCON_TELEMETRY_SQL, [
          resolved.hwId,
          target,
          recordedAt,
          null,
          null,
          null,
          null,
        ]);
      } else {
        await manager.query(INSERT_SMAC_TELEMETRY_SQL, [
          resolved.hwId,
          target,
          recordedAt,
          null,
          null,
        ]);
      }
      return result(recordedAt);
    }

    if (!state.hasTable) {
      throw new ConflictException(
        `${action} needs the demo_silenced_devices table, which comes with the synthetic seed and the generator: reseed or regenerate this demo database`,
      );
    }
    const cutoff = silenceCutoff(before.databaseNow, hours).toISOString();
    const hasBaseline = await valueOf<boolean>(
      manager,
      device === 'FALCON' ? FALCON_BASELINE_SQL : SMAC_BASELINE_SQL,
      [resolved.hwId, cutoff],
    );
    if (hasBaseline !== true) {
      throw new ConflictException(
        `${action} needs a reading of ${target} from before ${cutoff} (${hours} h + 1 min ago${device === 'SMAC' ? ', in smac_vc_values' : ''}), so that RESUME has one to copy; there is none`,
      );
    }
    const alarms = await valueOf<number>(manager, ALARMS_AFTER_CUTOFF_SQL, [
      resolved.hwId,
      resolved.targetId,
      cutoff,
    ]);
    if ((alarms ?? 0) > 0) {
      throw new ConflictException(
        `${action} would hide ${alarms} alarm event(s) of ${target} after ${cutoff}; alarms are never removed, so it is refused`,
      );
    }
    const active = await this.activeScenarios(manager, device, resolved);
    if (active.length > 0) {
      throw new ConflictException(
        `${action} would erase active scenario(s) on ${target}: ${active.join(', ')}; stop them first`,
      );
    }
    // An imbalance is no scenario and may be on, but a silence must leave its alert as it is.
    const alertBefore =
      device === 'SMAC'
        ? await this.overloadAlert(manager, resolved, before.databaseNow)
        : null;

    for (const statements of SILENCE_STATEMENTS[device]) {
      await manager.query(statements.deleteRecent, [resolved.hwId, cutoff]);
      await manager.query(statements.clearLatest, [resolved.hwId]);
      await manager.query(statements.rebuildLatest, [resolved.hwId]);
    }

    // Still in the transaction: any refusal below rolls back every deletion and rebuild.
    const after = await this.lastRecord(manager, device, resolved.hwId);
    if (!isInactiveNow(after.lastAt, hours, before.databaseNow)) {
      throw new Error(
        `${action}: the device of ${target} still has a record after ${cutoff}`,
      );
    }
    const reread = await this.resolveTarget(manager, device, target, null);
    const revived = await this.activeScenarios(manager, device, reread);
    if (revived.length > 0) {
      throw new ConflictException(
        `${action} would bring back ${revived.join(', ')} on ${target} from its older readings; nothing was changed`,
      );
    }
    if (device === 'SMAC') {
      const alertAfter = await this.overloadAlert(
        manager,
        reread,
        before.databaseNow,
      );
      if (alertAfter !== alertBefore) {
        throw new ConflictException(
          `${action} would change the OVERLOAD_UNBALANCE alert of ${target} (${alertBefore ?? 'none'} -> ${alertAfter ?? 'none'}); nothing was changed`,
        );
      }
    }

    await manager.query(RECORD_SILENCE_SQL, [
      resolved.hwId,
      resolved.targetId,
      cutoff,
      before.databaseNow.toISOString(),
    ]);
    return result(before.databaseNow.toISOString());
  }

  /** 409 while the device of the target is deliberately silenced (its silence still holds). */
  private async assertNotSilenced(
    runner: Queryable,
    device: ScenarioDevice,
    resolved: ResolvedTarget,
    target: string,
  ): Promise<void> {
    const { silenced } = await this.silenceState(runner, device, resolved.hwId);
    if (silenced) {
      const [silence, resume] =
        device === 'FALCON'
          ? ['SILENCE_FALCON', 'RESUME_FALCON']
          : ['SILENCE_SMAC', 'RESUME_SMAC'];
      throw new ConflictException(
        `${target} is silent (${silence}): its ${device === 'FALCON' ? 'Falcon' : 'SMAC'} reports nothing until ${resume}; run ${resume} first`,
      );
    }
  }

  /** Whether the silence table exists, and whether the device's silence holds (SILENCE_INTACT_SQL). */
  private async silenceState(
    runner: Queryable,
    device: ScenarioDevice,
    hwId: string,
  ): Promise<{ hasTable: boolean; silenced: boolean }> {
    const hasTable =
      (await valueOf<boolean>(runner, SILENCE_TABLE_SQL, [])) === true;
    if (!hasTable) return { hasTable, silenced: false };
    const silenced =
      (await valueOf<boolean>(runner, SILENCE_INTACT_SQL, [hwId, device])) ===
      true;
    return { hasTable, silenced };
  }

  /**
   * The transformer's OVERLOAD_UNBALANCE alert exactly as GET /faults builds it (SCRUM-245's
   * OVERLOAD_ALERTS_SQL and toOverloadAlertDto, unchanged), as its id, start and conditions; null
   * without one. Only the transformer's own node is read.
   */
  private async overloadAlert(
    runner: Queryable,
    resolved: ResolvedTarget,
    now: Date,
  ): Promise<string | null> {
    const thresholds = this.overloadThresholds();
    const rows = (await runner.query(OVERLOAD_ALERTS_SQL, [
      [resolved.nodeId],
      thresholds.overloadPercent,
      thresholds.voltageUnbalancePercent,
      thresholds.currentUnbalancePercent,
    ])) as OverloadAlertRow[];
    const row = rows.find(
      (candidate) => candidate.source_id === resolved.targetId,
    );
    const alert = row ? toOverloadAlertDto(row, thresholds, now) : null;
    return alert === null
      ? null
      : `${alert.id} since ${alert.started_at} [${(alert.conditions ?? []).join(', ')}]`;
  }

  /** The database clock and the device's latest record (DEVICE_LAST_RECORD_SQL). */
  private async lastRecord(
    runner: Queryable,
    device: ScenarioDevice,
    hwId: string,
  ): Promise<{ databaseNow: Date; lastAt: Date | null }> {
    const rows = (await runner.query(DEVICE_LAST_RECORD_SQL, [
      hwId,
      device,
    ])) as { database_now: Date | string; last_at: Date | string | null }[];
    const row = rows[0];
    if (!row) throw new Error('The database clock could not be read');
    return {
      databaseNow: new Date(row.database_now),
      lastAt: row.last_at === null ? null : new Date(row.last_at),
    };
  }

  /**
   * The scenarios active on the device now, by the start action that would have set them: the
   * SCRUM-252 alarm states (fuse open, voltage cut, phase dropped, phase out of range) and the
   * telemetry conditions.
   */
  private async activeScenarios(
    runner: Queryable,
    device: ScenarioDevice,
    resolved: ResolvedTarget,
  ): Promise<string[]> {
    const active: string[] = [];
    if (device === 'FALCON') {
      for (const action of ['OPEN_FUSE', 'CUT_VOLTAGE'] as const) {
        if (
          await this.isActive(runner, SCENARIO_ACTIONS[action], resolved, null)
        ) {
          active.push(action);
        }
      }
      for (const [action, condition] of [
        ['DRAIN_SUPERCAPS', 'FALCON_LOW_ENERGY'],
        ['FREE_FALL', 'FREE_FALL'],
        ['SOLAR_PANEL_ALARM', 'SOLAR_PANEL'],
      ] as const) {
        if (await this.conditionActive(runner, condition, resolved)) {
          active.push(action);
        }
      }
      return active;
    }
    for (const channel of ['A', 'B', 'C'] as const) {
      if (
        await this.isActive(
          runner,
          SCENARIO_ACTIONS.DROP_PHASE,
          resolved,
          channel,
        )
      ) {
        active.push(`DROP_PHASE ${channel}`);
      }
    }
    for (const channel of ['A', 'B', 'C'] as const) {
      if (
        await this.isActive(
          runner,
          SCENARIO_ACTIONS.PHASE_OUT_OF_RANGE,
          resolved,
          channel,
        )
      ) {
        active.push(`PHASE_OUT_OF_RANGE ${channel}`);
      }
    }
    for (const [action, condition] of [
      ['DRAIN_BATTERY', 'SMAC_LOW_ENERGY'],
      ['START_OVERLOAD', 'OVERLOAD'],
    ] as const) {
      if (await this.conditionActive(runner, condition, resolved)) {
        active.push(action);
      }
    }
    return active;
  }

  /** FALCON_INACTIVITY_HOURS / SMAC_INACTIVITY_HOURS, parsed as every other service does (NF-07). */
  private inactivityHours(device: ScenarioDevice): number {
    const [setting, fallback] =
      device === 'FALCON'
        ? ['FALCON_INACTIVITY_HOURS', DEFAULT_FALCON_INACTIVITY_HOURS]
        : ['SMAC_INACTIVITY_HOURS', DEFAULT_SMAC_INACTIVITY_HOURS];
    const configured = Number(this.configService.get(setting));
    return Number.isFinite(configured) && configured > 0
      ? configured
      : fallback;
  }

  /** Whether the condition is on now, by the rule of the alert that shows it. */
  private async conditionActive(
    runner: Queryable,
    condition: TelemetryCondition,
    target: ResolvedTarget,
  ): Promise<boolean> {
    switch (condition) {
      case 'FALCON_LOW_ENERGY':
        return (
          isLowEnergy(
            await valueOf<number>(runner, SUPERCAPS_LEVEL_SQL, [target.hwId]),
            this.lowEnergyPercent('FALCON'),
          ) === true
        );
      case 'SMAC_LOW_ENERGY':
        return (
          isLowEnergy(
            await valueOf<number>(runner, BATTERY_LEVEL_SQL, [target.hwId]),
            this.lowEnergyPercent('SMAC'),
          ) === true
        );
      case 'OVERLOAD':
        // Only the load: an imbalance keeps the alert on, but it is not this condition.
        return activeOverloadConditions(
          {
            loadPercent: await valueOf<number>(runner, LOAD_LEVEL_SQL, [
              target.hwId,
            ]),
            voltageUnbalancePercent: null,
            currentUnbalancePercent: null,
          },
          this.overloadThresholds(),
        ).includes('OVERLOAD');
      case 'FREE_FALL': {
        const rows = (await runner.query(FREE_FALL_ACTIVE_SQL, [
          target.targetId,
          target.hwId,
          freeFallCodePattern(),
          FREE_FALL_ACTIVATION_EVENT_TYPE_PATTERN,
        ])) as { active: boolean }[];
        return rows[0]?.active === true;
      }
      case 'SOLAR_PANEL':
        return (
          (await valueOf<boolean>(runner, SOLAR_PANEL_FLAG_SQL, [
            target.hwId,
          ])) === true
        );
    }
  }

  /** The fields one start or stop writes; null = keep the device's latest value. */
  private async telemetryFields(
    runner: Queryable,
    condition: TelemetryCondition,
    starts: boolean,
    hwId: string,
  ): Promise<TelemetryFields> {
    const fields: TelemetryFields = {
      supercaps: null,
      solarPanel: null,
      freeFall: null,
      solarPanelAlarm: null,
      battery: null,
      load: null,
    };
    switch (condition) {
      case 'FALCON_LOW_ENERGY': {
        const threshold = this.lowEnergyPercent('FALCON');
        fields.supercaps = starts
          ? drainedEnergyLevel(threshold)
          : Math.round(
              (await valueOf<number>(runner, SUPERCAPS_RESTORE_SQL, [
                hwId,
                threshold,
              ])) ?? rechargedEnergyLevel(threshold),
            );
        break;
      }
      case 'SMAC_LOW_ENERGY': {
        const threshold = this.lowEnergyPercent('SMAC');
        fields.battery = starts
          ? drainedEnergyLevel(threshold)
          : Math.round(
              (await valueOf<number>(runner, BATTERY_RESTORE_SQL, [
                hwId,
                threshold,
              ])) ?? rechargedEnergyLevel(threshold),
            );
        break;
      }
      case 'OVERLOAD': {
        const threshold = this.overloadThresholds().overloadPercent;
        fields.load = starts
          ? overloadedLoad(threshold)
          : ((await valueOf<number>(runner, LOAD_RESTORE_SQL, [
              hwId,
              threshold,
            ])) ?? normalLoad(threshold));
        break;
      }
      case 'FREE_FALL':
        fields.freeFall = starts;
        break;
      case 'SOLAR_PANEL':
        fields.solarPanelAlarm = starts;
        fields.solarPanel = starts
          ? SOLAR_PANEL_FAILED
          : await valueOf<number>(runner, SOLAR_PANEL_RESTORE_SQL, [hwId]);
        break;
    }
    return fields;
  }

  /** FALCON_LOW_ENERGY_PERCENT / SMAC_LOW_ENERGY_PERCENT, read on every action (NF-08). */
  private lowEnergyPercent(device: 'FALCON' | 'SMAC'): number {
    return lowEnergyThreshold(
      this.configService.get(LOW_ENERGY_SETTINGS[device]),
    );
  }

  /** SMAC_OVERLOAD_PERCENT and the imbalance thresholds, read on every action (NF-22). */
  private overloadThresholds() {
    return resolveDeviceAlertThresholds((setting) =>
      this.configService.get(setting),
    ).thresholds;
  }

  private async firmwareOf(runner: Queryable, hwId: string): Promise<string> {
    const rows = (await runner.query(FIRMWARE_SQL, [hwId])) as {
      firmware: string;
    }[];
    const firmware = rows[0]?.firmware;
    return firmware && /^\d{2}$/.test(firmware) ? firmware : DEFAULT_FIRMWARE;
  }
}

/** The reading fields a telemetry action changes; null = keep the device's latest value. */
interface TelemetryFields {
  supercaps: number | null;
  solarPanel: number | null;
  freeFall: boolean | null;
  solarPanelAlarm: boolean | null;
  battery: number | null;
  load: number | null;
}

/** The `value` column of the first row: a number or a flag, null when there is no row or no value. */
async function valueOf<T extends number | boolean>(
  runner: Queryable,
  sql: string,
  parameters: unknown[],
): Promise<T | null> {
  const rows = (await runner.query(sql, parameters)) as {
    value: T | string | null;
  }[];
  const value = rows[0]?.value ?? null;
  if (value === null || typeof value === 'boolean') return value as T | null;
  const number = Number(value);
  return (Number.isFinite(number) ? number : null) as T | null;
}

/** The FREE_FALL event-code pattern of the fault list (13xx01). */
function freeFallCodePattern(): string {
  const pattern = ALERT_TYPE_DEFINITIONS.FREE_FALL.eventCodePattern;
  if (pattern === null) {
    throw new Error('FREE_FALL must have a documented event code pattern');
  }
  return pattern;
}

interface ResolvedTarget {
  /** Stable custom_id of the fuse or transformer. */
  targetId: string;
  nodeId: string;
  hwId: string;
  fuseOpenInTelemetry: boolean;
  voltageCutInTelemetry: boolean;
}

function parseBody(body: RunScenarioDto | undefined): {
  action: ScenarioAction;
  target: string;
  channel: ScenarioChannel | null;
} {
  const raw = (body ?? {}) as Partial<Record<keyof RunScenarioDto, unknown>>;
  if (!isScenarioAction(raw.action)) {
    throw new BadRequestException(
      `action must be one of ${SCENARIO_ACTION_NAMES.join(', ')}`,
    );
  }
  if (typeof raw.target !== 'string' || raw.target.trim() === '') {
    throw new BadRequestException('target is required');
  }
  const needsChannel = SCENARIO_ACTIONS[raw.action].channel;
  if (needsChannel && !isScenarioChannel(raw.channel)) {
    throw new BadRequestException(`${raw.action} needs channel A, B or C`);
  }
  if (!needsChannel && raw.channel !== undefined && raw.channel !== null) {
    throw new BadRequestException(`${raw.action} takes no channel`);
  }
  return {
    action: raw.action,
    target: raw.target.trim(),
    channel: needsChannel ? (raw.channel as ScenarioChannel) : null,
  };
}

/** $4 fuse_state, $5 is_voltage_present, $6 is_fuse_alarm, $7 angle_incl (null = keep). */
function falconOverrides(
  action: ScenarioAction,
): [string | null, boolean | null, boolean | null, number | null] {
  switch (action) {
    case 'OPEN_FUSE':
      return ['Abierto', null, true, OPEN_FUSE_ANGLE];
    case 'CLOSE_FUSE':
      return ['Cerrado', null, false, CLOSED_FUSE_ANGLE];
    case 'CUT_VOLTAGE':
      return [null, false, null, null];
    default:
      return [null, true, null, null];
  }
}

/** A channel exists when its voltage is stated; without a reading, the id's phase count decides. */
function hasChannel(
  trafo: TransformerTarget,
  channel: ScenarioChannel,
): boolean {
  if (trafo.has_reading) {
    const volts = { A: trafo.va, B: trafo.vb, C: trafo.vc }[channel];
    return volts !== null && volts !== undefined;
  }
  const count = phaseCountOf(trafo.custom_id);
  const phase = phaseOfChannel(channel);
  return count === null || (phase !== null && phase <= count);
}
