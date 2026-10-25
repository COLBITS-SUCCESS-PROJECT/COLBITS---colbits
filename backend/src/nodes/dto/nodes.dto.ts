import { ApiProperty } from '@nestjs/swagger';
import { NODE_STATES, type NodeState } from '../fuse-state';

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
      'Fuse-layer state. Null when the node has no fuses. Precedence: CRITICAL, WARNING, INACTIVE, NORMAL.',
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
