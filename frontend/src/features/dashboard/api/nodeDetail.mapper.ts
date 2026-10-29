/** Node detail DTO → domain model. The only place that knows the backend field names of the detail. */
import type {
  FuseDetail,
  FuseState,
  NodeDetail,
  TransformerDetail,
} from '../model/nodeDetail.types'
import type { FuseDetailDto, NodeDetailResponseDto, TransformerDetailDto } from './nodeDetail.dto'

/** Value stored by Falcon devices for an open fuse (production data is in Spanish). */
const FALCON_FUSE_OPEN = 'Abierto'

function toFuseState(stored: string | null): FuseState {
  if (stored === null) return 'UNKNOWN'
  return stored === FALCON_FUSE_OPEN ? 'OPEN' : 'CLOSED'
}

function toDate(iso: string | null): Date | null {
  return iso === null ? null : new Date(iso)
}

function toFuse(dto: FuseDetailDto): FuseDetail {
  return {
    id: dto.id,
    phase: dto.phase,
    deviceId: dto.hw_id,
    state: toFuseState(dto.fuse_state),
    hasVoltage: dto.is_voltage_present,
    isInactive: dto.inactive,
    supercapsPercent: dto.supercaps_per,
    solarPanel: dto.solar_panel,
    lastRecordAt: toDate(dto.recorded_at),
  }
}

function toTransformer(dto: TransformerDetailDto): TransformerDetail {
  return {
    id: dto.id,
    deviceId: dto.hw_id,
    isInactive: dto.inactive,
    batteryPercent: dto.battery_per,
    voltages: { a: dto.voltages.va, b: dto.voltages.vb, c: dto.voltages.vc },
    lastRecordAt: toDate(dto.recorded_at),
  }
}

export function toNodeDetail(dto: NodeDetailResponseDto): NodeDetail {
  return {
    nodeId: dto.node,
    circuit: dto.circuit,
    substation: dto.substation,
    fuseSets: dto.fuse_sets.map((set) => ({
      id: set.id,
      branch: set.set_id,
      clientCount: set.client_count,
      fuses: set.fuses.map(toFuse),
    })),
    transformers: dto.transformers.map(toTransformer),
  }
}
