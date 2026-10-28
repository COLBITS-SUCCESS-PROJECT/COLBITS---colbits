import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getDataSourceToken } from '@nestjs/typeorm';
import { FaultsService } from './faults.service';

describe('FaultsService (NF-15: F-50 & NF-09)', () => {
  let service: FaultsService;
  let mockQuery: jest.Mock;

  beforeEach(async () => {
    mockQuery = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FaultsService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(10) }, 
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

  it('groups active faults by fuses_set_id to keep branches separate (F-50, NF-15)', async () => {
    mockQuery.mockResolvedValue([
      { node_id: 'NODE-1', fuses_set_id: 'SET-A', affected_phases: ['A'], first_opening_time: '2026-10-28T10:00:00Z' },
      { node_id: 'NODE-1', fuses_set_id: 'SET-B', affected_phases: ['B', 'C'], first_opening_time: '2026-10-28T10:01:00Z' },
    ]);

    const result = await service.getActiveFaults();

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('GROUP BY fs.node_id, f.fuses_set_id'),
      [10]
    );

    expect(result).toHaveLength(2);
    expect(result[0].fuses_set_id).toBe('SET-A');
    expect(result[1].fuses_set_id).toBe('SET-B');
  });
});