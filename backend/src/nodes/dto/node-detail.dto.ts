import { ApiProperty } from '@nestjs/swagger';

/** US11 · F-27: response of GET /nodes/:name/detail (docs/specs/dashboard/SCRUM-109.md §6). */
export class CircuitRefDto {
  @ApiProperty({ example: 1, description: 'Circuit identifier.' })
  id: number;

  @ApiProperty({ example: 'CTO 1', description: 'Circuit name.' })
  name: string;
}

export class SubstationRefDto {
  @ApiProperty({ example: 1, description: 'Substation identifier.' })
  id: number;

  @ApiProperty({ example: 'SUB-N-001', description: 'Substation code.' })
  code: string;

  @ApiProperty({ example: 'Norte 1', description: 'Substation name.' })
  name: string;
}

export class FuseDetailDto {
  @ApiProperty({
    example: '0000100002-A-R',
    description: 'Fuse identifier (fuses.custom_id).',
  })
  id: string;

  @ApiProperty({ example: 'R', description: 'Phase of the fuse.' })
  phase: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '1301000007',
    description: 'Falcon installed on the fuse.',
  })
  hw_id: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Cerrado',
    description: 'Fuse state as stored by the Falcon (Abierto / Cerrado).',
  })
  fuse_state: string | null;

  @ApiProperty({ type: Boolean, nullable: true, example: true })
  is_voltage_present: boolean | null;

  @ApiProperty({
    example: false,
    description:
      'No record, or the last one is older than FALCON_INACTIVITY_HOURS (same rule as US6).',
  })
  inactive: boolean;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 87,
    description: 'Falcon supercapacitor level, %.',
  })
  supercaps_per: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 4.1,
    description: 'Solar-panel measurement.',
  })
  solar_panel: number | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '2026-10-29T15:40:00.000Z',
    description: 'Time of the last Falcon record.',
  })
  recorded_at: string | null;
}

export class FuseSetDetailDto {
  @ApiProperty({ example: 2, description: 'Fuse set identifier.' })
  id: number;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'A',
    description: 'Branch letter; null on a node with a single set.',
  })
  set_id: string | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 18,
    description: 'Clients fed by the set (F-29). Null when not recorded.',
  })
  client_count: number | null;

  @ApiProperty({ type: () => [FuseDetailDto] })
  fuses: FuseDetailDto[];
}

export class VoltagesDto {
  @ApiProperty({ type: Number, nullable: true, example: 127.1 })
  va: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 126.8 })
  vb: number | null;

  @ApiProperty({ type: Number, nullable: true, example: null })
  vc: number | null;
}

export class TransformerDetailDto {
  @ApiProperty({
    example: '0000100002-T1-2',
    description: 'Transformer identifier (trafos.custom_id).',
  })
  id: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '0501000002',
    description: 'SMAC monitoring the transformer.',
  })
  hw_id: string | null;

  @ApiProperty({
    example: false,
    description:
      'No record, or the newest of its three tables is older than SMAC_INACTIVITY_HOURS (F-37).',
  })
  inactive: boolean;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 92,
    description: 'SMAC battery level, %.',
  })
  battery_per: number | null;

  @ApiProperty({ type: () => VoltagesDto })
  voltages: VoltagesDto;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '2026-10-29T15:38:00.000Z',
    description: 'Time of the last SMAC record (newest of its three tables).',
  })
  recorded_at: string | null;
}

export class NodeDetailResponseDto {
  @ApiProperty({ example: '0000100002', description: 'Node identifier.' })
  node: string;

  @ApiProperty({ type: () => CircuitRefDto })
  circuit: CircuitRefDto;

  @ApiProperty({ type: () => SubstationRefDto })
  substation: SubstationRefDto;

  @ApiProperty({ type: () => [FuseSetDetailDto] })
  fuse_sets: FuseSetDetailDto[];

  @ApiProperty({
    type: () => [TransformerDetailDto],
    description: 'Empty when the node has no transformer.',
  })
  transformers: TransformerDetailDto[];
}
