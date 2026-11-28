import { ApiProperty } from '@nestjs/swagger';

/**
 * Units of the numeric Falcon measurements. They come from
 * docs/decisions/client-clarifications-2026-11.md (CL-02..CL-11); the angle in degrees is the team
 * decision TD-12. `null` means dimensionless. internal_temperature '°C' is an ASSUMPTION, not
 * confirmed by the client. fuse_state and is_voltage_present are categorical and have no entry.
 */
export const FALCON_TELEMETRY_UNITS = {
  internal_temperature: '°C',
  supercaps_per: '%',
  solar_panel: 'V',
  angle_incl: '°',
} as const satisfies Readonly<Record<string, string | null>>;

/**
 * Units of the numeric SMAC measurements (same source and conventions as FALCON_TELEMETRY_UNITS):
 * `null` is dimensionless (power factor); internal_temperature '°C' is an ASSUMPTION, not confirmed
 * by the client.
 */
export const SMAC_TELEMETRY_UNITS = {
  internal_temperature: '°C',
  battery_per: '%',
  va: 'V',
  vb: 'V',
  vc: 'V',
  ia: 'A',
  ib: 'A',
  ic: 'A',
  in_: 'A',
  cuf_percent: '%',
  vuf_percent: '%',
  load_percent: '%',
  phase_a_active_power: 'W',
  phase_b_active_power: 'W',
  phase_c_active_power: 'W',
  phase_a_reactive_power: 'VAr',
  phase_b_reactive_power: 'VAr',
  phase_c_reactive_power: 'VAr',
  phase_a_apparent_power: 'VA',
  phase_b_apparent_power: 'VA',
  phase_c_apparent_power: 'VA',
  phase_a_power_factor: null,
  phase_b_power_factor: null,
  phase_c_power_factor: null,
} as const satisfies Readonly<Record<string, string | null>>;

/** One raw Falcon record; every measurement is null when the device did not report it. */
export class FalconReadingDto {
  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-10-29T15:40:00.000Z',
    description: 'Time of the record.',
  })
  recorded_at: string;

  @ApiProperty({
    example: '1301000007',
    description:
      'Falcon that sent the record (it can differ along the window after a device replacement).',
  })
  hw_id: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Cerrado',
    description: 'Fuse state as stored by the Falcon (Abierto / Cerrado).',
  })
  fuse_state: string | null;

  @ApiProperty({
    type: Boolean,
    nullable: true,
    example: true,
    description: 'Whether the Falcon detects voltage on the fuse.',
  })
  is_voltage_present: boolean | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 31.5,
    description: 'Internal temperature of the Falcon (unit in units.falcon).',
  })
  internal_temperature: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 87,
    description: 'Supercapacitor level (unit in units.falcon).',
  })
  supercaps_per: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 4.1,
    description: 'Solar-panel measurement (unit in units.falcon).',
  })
  solar_panel: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 2.5,
    description: 'Inclination angle (unit in units.falcon).',
  })
  angle_incl: number | null;
}

export class FuseTelemetryDto {
  @ApiProperty({
    example: '0000100002-A-R',
    description: 'Fuse identifier (fuses.custom_id).',
  })
  id: string;

  @ApiProperty({ example: 'R', description: 'Phase of the fuse.' })
  phase: string;

  @ApiProperty({
    type: () => [FalconReadingDto],
    description:
      'Falcon records of the fuse in the window, oldest first. They are read by custom_id, so they include the records of every Falcon that has been installed on the fuse. Empty when there are none.',
  })
  readings: FalconReadingDto[];
}

export class FuseSetTelemetryDto {
  @ApiProperty({ example: 2, description: 'Fuse set identifier.' })
  id: number;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'A',
    description: 'Branch letter; null on a node with a single set.',
  })
  set_id: string | null;

  @ApiProperty({ type: () => [FuseTelemetryDto] })
  fuses: FuseTelemetryDto[];
}

