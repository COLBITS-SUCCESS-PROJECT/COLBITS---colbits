import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { DEVICE_SCOPED_FUSES_SQL } from '../history/history-selection';
import { ScopeContext } from '../scope/scope.types';
import {
  FALCON_TELEMETRY_UNITS,
  SMAC_TELEMETRY_UNITS,
} from './dto/node-telemetry.dto';
import { Node } from './node.entity';
import { NodeTelemetryWindow } from './node-telemetry-params';
import {
  DEVICE_SCOPED_TRANSFORMERS_SQL,
  NODE_FALCON_READINGS_SQL,
  NODE_SMAC_PF_SQL,
  NODE_SMAC_PW_SQL,
  NODE_SMAC_VC_SQL,
  NODE_TELEMETRY_FUSES_SQL,
  NODE_TELEMETRY_TRANSFORMERS_SQL,
  NodeTelemetryService,
} from './node-telemetry.service';

const NODE = '0000100002';
const UNRESTRICTED: ScopeContext = { kind: 'unrestricted' };
const RESTRICTED: ScopeContext = { kind: 'restricted', userId: 7 };
const EMPTY: ScopeContext = { kind: 'empty' };

const WINDOW: NodeTelemetryWindow = {
  from: new Date('2026-10-21T05:00:00.000Z'),
  to: new Date('2026-10-22T05:00:00.000Z'),
};
const FROM_ISO = '2026-10-21T05:00:00.000Z';
const TO_ISO = '2026-10-22T05:00:00.000Z';

/** Fuse element rows: set A (pk 2) with R and S, set B (pk 3) with R. */
const FUSE_ROWS = [
  { set_pk: 2, set_id: 'A', custom_id: `${NODE}-A-R`, phase: 'R' },
  { set_pk: 2, set_id: 'A', custom_id: `${NODE}-A-S`, phase: 'S' },
  { set_pk: '3', set_id: 'B', custom_id: `${NODE}-B-R`, phase: 'R' },
];
const TRANSFORMER_ROWS = [
  { custom_id: `${NODE}-T1-1` },
  { custom_id: `${NODE}-T1-2` },
];

interface Options {
  count?: number;
  fuses?: unknown[];
  transformers?: unknown[];
  deviceFuses?: unknown[];
  deviceTransformers?: unknown[];
  falcon?: unknown[];
  vc?: unknown[];
  pw?: unknown[];
  pf?: unknown[];
}

function serviceWith(options: Options = {}) {
  const builder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(options.count ?? 1),
  };
  const answers = new Map<string, unknown[]>([
    [NODE_TELEMETRY_FUSES_SQL, options.fuses ?? FUSE_ROWS],
    [NODE_TELEMETRY_TRANSFORMERS_SQL, options.transformers ?? TRANSFORMER_ROWS],
    [
      DEVICE_SCOPED_FUSES_SQL,
      options.deviceFuses ?? [{ has_device_scope: false, fuses: null }],
    ],
    [
      DEVICE_SCOPED_TRANSFORMERS_SQL,
      options.deviceTransformers ?? [
        { has_device_scope: false, transformers: null },
      ],
    ],
    [NODE_FALCON_READINGS_SQL, options.falcon ?? []],
    [NODE_SMAC_VC_SQL, options.vc ?? []],
    [NODE_SMAC_PW_SQL, options.pw ?? []],
    [NODE_SMAC_PF_SQL, options.pf ?? []],
  ]);
  const repository = {
    createQueryBuilder: jest.fn().mockReturnValue(builder),
    query: jest.fn((sql: string, _parameters?: unknown[]): Promise<unknown> => {
      const rows = answers.get(sql);
      return rows === undefined
        ? Promise.reject(new Error('unexpected SQL'))
        : Promise.resolve(rows);
    }),
  };
  const service = new NodeTelemetryService(
    repository as unknown as Repository<Node>,
  );
  return { service, repository, builder };
}

/** Parameters of the (single) call made with the given SQL. */
function callOf(
  repository: { query: jest.Mock },
  sql: string,
): unknown[] | undefined {
  const call = (repository.query.mock.calls as [string, unknown[]][]).find(
    ([text]) => text === sql,
  );
  return call?.[1];
}

function ranSql(repository: { query: jest.Mock }, sql: string): boolean {
  return (repository.query.mock.calls as [string][]).some(
    ([text]) => text === sql,
  );
}

const READING_SQLS = [
  NODE_FALCON_READINGS_SQL,
  NODE_SMAC_VC_SQL,
  NODE_SMAC_PW_SQL,
  NODE_SMAC_PF_SQL,
];

