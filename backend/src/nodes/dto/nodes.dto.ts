import { ApiProperty } from '@nestjs/swagger';
import { NODE_STATES, type NodeState } from '../fuse-state';
import { CircuitRefDto, SubstationRefDto } from './node-detail.dto';

/** US14 · F-33: the zone a node belongs to (nodes → circuits → substations → zones). */
export class ZoneRefDto {
  @ApiProperty({ example: 1, description: 'Zone identifier.' })
  id: number;

  @ApiProperty({ example: 'Zona Norte', description: 'Zone name.' })
  name: string;
}

export class NodeViewDto {
  @ApiProperty({ example: 'ND04821A07', description: 'Node identifier.' })
  name: string;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 4.711,
    description: 'Latitude in decimal degrees.',
  })
  latitude: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: -74.0721,
    description: 'Longitude in decimal degrees.',
  })
  longitude: number | null;

  @ApiProperty({
    type: String,
    enum: [...NODE_STATES],
    nullable: true,
    example: 'NORMAL',
    description:
      'Fuse-layer state. CRITICAL = a fuse is open, WARNING = a fuse without voltage, INACTIVE = a Falcon inactive, or whose last record does not state the fuse or the voltage, NORMAL otherwise. Precedence: CRITICAL, WARNING, INACTIVE, NORMAL. Null when the node has no fuses.',
  })
  fuse_state: NodeState | null;

  @ApiProperty({
    type: Boolean,
    nullable: true,
    example: false,
    description:
      'Whether any SMAC on the node is inactive; null when the node has no transformer.',
  })
  smac_inactive: boolean | null;

  @ApiProperty({
    type: String,
    enum: [...NODE_STATES],
    nullable: true,
    example: 'WARNING',
    description:
      "Transformer-layer state (US7). CRITICAL = two or more phases down, WARNING = exactly one, INACTIVE = none down and the SMAC inactive, NORMAL otherwise. Phases are counted against the transformer's own phases. Null when the node has no transformer.",
  })
  transformer_state: NodeState | null;

  @ApiProperty({
    type: () => ZoneRefDto,
    nullable: true,
    description:
      'Zone of the node, to filter the map (US14 · F-33). Null only if the node is not linked to a zone.',
  })
  zone: ZoneRefDto | null;

  @ApiProperty({
    type: () => SubstationRefDto,
    nullable: true,
    description:
      'Substation of the node, to filter the map (US14 · F-33). Null only if the node is not linked to one.',
  })
  substation: SubstationRefDto | null;

  @ApiProperty({
    type: () => CircuitRefDto,
    nullable: true,
    description:
      'Circuit of the node, to filter the map (US14 · F-33). Circuit names repeat across substations, so filter by id.',
  })
  circuit: CircuitRefDto | null;

  @ApiProperty({
    type: [String],
    example: ['13A1B2C3D4', '05F6E7D8C9'],
    description:
      'Devices currently installed on the node (Falcon of each fuse and SMAC of each transformer, current_hw_id), sorted, to find a node by device identifier (US14 · F-34). Empty when the node has none.',
  })
  device_ids: string[];
}

export class NodesResponseDto {
  @ApiProperty({ example: 1, description: 'Number of nodes returned.' })
  count: number;

  @ApiProperty({ type: () => [NodeViewDto] })
  nodes: NodeViewDto[];
}

export class FuseSetViewDto {
  @ApiProperty({
    example: 2,
    description: 'Fuse set identifier (fuses_sets.id).',
  })
  id: number;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'A',
    description:
      'Branch letter on a node with several fuse sets; null when the node has a single set.',
  })
  set_id: string | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 18,
    description:
      'Number of clients fed by this fuse set (F-29). Null when Colbits has not recorded it, which is not the same as zero.',
  })
  client_count: number | null;
}

export class NodeFuseSetsResponseDto {
  @ApiProperty({ example: '0000100002', description: 'Node identifier.' })
  node: string;

  @ApiProperty({
    type: () => [FuseSetViewDto],
    description:
      'Fuse sets of the node, single set first, then by branch letter. Empty when the node has none.',
  })
  fuse_sets: FuseSetViewDto[];
}
