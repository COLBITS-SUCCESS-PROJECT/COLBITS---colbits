import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class FaultsService {
  constructor(
    private readonly configService: ConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /**  Window for grouping faults without code changes */
  getGroupingWindowMinutes(): number {
    const configured = Number(this.configService.get('FAULT_GROUPING_WINDOW_MINUTES'));
    return Number.isFinite(configured) && configured > 0 ? configured : 5;
  }

  /** Report openings in different fuse sets as separate faults */
  async getActiveFaults() {
    const windowMinutes = this.getGroupingWindowMinutes();

    // Grouping by f.fuses_set_id guarantees faults on different branches of the same node are kept separate
    const sql = `
      SELECT 
        fs.node_id,
        f.fuses_set_id,
        ARRAY_AGG(f.phase) as affected_phases,
        MIN(l.recorded_at) as first_opening_time
      FROM public.fuses_sets fs
      JOIN public.fuses f ON f.fuses_set_id = fs.id
      JOIN public.last_falcon_values l ON l.hw_id = f.current_hw_id
      WHERE l.fuse_state = 'OPEN'
      -- The window parameter ($1) is available here for Javier's timestamp logic
      GROUP BY fs.node_id, f.fuses_set_id
    `;

    return this.dataSource.query(sql, [windowMinutes]);
  }
}