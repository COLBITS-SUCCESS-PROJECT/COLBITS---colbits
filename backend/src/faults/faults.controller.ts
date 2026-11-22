import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { ScopeService } from '../scope/scope.service';
import { ActiveFaultsService } from './active-faults.service';
import { FaultIndicatorsResponseDto } from './dto/fault-indicators.dto';
import {
  ActiveFaultsResponseDto,
  RESOLVED_WINDOWS,
  type ResolvedWindow,
} from './dto/faults.dto';
import {
  FaultIndicatorsQuery,
  FaultIndicatorsService,
} from './fault-indicators.service';

const DEFAULT_INDICATORS_RANGE_DAYS = 30;
const DAY_MS = 24 * 3_600_000;

@Controller('faults')
@ApiTags('faults')
export class FaultsController {
  constructor(
    private readonly activeFaultsService: ActiveFaultsService,
    private readonly scopeService: ScopeService,
    private readonly faultIndicatorsService?: FaultIndicatorsService,
  ) {}

  @Get()
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Active fuse-opening faults, loss-of-voltage alarms, SMAC phase alarms and device alerts (free fall, solar-panel failure, overload and imbalance) inside the authenticated user scope (US10: F-47, F-48, F-49, F-50, NF-09; US16: F-47; US18: F-47).',
    description:
      'Fuse openings of the same fuse set whose opening instants are less than the grouping window apart (FAULT_GROUPING_WINDOW_MINUTES, 5 by default) form one fault, classified as single-, two- or three-phase by distinct canonical phases. A fault is open while any phase has not reported a close. Loss of voltage (NO_VOLTAGE, one entry per fuse) and SMAC phase alarms (PHASE_LOSS, PHASE_OUT_OF_RANGE, one entry per transformer channel) are never grouped: each is active from the first SET after its last CLEAR until the next CLEAR. Only open entries are listed, ordered by severity (F-57): the faults with the most affected clients first and, with equal client counts, the oldest first; a null client count (unknown, and every source alarm for now) counts as 0 for this order only. Device alerts are also one entry per source, never grouped: FREE_FALL (a Falcon fuse with a 13xx01 SET or MSG event, until a later reading reports is_free_fall_alarm false), SOLAR_PANEL_FAILURE (a Falcon fuse whose last is_solar_panel_alarm is true) and OVERLOAD_UNBALANCE (one per SMAC transformer whose last load_percent, vuf_percent or cuf_percent is above its threshold: SMAC_OVERLOAD_PERCENT 90 and SMAC_VOLTAGE_UNBALANCE_PERCENT 2 by default; SMAC_CURRENT_UNBALANCE_PERCENT has no approved value yet (TD-10), so current imbalance is not reported until it is set). A missing (null) reading never raises or clears a device alert. The fuse-opening, voltage and phase alerts come from the alarms table only: a fuse or transformer whose telemetry shows a problem but whose alarms do not is not listed. The scope is node-level.',
  })
  @ApiOkResponse({
    type: ActiveFaultsResponseDto,
    description:
      'Open faults and alarms in scope; an empty list when there are none.',
  })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'Bearer token is missing, invalid, expired, or logged out.',
  })
  async findActive(@Req() request: Request) {
    const scope = await this.scopeService.resolve(userIdOf(request));

    return this.activeFaultsService.activeFaults(scope);
  }

  @Get('resolved')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Resolved fuse-opening faults, loss-of-voltage alarms and SMAC phase alarms inside the authenticated user scope (US16: F-60, F-61, F-62, F-63).',
    description:
      'Lists only the faults and alarms resolved within the selected window (last hour or last day), ordered by resolution time newest first (F-62), with total duration from activation to resolution (F-63).',
  })
  @ApiQuery({
    name: 'window',
    required: false,
    enum: [...RESOLVED_WINDOWS],
    description:
      'Resolution time window: 1h (last hour) or 24h / 1d (last day). Defaults to 24h.',
  })
  @ApiOkResponse({
    type: ActiveFaultsResponseDto,
    description:
      'Resolved faults and alarms in scope within the window, newest resolution first (F-62).',
  })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'window is not one of 1h, 24h or 1d.',
  })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'Bearer token is missing, invalid, expired, or logged out.',
  })
  async findResolved(
    @Req() request: Request,
    @Query('window') window?: string,
  ) {
    const parsedWindow = parseResolvedWindow(window);
    const scope = await this.scopeService.resolve(userIdOf(request));

    return this.activeFaultsService.resolvedFaults(scope, parsedWindow);
  }

  @Get('indicators')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Historical fault indicators and rankings: counts by substation and circuit, node and longest-fault rankings, and average/maximum duration with minimum-duration filter (US21 · SCRUM-285, SCRUM-286: F-68, F-69, F-70, NF-10).',
    description:
      'Aggregates grouped fuse-opening faults within the selected date range and hierarchical scope (always intersected with the authenticated user scope, F-10 / F-65). When min_duration_filter=true, only faults strictly longer than the threshold (min_duration_minutes or FAULT_MIN_DURATION_MINUTES, default 1 minute) are included in counts, rankings, and average/maximum duration, and minimum_duration_filter.active is returned as true.',
  })
  @ApiQuery({
    name: 'from',
    required: false,
    type: String,
    description:
      'Inclusive start date-time (ISO 8601). Defaults to 30 days before "to".',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    type: String,
    description:
      'Inclusive end date-time (ISO 8601). Defaults to the current server time.',
  })
  @ApiQuery({
    name: 'zone_id',
    required: false,
    type: Number,
    description: 'Optional zone id scope filter (intersected with user scope).',
  })
  @ApiQuery({
    name: 'substation_id',
    required: false,
    type: Number,
    description:
      'Optional substation id scope filter (intersected with user scope).',
  })
  @ApiQuery({
    name: 'circuit_id',
    required: false,
    type: Number,
    description:
      'Optional circuit id scope filter (intersected with user scope).',
  })
  @ApiQuery({
    name: 'node_id',
    required: false,
    type: String,
    description:
      'Optional node name scope filter (intersected with user scope).',
  })
  @ApiQuery({
    name: 'min_duration_filter',
    required: false,
    type: Boolean,
    description:
      'Enable minimum-duration filter (F-69). Defaults to false.',
  })
  @ApiQuery({
    name: 'min_duration_minutes',
    required: false,
    type: Number,
    description:
      'Optional positive threshold in minutes when min_duration_filter is active; defaults to FAULT_MIN_DURATION_MINUTES (1 minute).',
  })
  @ApiOkResponse({
    type: FaultIndicatorsResponseDto,
    description:
      'Fault counts per substation and circuit, node/longest-fault rankings, and duration summary.',
  })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description:
      'Invalid date range, scope filter id, or minimum-duration query parameter.',
  })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'Bearer token is missing, invalid, expired, or logged out.',
  })
  async getIndicators(
    @Req() request: Request,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('zone_id') zoneId?: string,
    @Query('substation_id') substationId?: string,
    @Query('circuit_id') circuitId?: string,
    @Query('node_id') nodeId?: string,
    @Query('min_duration_filter') minDurationFilter?: string,
    @Query('min_duration_minutes') minDurationMinutes?: string,
  ): Promise<FaultIndicatorsResponseDto> {
    const parsedQuery = parseIndicatorsQuery({
      from,
      to,
      zoneId,
      substationId,
      circuitId,
      nodeId,
      minDurationFilter,
      minDurationMinutes,
    });
    const scope = await this.scopeService.resolve(userIdOf(request));

    return (
      this.faultIndicatorsService as FaultIndicatorsService
    ).getIndicators(scope, parsedQuery);
  }
}