/** One raw record of the SMAC voltage/current table (smac_vc_values). */
export class SmacVcReadingDto {
  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-10-29T15:38:00.000Z',
    description: 'Time of the record.',
  })
  recorded_at: string;

  @ApiProperty({
    example: '0501000002',
    description: 'SMAC that sent the record.',
  })
  hw_id: string;

  @ApiProperty({ type: Number, nullable: true, example: 35.2 })
  internal_temperature: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 92 })
  battery_per: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 127.1 })
  va: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 126.8 })
  vb: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 127.4 })
  vc: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 12.3 })
  ia: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 11.9 })
  ib: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 12.1 })
  ic: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 0.4 })
  in_: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 2.1 })
  cuf_percent: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 0.8 })
  vuf_percent: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 64.5 })
  load_percent: number | null;
}

/** One raw record of the SMAC power table (smac_pw_values). */
export class SmacPwReadingDto {
  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-10-29T15:38:30.000Z',
    description: 'Time of the record.',
  })
  recorded_at: string;

  @ApiProperty({
    example: '0501000002',
    description: 'SMAC that sent the record.',
  })
  hw_id: string;

  @ApiProperty({ type: Number, nullable: true, example: 1200 })
  phase_a_active_power: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 1150 })
  phase_b_active_power: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 1180 })
  phase_c_active_power: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 300 })
  phase_a_reactive_power: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 290 })
  phase_b_reactive_power: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 310 })
  phase_c_reactive_power: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 1237 })
  phase_a_apparent_power: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 1186 })
  phase_b_apparent_power: number | null;
}

/** One raw record of the SMAC power-factor table (smac_pf_values). */
export class SmacPfReadingDto {
  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-10-29T15:39:00.000Z',
    description: 'Time of the record.',
  })
  recorded_at: string;

  @ApiProperty({
    example: '0501000002',
    description: 'SMAC that sent the record.',
  })
  hw_id: string;

  @ApiProperty({ type: Number, nullable: true, example: 1220 })
  phase_c_apparent_power: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 0.97 })
  phase_a_power_factor: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 0.96 })
  phase_b_power_factor: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 0.95 })
  phase_c_power_factor: number | null;
}

export class TransformerTelemetryDto {
  @ApiProperty({
    example: '0000100002-T1-2',
    description: 'Transformer identifier (trafos.custom_id).',
  })
  id: string;

  @ApiProperty({
    type: () => [SmacVcReadingDto],
    description:
      'Raw voltage/current records in the window, oldest first. The three SMAC tables arrive on separate uplinks and are returned as they are stored, not aligned (alignment is a separate task).',
  })
  vc: SmacVcReadingDto[];

  @ApiProperty({
    type: () => [SmacPwReadingDto],
    description: 'Raw power records in the window, oldest first (not aligned).',
  })
  pw: SmacPwReadingDto[];

  @ApiProperty({
    type: () => [SmacPfReadingDto],
    description:
      'Raw power-factor records in the window, oldest first (not aligned).',
  })
  pf: SmacPfReadingDto[];
}

export class NodeTelemetryUnitsDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string', nullable: true },
    example: FALCON_TELEMETRY_UNITS,
    description:
      'Unit of each numeric Falcon measurement (client clarifications CL-02..CL-11; angle in degrees per team decision TD-12). ASSUMPTION: internal_temperature in °C is not confirmed by the client. fuse_state and is_voltage_present are categorical and have no entry.',
  })
  falcon: Record<string, string | null>;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string', nullable: true },
    example: SMAC_TELEMETRY_UNITS,
    description:
      'Unit of each numeric SMAC measurement (client clarifications CL-02..CL-11); null means dimensionless (power factor). ASSUMPTION: internal_temperature in °C is not confirmed by the client.',
  })
  smac: Record<string, string | null>;
}

export class NodeTelemetryResponseDto {
  @ApiProperty({ example: '0000100002', description: 'Node identifier.' })
  node: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-10-29T05:00:00.000Z',
    description: 'Start of the window (inclusive).',
  })
  from: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-10-30T05:00:00.000Z',
    description: 'End of the window (exclusive).',
  })
  to: string;

  @ApiProperty({ type: () => NodeTelemetryUnitsDto })
  units: NodeTelemetryUnitsDto;

  @ApiProperty({
    type: () => [FuseSetTelemetryDto],
    description: 'Only the fuses the user may see.',
  })
  fuse_sets: FuseSetTelemetryDto[];

  @ApiProperty({
    type: () => [TransformerTelemetryDto],
    description:
      'Only the transformers the user may see. Empty when the node has none.',
  })
  transformers: TransformerTelemetryDto[];
}
