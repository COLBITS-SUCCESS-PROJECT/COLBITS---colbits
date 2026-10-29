/**
 * PROVISIONAL node details for the mock API, same shape as GET /nodes/:name/detail (backend SCRUM-214).
 * ND04821A07 is the F-27 acceptance example: set A (R, S, T), set B (R, S) and one SMAC.
 * Every other node gets a minimal detail built from its fixture: one set if it has fuses,
 * one transformer if it has a transformer.
 */
import type {
  FuseDetailDto,
  NodeDetailResponseDto,
  TransformerDetailDto,
} from '@/features/dashboard/api/nodeDetail.dto'
import type { NodeDto } from '@/features/dashboard/api/nodes.dto'

const RECORDED_AT = '2026-10-29T15:40:00.000Z'

const LOCATION = {
  circuit: { id: 12, name: 'CR-12' },
  substation: { id: 3, code: 'SE-N', name: 'SE-Norte' },
}

function fuse(id: string, phase: string, overrides: Partial<FuseDetailDto> = {}): FuseDetailDto {
  return {
    id,
    phase,
    hw_id: `FAL-${id.slice(-5)}`,
    fuse_state: 'Cerrado',
    is_voltage_present: true,
    inactive: false,
    supercaps_per: 88,
    solar_panel: 5.4,
    recorded_at: RECORDED_AT,
    ...overrides,
  }
}

function transformer(nodeId: string): TransformerDetailDto {
  return {
    id: `${nodeId}-T1`,
    hw_id: 'SMA-00218',
    inactive: false,
    battery_per: 64,
    voltages: { va: 127.1, vb: 126.8, vc: 127.4 },
    recorded_at: RECORDED_AT,
  }
}

const F27_EXAMPLE: NodeDetailResponseDto = {
  node: 'ND04821A07',
  ...LOCATION,
  fuse_sets: [
    {
      id: 1,
      set_id: 'A',
      client_count: 204,
      fuses: [
        fuse('ND04821A07-A-R', 'R', { hw_id: 'FAL-00409' }),
        fuse('ND04821A07-A-S', 'S', { hw_id: 'FAL-00410', supercaps_per: 86 }),
        fuse('ND04821A07-A-T', 'T', { hw_id: 'FAL-00411', supercaps_per: 85 }),
      ],
    },
    {
      id: 2,
      set_id: 'B',
      client_count: 318,
      fuses: [
        fuse('ND04821A07-B-R', 'R', {
          hw_id: 'FAL-00412',
          fuse_state: 'Abierto',
          is_voltage_present: false,
        }),
        fuse('ND04821A07-B-S', 'S', {
          hw_id: 'FAL-00413',
          fuse_state: null,
          is_voltage_present: null,
          inactive: true,
          supercaps_per: null,
          solar_panel: null,
          recorded_at: null,
        }),
      ],
    },
  ],
  transformers: [transformer('ND04821A07')],
}

/** Detail of a mock node; minimal for every node except the F-27 example. */
export function nodeDetailFixture(node: NodeDto): NodeDetailResponseDto {
  if (node.name === F27_EXAMPLE.node) return F27_EXAMPLE

  return {
    node: node.name,
    ...LOCATION,
    fuse_sets:
      node.fuse_state === null
        ? []
        : [{ id: 1, set_id: null, client_count: null, fuses: [fuse(`${node.name}-R`, 'R')] }],
    transformers: node.transformer_state ? [transformer(node.name)] : [],
  }
}
