// Builds the network hierarchy with the same structure as Colbits' schema (F-90):
// departments -> zones -> substations -> circuits -> nodes -> fuse sets -> fuses (Falcon)
//                                                       nodes -> trafos (SMAC)
import type { GeneratorConfig } from './config.ts';
import { createRng, deriveSeed, type Rng } from './rng.ts';

export type DepartmentName = 'north_district' | 'south_district';

export type Department = { id: number; name: DepartmentName };
export type Zone = { id: number; name: string; departmentId: number };
export type Substation = { id: number; code: string; name: string; zoneId: number };
export type Circuit = { id: number; name: string; substationId: number };
export type Node = { name: string; circuitId: number; latitude: number; longitude: number };
export type Device = { hwId: string; deviceType: 'falcon' | 'smac'; latitude: number; longitude: number };
export type FuseSet = { id: number; nodeId: string; setId: string | null; extRefId: string; clientCount: number };
export type Fuse = { customId: string; fusesSetId: number; phase: string; currentHwId: string; nodeId: string };
export type Trafo = { customId: string; nodeId: string; ratedKva: number; extRefId: string; currentHwId: string; phases: 2 | 3 };

export type Network = {
  departments: Department[];
  zones: Zone[];
  substations: Substation[];
  circuits: Circuit[];
  nodes: Node[];
  devices: Device[];
  fuseSets: FuseSet[];
  fuses: Fuse[];
  trafos: Trafo[];
};

const DEPARTMENTS: readonly DepartmentName[] = ['north_district', 'south_district'];
// Rough centres in Colombia (north: Antioquia area, south: Valle del Cauca area).
const DEPARTMENT_CENTRES: Record<DepartmentName, [number, number]> = {
  north_district: [6.25, -75.57],
  south_district: [3.43, -76.52],
};
const CURRENT_PHASES = ['R', 'S', 'T'] as const;
const TRAFO_KVA = [25, 37.5, 50, 75, 112.5] as const;

/** Splits `total` items over `buckets` as evenly as possible: [3, 3, 2] for (8, 3). */
export function distribute(total: number, buckets: number): number[] {
  const base = Math.floor(total / buckets);
  const extra = total % buckets;
  return Array.from({ length: buckets }, (_, i) => base + (i < extra ? 1 : 0));
}

const pad = (n: number, width: number): string => String(n).padStart(width, '0');
/** 10 hex characters: device-type prefix ('13' Falcon, '05' SMAC) + 8 hex digits, as in Colbits' data. */
const hwId = (prefix: '13' | '05', index: number): string =>
  prefix + (0x01000000 + index).toString(16).toUpperCase().padStart(8, '0');
const round6 = (x: number): number => Math.round(x * 1e6) / 1e6;

function jitter(rng: Rng, [lat, lon]: [number, number], spread: number): [number, number] {
  return [lat + rng.range(-spread, spread), lon + rng.range(-spread, spread)];
}