function falconRow(
  customId: string,
  recordedAt: Date | string,
  extra: Record<string, unknown> = {},
) {
  return {
    custom_id: customId,
    hw_id: '1301000007',
    recorded_at: recordedAt,
    fuse_state: 'Cerrado',
    is_voltage_present: true,
    internal_temperature: 31.5,
    supercaps_per: 87,
    solar_panel: 4.1,
    angle_incl: 2.5,
    ...extra,
  };
}

describe('NodeTelemetryService.telemetryOf (SCRUM-307 · F-75)', () => {
  describe('node visibility', () => {
    it('answers 404 and reads nothing for a node outside the scope', async () => {
      const { service, repository, builder } = serviceWith({ count: 0 });

      await expect(
        service.telemetryOf(NODE, WINDOW, RESTRICTED),
      ).rejects.toThrow(new NotFoundException('Node not found'));
      expect(builder.where).toHaveBeenCalledWith('node.name = :nodeName', {
        nodeName: NODE,
      });
      expect(repository.query).not.toHaveBeenCalled();
    });

    it('answers 404 and reads nothing for an empty scope', async () => {
      const { service, repository } = serviceWith({ count: 0 });

      await expect(service.telemetryOf(NODE, WINDOW, EMPTY)).rejects.toThrow(
        NotFoundException,
      );
      expect(repository.query).not.toHaveBeenCalled();
    });
  });

  describe('elements', () => {
    it('lists every set, fuse and transformer for an unrestricted user (no device query)', async () => {
      const { service, repository } = serviceWith();

      const result = await service.telemetryOf(NODE, WINDOW, UNRESTRICTED);

      expect(
        result.fuse_sets.map((set) => [
          set.id,
          set.set_id,
          set.fuses.map((fuse) => [fuse.id, fuse.phase]),
        ]),
      ).toEqual([
        [
          2,
          'A',
          [
            [`${NODE}-A-R`, 'R'],
            [`${NODE}-A-S`, 'S'],
          ],
        ],
        [3, 'B', [[`${NODE}-B-R`, 'R']]],
      ]);
      expect(result.transformers.map((t) => t.id)).toEqual([
        `${NODE}-T1-1`,
        `${NODE}-T1-2`,
      ]);
      expect(ranSql(repository, DEVICE_SCOPED_FUSES_SQL)).toBe(false);
      expect(ranSql(repository, DEVICE_SCOPED_TRANSFORMERS_SQL)).toBe(false);
    });

    it('keeps a set without fuses (fuses: []) when nothing narrows', async () => {
      const { service } = serviceWith({
        fuses: [
          ...FUSE_ROWS,
          { set_pk: 4, set_id: 'C', custom_id: null, phase: null },
        ],
      });

      const result = await service.telemetryOf(NODE, WINDOW, UNRESTRICTED);

      expect(result.fuse_sets.map((set) => set.set_id)).toEqual([
        'A',
        'B',
        'C',
      ]);
      expect(result.fuse_sets[2].fuses).toEqual([]);
    });

    it('lists a fuse without a recorded phase with an empty phase', async () => {
      const { service } = serviceWith({
        fuses: [{ set_pk: 2, set_id: null, custom_id: 'f1', phase: null }],
      });

      const result = await service.telemetryOf(NODE, WINDOW, UNRESTRICTED);

      expect(result.fuse_sets).toEqual([
        { id: 2, set_id: null, fuses: [{ id: 'f1', phase: '', readings: [] }] },
      ]);
    });

    it('lists a node without transformers and reads no SMAC table', async () => {
      const { service, repository } = serviceWith({ transformers: [] });

      const result = await service.telemetryOf(NODE, WINDOW, UNRESTRICTED);

      expect(result.transformers).toEqual([]);
      expect(ranSql(repository, NODE_SMAC_VC_SQL)).toBe(false);
      expect(ranSql(repository, NODE_SMAC_PW_SQL)).toBe(false);
      expect(ranSql(repository, NODE_SMAC_PF_SQL)).toBe(false);
    });

    it('lists everything for a restricted user without device assignments', async () => {
      const { service, repository } = serviceWith();

      const result = await service.telemetryOf(NODE, WINDOW, RESTRICTED);

      expect(repository.query).toHaveBeenCalledWith(DEVICE_SCOPED_FUSES_SQL, [
        [NODE],
        7,
      ]);
      expect(repository.query).toHaveBeenCalledWith(
        DEVICE_SCOPED_TRANSFORMERS_SQL,
        [[NODE], 7],
      );
      expect(result.fuse_sets.flatMap((s) => s.fuses)).toHaveLength(3);
      expect(result.transformers).toHaveLength(2);
    });

    it('limits a restricted user with device assignments to the authorized elements', async () => {
      const { service, repository } = serviceWith({
        deviceFuses: [{ has_device_scope: true, fuses: [`${NODE}-A-S`] }],
        deviceTransformers: [
          { has_device_scope: true, transformers: [`${NODE}-T1-2`] },
        ],
      });

      const result = await service.telemetryOf(NODE, WINDOW, RESTRICTED);

      // Set B has no authorized fuse and is dropped.
      expect(
        result.fuse_sets.map((set) => [
          set.set_id,
          set.fuses.map((fuse) => fuse.id),
        ]),
      ).toEqual([['A', [`${NODE}-A-S`]]]);
      expect(result.transformers.map((t) => t.id)).toEqual([`${NODE}-T1-2`]);
      expect(callOf(repository, NODE_FALCON_READINGS_SQL)?.[0]).toEqual([
        `${NODE}-A-S`,
      ]);
      for (const sql of [
        NODE_SMAC_VC_SQL,
        NODE_SMAC_PW_SQL,
        NODE_SMAC_PF_SQL,
      ]) {
        expect(callOf(repository, sql)).toEqual([
          [NODE],
          [`${NODE}-T1-2`],
          FROM_ISO,
          TO_ISO,
        ]);
      }
    });

    it('narrows fuses and transformers independently', async () => {
      const { service } = serviceWith({
        deviceFuses: [{ has_device_scope: true, fuses: [`${NODE}-B-R`] }],
        deviceTransformers: [
          { has_device_scope: true, transformers: [`${NODE}-T1-1`] },
        ],
      });

      const result = await service.telemetryOf(NODE, WINDOW, RESTRICTED);

      expect(result.fuse_sets.flatMap((s) => s.fuses.map((f) => f.id))).toEqual(
        [`${NODE}-B-R`],
      );
      expect(result.transformers.map((t) => t.id)).toEqual([`${NODE}-T1-1`]);
    });

    it.each([
      ['null lists', null, null],
      ['empty lists', [], []],
    ])(
      'fails closed: device assignments with %s authorize nothing and read nothing',
      async (_label, fuses, transformers) => {
        const { service, repository } = serviceWith({
          deviceFuses: [{ has_device_scope: true, fuses }],
          deviceTransformers: [{ has_device_scope: true, transformers }],
          falcon: [falconRow(`${NODE}-A-R`, new Date(FROM_ISO))],
        });

        const result = await service.telemetryOf(NODE, WINDOW, RESTRICTED);

        expect(result.fuse_sets).toEqual([]);
        expect(result.transformers).toEqual([]);
        for (const sql of READING_SQLS) {
          expect(ranSql(repository, sql)).toBe(false);
        }
      },
    );

    it('fails when the fuse device-scope query returns no row', async () => {
      const { service } = serviceWith({ deviceFuses: [] });

      await expect(
        service.telemetryOf(NODE, WINDOW, RESTRICTED),
      ).rejects.toThrow('The device-scope query returned no row');
    });

    it('fails when the transformer device-scope query returns no row', async () => {
      const { service } = serviceWith({ deviceTransformers: [] });

      await expect(
        service.telemetryOf(NODE, WINDOW, RESTRICTED),
      ).rejects.toThrow('The device-scope query returned no row');
    });
  });

  describe('readings', () => {
    it('returns the window, the units and every element with its arrays', async () => {
      const { service } = serviceWith();

      const result = await service.telemetryOf(NODE, WINDOW, UNRESTRICTED);

      expect(result.node).toBe(NODE);
      expect(result.from).toBe(FROM_ISO);
      expect(result.to).toBe(TO_ISO);
      expect(result.units).toEqual({
        falcon: FALCON_TELEMETRY_UNITS,
        smac: SMAC_TELEMETRY_UNITS,
      });
      for (const fuse of result.fuse_sets.flatMap((s) => s.fuses)) {
        expect(fuse.readings).toEqual([]);
      }
      for (const transformer of result.transformers) {
        expect(transformer).toMatchObject({ vc: [], pw: [], pf: [] });
      }
    });

    it('passes the window as ISO strings and the ids to the Falcon query', async () => {
      const { service, repository } = serviceWith();

      await service.telemetryOf(NODE, WINDOW, UNRESTRICTED);

      expect(callOf(repository, NODE_FALCON_READINGS_SQL)).toEqual([
        [`${NODE}-A-R`, `${NODE}-A-S`, `${NODE}-B-R`],
        FROM_ISO,
        TO_ISO,
      ]);
    });

    it('passes the distinct first 10 characters of the transformers to the SMAC queries', async () => {
      const { service, repository } = serviceWith({
        transformers: [
          { custom_id: '0000100002-T1-1' },
          { custom_id: '0000100002-T1-2' },
          { custom_id: '0000100003-T1-1' },
        ],
      });

      await service.telemetryOf(NODE, WINDOW, UNRESTRICTED);

      for (const sql of [
        NODE_SMAC_VC_SQL,
        NODE_SMAC_PW_SQL,
        NODE_SMAC_PF_SQL,
      ]) {
        expect(callOf(repository, sql)).toEqual([
          ['0000100002', '0000100003'],
          ['0000100002-T1-1', '0000100002-T1-2', '0000100003-T1-1'],
          FROM_ISO,
          TO_ISO,
        ]);
      }
    });

    it('groups Falcon readings by fuse and set, keeping SQL order, and gives [] to a fuse with none', async () => {
      const { service } = serviceWith({
        falcon: [
          falconRow(`${NODE}-A-R`, new Date('2026-10-21T06:00:00Z')),
          falconRow(`${NODE}-A-R`, new Date('2026-10-21T07:00:00Z'), {
            fuse_state: 'Abierto',
            is_voltage_present: false,
          }),
          falconRow(`${NODE}-B-R`, new Date('2026-10-21T06:30:00Z')),
        ],
      });

      const result = await service.telemetryOf(NODE, WINDOW, UNRESTRICTED);

      const [setA, setB] = result.fuse_sets;
      expect(setA.fuses[0].readings.map((r) => r.recorded_at)).toEqual([
        '2026-10-21T06:00:00.000Z',
        '2026-10-21T07:00:00.000Z',
      ]);
      expect(setA.fuses[0].readings[1]).toMatchObject({
        fuse_state: 'Abierto',
        is_voltage_present: false,
      });
      expect(setA.fuses[1].readings).toEqual([]);
      expect(setB.fuses[0].readings).toHaveLength(1);
    });

    it('maps a Falcon reading field by field', async () => {
      const { service } = serviceWith({
        falcon: [falconRow(`${NODE}-A-R`, new Date('2026-10-21T06:00:00Z'))],
      });

      const result = await service.telemetryOf(NODE, WINDOW, UNRESTRICTED);

      expect(result.fuse_sets[0].fuses[0].readings[0]).toEqual({
        recorded_at: '2026-10-21T06:00:00.000Z',
        hw_id: '1301000007',
        fuse_state: 'Cerrado',
        is_voltage_present: true,
        internal_temperature: 31.5,
        supercaps_per: 87,
        solar_panel: 4.1,
        angle_incl: 2.5,
      });
    });

    it('keeps NULL measurements as null, converts numeric strings and nulls non-finite values', async () => {
      const { service } = serviceWith({
        falcon: [
          falconRow(`${NODE}-A-R`, '2026-10-21T06:00:00Z', {
            fuse_state: null,
            is_voltage_present: null,
            internal_temperature: null,
            supercaps_per: '42.5',
            solar_panel: Number.NaN,
            angle_incl: undefined,
          }),
          falconRow(`${NODE}-A-R`, new Date('2026-10-21T07:00:00Z'), {
            internal_temperature: Number.POSITIVE_INFINITY,
            supercaps_per: 'abc',
            solar_panel: '',
            angle_incl: { not: 'a number' },
          }),
          falconRow(`${NODE}-A-R`, new Date('2026-10-21T08:00:00Z'), {
            internal_temperature: 0,
            solar_panel: '0',
          }),
        ],
      });

      const result = await service.telemetryOf(NODE, WINDOW, UNRESTRICTED);

      const [first, second, third] = result.fuse_sets[0].fuses[0].readings;
      expect(first).toEqual({
        recorded_at: '2026-10-21T06:00:00.000Z',
        hw_id: '1301000007',
        fuse_state: null,
        is_voltage_present: null,
        internal_temperature: null,
        supercaps_per: 42.5,
        solar_panel: null,
        angle_incl: null,
      });
      expect(second).toMatchObject({
        internal_temperature: null,
        supercaps_per: null,
        solar_panel: null,
        angle_incl: null,
      });
      expect(third).toMatchObject({ internal_temperature: 0, solar_panel: 0 });
    });

    it('keeps two rows with the same recorded_at from different hw_id, in order', async () => {
      const at = new Date('2026-10-21T06:00:00Z');
      const { service } = serviceWith({
        falcon: [
          falconRow(`${NODE}-A-R`, at, { hw_id: '1301000001' }),
          falconRow(`${NODE}-A-R`, at, { hw_id: '1301000002' }),
        ],
      });

      const result = await service.telemetryOf(NODE, WINDOW, UNRESTRICTED);

      expect(
        result.fuse_sets[0].fuses[0].readings.map((r) => [
          r.recorded_at,
          r.hw_id,
        ]),
      ).toEqual([
        ['2026-10-21T06:00:00.000Z', '1301000001'],
        ['2026-10-21T06:00:00.000Z', '1301000002'],
      ]);
    });

    it('returns the raw SMAC rows per table, not aligned, with nulls preserved', async () => {
      const { service } = serviceWith({
        vc: [
          {
            custom_id: `${NODE}-T1-1`,
            hw_id: '0501000002',
            recorded_at: new Date('2026-10-21T06:00:00Z'),
            internal_temperature: 35.2,
            battery_per: 92,
            va: 127.1,
            vb: null,
            vc: '127.4',
            ia: 12.3,
            ib: 11.9,
            ic: 12.1,
            in_: 0.4,
            cuf_percent: '2.1',
            vuf_percent: '0.8',
            load_percent: '64.5',
          },
        ],
        pw: [
          {
            custom_id: `${NODE}-T1-1`,
            hw_id: '0501000002',
            recorded_at: new Date('2026-10-21T06:00:30Z'),
            phase_a_active_power: 1200,
            phase_b_active_power: null,
            phase_c_active_power: 1180,
            phase_a_reactive_power: 300,
            phase_b_reactive_power: 290,
            phase_c_reactive_power: 310,
            phase_a_apparent_power: 1237,
            phase_b_apparent_power: 1186,
          },
          {
            custom_id: `${NODE}-T1-1`,
            hw_id: '0501000002',
            recorded_at: new Date('2026-10-21T06:05:30Z'),
            phase_a_active_power: 1,
            phase_b_active_power: 2,
            phase_c_active_power: 3,
            phase_a_reactive_power: 4,
            phase_b_reactive_power: 5,
            phase_c_reactive_power: 6,
            phase_a_apparent_power: 7,
            phase_b_apparent_power: 8,
          },
        ],
        pf: [
          {
            custom_id: `${NODE}-T1-2`,
            hw_id: '0501000009',
            recorded_at: '2026-10-21T06:01:00Z',
            phase_c_apparent_power: 1220,
            phase_a_power_factor: 0.97,
            phase_b_power_factor: 0.96,
            phase_c_power_factor: null,
          },
        ],
      });

      const result = await service.telemetryOf(NODE, WINDOW, UNRESTRICTED);

      const [first, second] = result.transformers;
      expect(first.id).toBe(`${NODE}-T1-1`);
      expect(first.vc).toEqual([
        {
          recorded_at: '2026-10-21T06:00:00.000Z',
          hw_id: '0501000002',
          internal_temperature: 35.2,
          battery_per: 92,
          va: 127.1,
          vb: null,
          vc: 127.4,
          ia: 12.3,
          ib: 11.9,
          ic: 12.1,
          in_: 0.4,
          cuf_percent: 2.1,
          vuf_percent: 0.8,
          load_percent: 64.5,
        },
      ]);
      expect(first.pw.map((r) => r.recorded_at)).toEqual([
        '2026-10-21T06:00:30.000Z',
        '2026-10-21T06:05:30.000Z',
      ]);
      expect(first.pw[0]).toMatchObject({
        phase_a_active_power: 1200,
        phase_b_active_power: null,
        phase_b_apparent_power: 1186,
      });
      expect(first.pf).toEqual([]);
      expect(second.id).toBe(`${NODE}-T1-2`);
      expect(second.vc).toEqual([]);
      expect(second.pw).toEqual([]);
      expect(second.pf).toEqual([
        {
          recorded_at: '2026-10-21T06:01:00.000Z',
          hw_id: '0501000009',
          phase_c_apparent_power: 1220,
          phase_a_power_factor: 0.97,
          phase_b_power_factor: 0.96,
          phase_c_power_factor: null,
        },
      ]);
    });
  });
});
