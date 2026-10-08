/**
 * PROVISIONAL — sample data copied from the Figma screen "Monitor / Fuses layer" (M1) until the backend API
 * exists (AGENT.md §20, OQ-02). Delete when useLiveMonitoringQuery calls the real endpoint.
 */
import { MS_PER_MINUTE } from './liveMonitoring.constants'
import type { FaultAlert, LiveMonitoringData, MapCluster, MapNode } from './liveMonitoring.types'

const NODES: MapNode[] = [
  {
    id: 'ND04821A07',
    position: { x: 14.3, y: 19.4 },
    fuseState: 'CRITICAL',
    transformerState: 'NORMAL',
  },
  {
    id: 'ND01120A02',
    position: { x: 35.7, y: 15.5 },
    fuseState: 'NORMAL',
    transformerState: 'NORMAL',
  },
  {
    id: 'ND03377A15',
    position: { x: 51.2, y: 27.2 },
    fuseState: 'WARNING',
    transformerState: null,
  },
  {
    id: 'ND02218B09',
    position: { x: 66.7, y: 19.4 },
    fuseState: 'NORMAL',
    transformerState: 'WARNING',
  },
  {
    id: 'ND08890C04',
    position: { x: 83.3, y: 24.6 },
    fuseState: 'INACTIVE',
    transformerState: null,
  },
  { id: 'ND01543B11', position: { x: 23.8, y: 42.7 }, fuseState: 'NORMAL', transformerState: null },
  {
    id: 'ND05510C11',
    position: { x: 45.2, y: 46.6 },
    fuseState: 'CRITICAL',
    transformerState: 'NORMAL',
  },
  {
    id: 'ND06420A08',
    position: { x: 76.2, y: 49.2 },
    fuseState: 'WARNING',
    transformerState: null,
  },
  {
    id: 'ND07120D05',
    position: { x: 83.3, y: 82.9 },
    fuseState: 'WARNING',
    transformerState: null,
  },
  {
    id: 'ND06102B03',
    position: { x: 61.9, y: 38.9 },
    fuseState: null,
    transformerState: 'CRITICAL',
  },
  {
    id: 'ND07740D02',
    position: { x: 18.9, y: 60.9 },
    fuseState: null,
    transformerState: 'WARNING',
  },
  { id: 'ND09931A01', position: { x: 39.3, y: 66.1 }, fuseState: null, transformerState: 'NORMAL' },
  {
    id: 'ND04410C07',
    position: { x: 90.5, y: 60.9 },
    fuseState: null,
    transformerState: 'INACTIVE',
  },
  { id: 'ND02287B14', position: { x: 61.9, y: 86.8 }, fuseState: null, transformerState: 'NORMAL' },
]

const CLUSTERS: MapCluster[] = [
  { id: 'cluster-west', position: { x: 23.8, y: 64.8 }, count: 4 },
  { id: 'cluster-east', position: { x: 81.0, y: 64.8 }, count: 3 },
]

type FaultSeed = Omit<FaultAlert, 'startedAt' | 'zone'>

const FAULT_SEEDS: FaultSeed[] = [
  {
    id: 'f-1',
    device: 'FALCON',
    type: 'FUSE_OPENING',
    severity: 'CRITICAL',
    status: 'OPEN',
    nodeId: 'ND04821A07',
    substation: 'SE-Norte',
    circuit: 'CR-12',
    branch: 'B',
    phases: { R: 'CRITICAL', S: 'CRITICAL', T: 'OK' },
    durationMinutes: 52,
    customersAffected: 318,
    transformerLoad: null,
  },
  {
    id: 'f-2',
    device: 'FALCON',
    type: 'FUSE_OPENING',
    severity: 'CRITICAL',
    status: 'OPEN',
    nodeId: 'ND05510C11',
    substation: 'SE-Norte',
    circuit: 'CR-07',
    branch: 'A',
    phases: { R: 'OK', S: 'OK', T: 'CRITICAL' },
    durationMinutes: 123,
    customersAffected: 142,
    transformerLoad: null,
  },
  {
    id: 'f-3',
    device: 'FALCON',
    type: 'NO_VOLTAGE',
    severity: 'WARNING',
    status: 'OPEN',
    nodeId: 'ND03377A15',
    substation: 'SE-Sur',
    circuit: 'CR-21',
    branch: 'C',
    phases: { R: 'OK', S: 'WARNING', T: 'OK' },
    durationMinutes: 40,
    customersAffected: 142,
    transformerLoad: null,
  },
  {
    id: 'f-4',
    device: 'SMAC',
    type: 'PHASE_LOSS',
    severity: 'CRITICAL',
    status: 'OPEN',
    nodeId: 'ND06102B03',
    substation: 'SE-Centro',
    circuit: 'CR-03',
    branch: null,
    phases: { R: 'CRITICAL', S: 'CRITICAL', T: 'CRITICAL' },
    durationMinutes: 98,
    customersAffected: 96,
    transformerLoad: null,
  },
  {
    id: 'f-5',
    device: 'SMAC',
    type: 'PHASE_LOSS',
    severity: 'WARNING',
    status: 'OPEN',
    nodeId: 'ND07740D02',
    substation: 'SE-Centro',
    circuit: 'CR-03',
    branch: null,
    phases: { R: 'OK', S: 'OK', T: 'WARNING' },
    durationMinutes: 175,
    customersAffected: 64,
    transformerLoad: null,
  },
  {
    id: 'f-6',
    device: 'SMAC',
    type: 'OVERLOAD_UNBALANCE',
    severity: 'WARNING',
    status: 'OPEN',
    nodeId: 'ND02218B09',
    substation: 'SE-Norte',
    circuit: 'CR-12',
    branch: null,
    phases: null,
    durationMinutes: 250,
    customersAffected: 0,
    transformerLoad: { loadPct: 118, voltageUnbalancePct: 3.4 },
  },
  {
    id: 'f-7',
    device: 'FALCON',
    type: 'FUSE_OPENING',
    severity: 'CRITICAL',
    status: 'RESOLVED',
    nodeId: 'ND01120A02',
    substation: 'SE-Norte',
    circuit: 'CR-07',
    branch: 'A',
    phases: { R: 'CRITICAL', S: 'OK', T: 'OK' },
    durationMinutes: 35,
    customersAffected: 87,
    transformerLoad: null,
  },
  {
    id: 'f-8',
    device: 'SMAC',
    type: 'PHASE_LOSS',
    severity: 'WARNING',
    status: 'RESOLVED',
    nodeId: 'ND09931A01',
    substation: 'SE-Sur',
    circuit: 'CR-21',
    branch: null,
    phases: { R: 'OK', S: 'WARNING', T: 'OK' },
    durationMinutes: 3,
    customersAffected: 12,
    transformerLoad: null,
  },
]

/** Builds the sample data relative to `now`, so "last hour / last day" filters behave like real data. */
export function buildLiveMonitoringMock(now: number): LiveMonitoringData {
  const faults = FAULT_SEEDS.map((seed) => ({
    ...seed,
    zone: 'Z-01',
    startedAt: new Date(now - seed.durationMinutes * MS_PER_MINUTE),
  }))
  return {
    nodes: NODES,
    clusters: CLUSTERS,
    faults,
    counters: {
      fuseAlarmNodes: 7,
      voltageAlarmNodes: 2,
      phaseOutOfRangeNodes: 3,
      phaseDroppedNodes: 2,
    },
  }
}
