import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// #CORRECTION CL-13/CL-01 (2026-11-09): removed getActiveFaults(). Nothing used it, it filtered fuse_state = 'OPEN' (the real value is 'Abierto') and read telemetry instead of alarms.
/**
 * Fault settings. The active fault list itself is ActiveFaultsService, which reads `alarms` (CL-01).
 */
@Injectable()
export class FaultsService {
  constructor(private readonly configService: ConfigService) {}

  /** Window for grouping faults without code changes (NF-09, 5 minutes by default). */
  getGroupingWindowMinutes(): number {
    const configured = Number(
      this.configService.get('FAULT_GROUPING_WINDOW_MINUTES'),
    );
    return Number.isFinite(configured) && configured > 0 ? configured : 5;
  }
}