function parseResolvedWindow(window: string | undefined): ResolvedWindow {
  if (window === undefined || window === '') {
    return '24h';
  }
  if ((RESOLVED_WINDOWS as readonly string[]).includes(window)) {
    return window as ResolvedWindow;
  }
  throw new BadRequestException(
    `window must be one of: ${RESOLVED_WINDOWS.join(', ')}`,
  );
}

function parseIndicatorsQuery(raw: {
  from?: string;
  to?: string;
  zoneId?: string;
  substationId?: string;
  circuitId?: string;
  nodeId?: string;
  minDurationFilter?: string;
  minDurationMinutes?: string;
}): FaultIndicatorsQuery {
  const now = new Date();
  const to =
    raw.to === undefined || raw.to === '' ? now : parseIsoDate('to', raw.to);
  const from =
    raw.from === undefined || raw.from === ''
      ? new Date(to.getTime() - DEFAULT_INDICATORS_RANGE_DAYS * DAY_MS)
      : parseIsoDate('from', raw.from);

  if (from.getTime() > to.getTime()) {
    throw new BadRequestException('from must be earlier than or equal to to');
  }

  return {
    from,
    to,
    zoneId: parseOptionalPositiveInt('zone_id', raw.zoneId),
    substationId: parseOptionalPositiveInt('substation_id', raw.substationId),
    circuitId: parseOptionalPositiveInt('circuit_id', raw.circuitId),
    nodeId:
      raw.nodeId === undefined || raw.nodeId.trim() === ''
        ? undefined
        : raw.nodeId.trim(),
    minDurationFilter: parseOptionalBoolean(
      'min_duration_filter',
      raw.minDurationFilter,
    ),
    minDurationMinutes: parseOptionalPositiveNumber(
      'min_duration_minutes',
      raw.minDurationMinutes,
    ),
  };
}

function parseIsoDate(name: string, value: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`${name} must be a valid ISO 8601 date-time`);
  }
  return parsed;
}

function parseOptionalPositiveInt(
  name: string,
  value: string | undefined,
): number | undefined {
  if (value === undefined || value === '') return undefined;
  if (!/^\d+$/.test(value)) {
    throw new BadRequestException(`${name} must be a positive integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new BadRequestException(`${name} must be a positive integer`);
  }
  return parsed;
}

function parseOptionalPositiveNumber(
  name: string,
  value: string | undefined,
): number | undefined {
  if (value === undefined || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new BadRequestException(`${name} must be a positive number`);
  }
  return parsed;
}

function parseOptionalBoolean(
  name: string,
  value: string | undefined,
): boolean {
  if (value === undefined || value === '') return false;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  throw new BadRequestException(`${name} must be true or false`);
}

/** User id from the verified token, or 401 (same rule as NodesController; the guard checked the signature). */
function userIdOf(request: Request): number {
  const userId: unknown = (request as Request & { user?: { sub?: unknown } })
    .user?.sub;

  if (
    typeof userId !== 'number' ||
    !Number.isSafeInteger(userId) ||
    userId <= 0
  ) {
    throw new UnauthorizedException('Invalid user identity');
  }

  return userId;
}
