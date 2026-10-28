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
