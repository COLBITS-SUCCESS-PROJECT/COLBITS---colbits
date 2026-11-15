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
import { Node } from '../nodes/node.entity';
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
  DEMO_SCENARIOS_SETTING,
  DROPPED_PHASE_VOLTS,
  NOMINAL_PHASE_VOLTS,
  OPEN_FUSE_ANGLE,
  SCENARIO_ACTIONS,
  SCENARIO_ACTION_NAMES,
  ScenarioAction,
  ScenarioChannel,
  alarmTextOf,
  alarmValueOf,
  eventCodeOf,
  expectedEffectOf,
  isScenarioAction,
  isScenarioChannel,
  repeatsCurrentState,
} from './scenario-actions';

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

  status(): ScenariosStatusDto {
    return {
      enabled: this.enabled(),
      actions: SCENARIO_ACTION_NAMES.map((action) => ({
        action,
        target:
          SCENARIO_ACTIONS[action].device === 'FALCON' ? 'FUSE' : 'TRANSFORMER',
        channel_required: SCENARIO_ACTIONS[action].channel,
        effect: expectedEffectOf(action),
      })),
    };
  }

  async run(
    body: RunScenarioDto,
    scope: ScopeContext,
    now: Date = new Date(),
  ): Promise<ScenarioResultDto> {
    if (!this.enabled()) {
      throw new ForbiddenException(
        'Demo scenarios are disabled in this environment',
      );
    }
    const { action, target, channel } = parseBody(body);
    const definition = SCENARIO_ACTIONS[action];

    const resolved =
      definition.device === 'FALCON'
        ? await this.fuseTarget(target)
        : await this.transformerTarget(target, channel as ScenarioChannel);
    await this.assertInScope(resolved.nodeId, scope);

    const active = await this.isActive(action, resolved, channel);
    if (repeatsCurrentState(action, active)) {
      throw new ConflictException(
        `${action} would not change anything: the ${definition.device === 'FALCON' ? 'fuse' : 'phase'} is already in that state`,
      );
    }

    const firmware = await this.firmwareOf(resolved.hwId);
    const eventCode = eventCodeOf(action, firmware, channel);
    const recordedAt = now.toISOString();

    await this.nodesRepository.manager.transaction(async (manager) => {
      if (definition.device === 'FALCON') {
        await manager.query(INSERT_FALCON_READING_SQL, [
          resolved.hwId,
          target,
          recordedAt,
          ...falconOverrides(action),
        ]);
      } else {
        const drop = action === 'DROP_PHASE';
        await manager.query(INSERT_SMAC_READING_SQL, [
          resolved.hwId,
          target,
          recordedAt,
          channel,
          drop ? DROPPED_PHASE_VOLTS : NOMINAL_PHASE_VOLTS,
          drop,
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
    });

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
  }

  private async fuseTarget(target: string): Promise<ResolvedTarget> {
    const [fuse]: FuseTarget[] = await this.nodesRepository.query(
      FUSE_TARGET_SQL,
      [target],
    );
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
    target: string,
    channel: ScenarioChannel,
  ): Promise<ResolvedTarget> {
    const [trafo]: TransformerTarget[] = await this.nodesRepository.query(
      TRANSFORMER_TARGET_SQL,
      [target],
    );
    if (!trafo) throw new NotFoundException(`Transformer ${target} not found`);
    if (!trafo.hw_id) {
      throw new BadRequestException(
        `Transformer ${target} has no SMAC installed`,
      );
    }
    if (!hasChannel(trafo, channel)) {
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
    action: ScenarioAction,
    target: ResolvedTarget,
    channel: ScenarioChannel | null,
  ): Promise<boolean> {
    const { device, event } = SCENARIO_ACTIONS[action];
    const pattern =
      device === 'FALCON'
        ? `^13[0-9]{2}${event}$`
        : `^05[0-9]{2}${event}(${channel}|${'ABC'.indexOf(channel as string) + 1})$`;
    const rows: { event_type: string }[] = await this.nodesRepository.query(
      LATEST_EVENT_SQL,
      [target.targetId, target.hwId, pattern],
    );
    if (rows.length > 0) return rows[0].event_type === 'SET';
    if (device === 'SMAC') return false;
    return event === '20'
      ? target.fuseOpenInTelemetry
      : target.voltageCutInTelemetry;
  }

  private async firmwareOf(hwId: string): Promise<string> {
    const rows: { firmware: string }[] = await this.nodesRepository.query(
      FIRMWARE_SQL,
      [hwId],
    );
    const firmware = rows[0]?.firmware;
    return firmware && /^\d{2}$/.test(firmware) ? firmware : DEFAULT_FIRMWARE;
  }
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
