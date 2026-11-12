import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getDataSourceToken } from '@nestjs/typeorm';
import { FaultsService } from './faults.service';

describe('FaultsService (NF-15, NF-09, NF-11)', () => {
  let service: FaultsService;
  let mockQuery: jest.Mock;
  let mockConfigGet: jest.Mock;

  beforeEach(async () => {
    mockQuery = jest.fn();
    mockConfigGet = jest.fn((key: string) => {
      const config: Record<string, number> = {
        FAULT_GROUPING_WINDOW_MINUTES: 10,
        SEVERITY_WEIGHT_FUSE_ALARM: 120,
        SEVERITY_WEIGHT_VOLTAGE_ALARM: 80,
        SEVERITY_WEIGHT_DROPPED_PHASE: 60,
        SEVERITY_WEIGHT_PHASE_OUT_OF_RANGE: 30,
      };
      return config[key];
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FaultsService,
        {
          provide: ConfigService,
          useValue: { get: mockConfigGet },
        },
        {
          provide: getDataSourceToken(),
          useValue: { query: mockQuery },
        },
      ],
    }).compile();

    service = module.get<FaultsService>(FaultsService);
  });

  it('reads the grouping window from ConfigService without code changes (NF-09)', () => {
    expect(service.getGroupingWindowMinutes()).toBe(10);
  });

  it('reads severity weights from ConfigService without code changes (NF-11)', () => {
    expect(service.getSeverityWeights()).toEqual({
      fuseAlarm: 120,
      voltageAlarm: 80,
      droppedPhase: 60,
      phaseOutOfRange: 30,
    });
  });

  it('falls back to default severity weights when env variables are not set (NF-11)', () => {
    mockConfigGet.mockReturnValue(undefined);
    expect(service.getSeverityWeights()).toEqual({
      fuseAlarm: 100,
      voltageAlarm: 75,
      droppedPhase: 50,
      phaseOutOfRange: 25,
    });
  });

  it('groups active faults by fuses_set_id to keep branches separate (F-50, NF-15)', async () => {
    mockQuery.mockResolvedValue([
      { node_id: 'NODE-1', fuses_set_id: 'SET-A', affected_phases: ['A'], first_opening_time: '2026-10-28T10:00:00Z' },
      { node_id: 'NODE-1', fuses_set_id: 'SET-B', affected_phases: ['B', 'C'], first_opening_time: '2026-10-28T10:01:00Z' },
    ]);

    const result = await service.getActiveFaults();

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('GROUP BY fs.node_id, f.fuses_set_id'),
      [10],
    );
    expect(result).toHaveLength(2);
  });
});