export function buildNetwork(config: GeneratorConfig): Network {
  const rng = createRng(deriveSeed(config.seed, 'network'));

  const departmentsUsed = DEPARTMENTS.slice(0, Math.min(DEPARTMENTS.length, config.zones));
  const departments: Department[] = departmentsUsed.map((name, i) => ({ id: i + 1, name }));

  // Zones round-robin over departments; each gets a centre near its department.
  const zones: Zone[] = [];
  const zoneCentre = new Map<number, [number, number]>();
  for (let i = 0; i < config.zones; i++) {
    const dept = departments[i % departments.length] as Department;
    const id = i + 1;
    const ringNumber = Math.floor(i / departments.length) + 1;
    zones.push({ id, name: `${dept.name === 'north_district' ? 'North' : 'South'} Ring ${pad(ringNumber, 2)}`, departmentId: dept.id });
    zoneCentre.set(id, jitter(rng, DEPARTMENT_CENTRES[dept.name], 0.4));
  }

  const substations: Substation[] = [];
  const substationCentre = new Map<number, [number, number]>();
  let nextSubstation = 1;
  distribute(config.substations, config.zones).forEach((count, zi) => {
    const zone = zones[zi] as Zone;
    for (let k = 0; k < count; k++) {
      const id = nextSubstation++;
      const side = zone.name.startsWith('North') ? 'NORTE' : 'SUR';
      substations.push({ id, code: `SUB-${side[0]}-${pad(id, 3)}`, name: `S/E ${side} ${id}`, zoneId: zone.id });
      substationCentre.set(id, jitter(rng, zoneCentre.get(zone.id) as [number, number], 0.12));
    }
  });

  const circuits: Circuit[] = [];
  const circuitCentre = new Map<number, [number, number]>();
  let nextCircuit = 1;
  distribute(config.circuits, config.substations).forEach((count, si) => {
    const sub = substations[si] as Substation;
    for (let k = 0; k < count; k++) {
      const id = nextCircuit++;
      // Same circuit name can repeat across substations, exactly like the real data ('CTO 1').
      circuits.push({ id, name: `CTO ${k + 1}`, substationId: sub.id });
      circuitCentre.set(id, jitter(rng, substationCentre.get(sub.id) as [number, number], 0.04));
    }
  });

  // Nodes: 10-character names, laid out along a short feeder line so each circuit
  // stays geographically compact (F-98) instead of being scattered.
  const nodes: Node[] = [];
  distribute(config.nodes, config.circuits).forEach((count, ci) => {
    const circuit = circuits[ci] as Circuit;
    const [clat, clon] = circuitCentre.get(circuit.id) as [number, number];
    const heading = rng.range(0, Math.PI);
    for (let k = 0; k < count; k++) {
      const along = (k - count / 2) * 0.0009; // ~100 m between poles
      const lat = clat + Math.sin(heading) * along + rng.noise(0.0003);
      const lon = clon + Math.cos(heading) * along + rng.noise(0.0003);
      nodes.push({ name: pad(circuit.id, 5) + pad(k + 1, 5), circuitId: circuit.id, latitude: round6(lat), longitude: round6(lon) });
    }
  });

  const devices: Device[] = [];
  const fuseSets: FuseSet[] = [];
  const fuses: Fuse[] = [];
  const trafos: Trafo[] = [];
  let falconIndex = 0;
  let smacIndex = 0;

  const twoBranch = new Set(rng.shuffle(nodes.map((n) => n.name)).slice(0, config.twoBranchNodes));
  for (const node of nodes) {
    const branches = twoBranch.has(node.name) ? ['A', 'B'] : [null];
    for (const branch of branches) {
      const set: FuseSet = {
        id: fuseSets.length + 1,
        nodeId: node.name,
        setId: branch,
        extRefId: `EXT-FS-${pad(fuseSets.length + 1, 6)}`,
        clientCount: rng.int(5, 60),
      };
      fuseSets.push(set);
      for (const phase of CURRENT_PHASES) {
        const id = hwId('13', ++falconIndex);
        devices.push({ hwId: id, deviceType: 'falcon', latitude: node.latitude, longitude: node.longitude });
        const customId = branch ? `${node.name}-${branch}-${phase}` : `${node.name}-${phase}`;
        fuses.push({ customId, fusesSetId: set.id, phase, currentHwId: id, nodeId: node.name });
      }
    }
  }

  const trafoCount = Math.round(config.nodes * config.trafoRatio);
  const trafoNodes = rng.shuffle(nodes).slice(0, trafoCount);
  const twoPhaseCount = Math.round(trafoCount * config.twoPhaseTrafoRatio);
  trafoNodes.forEach((node, i) => {
    const phases: 2 | 3 = i < twoPhaseCount ? 2 : 3;
    const id = hwId('05', ++smacIndex);
    devices.push({ hwId: id, deviceType: 'smac', latitude: node.latitude, longitude: node.longitude });
    trafos.push({
      customId: `${node.name}-T1-${phases}`,
      nodeId: node.name,
      ratedKva: rng.pick(TRAFO_KVA),
      extRefId: `EXT-TR-${pad(i + 1, 6)}`,
      currentHwId: id,
      phases,
    });
  });

  return { departments, zones, substations, circuits, nodes, devices, fuseSets, fuses, trafos };
}
