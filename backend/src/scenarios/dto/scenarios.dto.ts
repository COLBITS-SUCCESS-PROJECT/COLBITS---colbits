import { ApiProperty } from '@nestjs/swagger';
import { SCENARIO_ACTION_NAMES, SMAC_CHANNELS } from '../scenario-actions';
import type { ScenarioAction, ScenarioChannel } from '../scenario-actions';

export class ScenarioActionInfoDto {
  @ApiProperty({ enum: SCENARIO_ACTION_NAMES, example: 'OPEN_FUSE' })
  action: ScenarioAction;

  @ApiProperty({
    enum: ['FUSE', 'TRANSFORMER'],
    example: 'FUSE',
    description:
      'What `target` must be: a fuse custom_id or a transformer custom_id (both listed by GET /nodes/{name}/detail).',
  })
  target: 'FUSE' | 'TRANSFORMER';

  @ApiProperty({
    example: false,
    description: 'Whether `channel` (A, B or C) is required.',
  })
  channel_required: boolean;

  @ApiProperty({
    example:
      'Fuse layer: node CRITICAL (red); an open FUSE_OPENING fault in GET /faults.',
  })
  effect: string;
}

export class ScenariosStatusDto {
  @ApiProperty({
    example: true,
    description:
      'Demo mode: true only where DEMO_SCENARIOS_ENABLED=true, DEMO_SCENARIOS_DATABASE names the connected database and that database has its synthetic-dataset marker. The frontend shows the scenario panel only when it is true; POST /scenarios answers 403 otherwise.',
  })
  enabled: boolean;

  @ApiProperty({ type: () => [ScenarioActionInfoDto] })
  actions: ScenarioActionInfoDto[];
}

export class RunScenarioDto {
  @ApiProperty({ enum: SCENARIO_ACTION_NAMES, example: 'OPEN_FUSE' })
  action: ScenarioAction;

  @ApiProperty({
    example: '0000100002-A-R',
    description:
      'Fuse custom_id for OPEN_FUSE, CLOSE_FUSE, CUT_VOLTAGE, RESTORE_VOLTAGE; transformer custom_id for DROP_PHASE, RESTORE_PHASE.',
  })
  target: string;

  @ApiProperty({
    enum: [...SMAC_CHANNELS],
    required: false,
    example: 'A',
    description: 'SMAC channel, only for DROP_PHASE and RESTORE_PHASE.',
  })
  channel?: ScenarioChannel;
}

export class ScenarioResultDto {
  @ApiProperty({ enum: SCENARIO_ACTION_NAMES, example: 'OPEN_FUSE' })
  action: ScenarioAction;

  @ApiProperty({ example: '0000100002' })
  node: string;

  @ApiProperty({ example: '0000100002-A-R' })
  target: string;

  @ApiProperty({ type: String, nullable: true, example: null })
  channel: ScenarioChannel | null;

  @ApiProperty({
    example: '1301000004',
    description: 'Device that "reported" it.',
  })
  hw_id: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '131420',
    description:
      'Event code written to alarms (Annex §4.2). null for the telemetry-only actions (low energy, overload, solar panel, the end of a free fall), which write a reading and no event (SCRUM-253).',
  })
  event_code: string | null;

  @ApiProperty({
    enum: ['SET', 'CLEAR', 'MSG'],
    nullable: true,
    example: 'SET',
    description:
      'SET or CLEAR for the SCRUM-252 actions; MSG for FREE_FALL (13xx01); null when no event is written.',
  })
  event_type: 'SET' | 'CLEAR' | 'MSG' | null;

  @ApiProperty({
    format: 'date-time',
    description: 'Timestamp of the reading and the event.',
  })
  recorded_at: string;

  @ApiProperty({
    example:
      'Fuse layer: node CRITICAL (red); an open FUSE_OPENING fault in GET /faults.',
  })
  effect: string;
}
