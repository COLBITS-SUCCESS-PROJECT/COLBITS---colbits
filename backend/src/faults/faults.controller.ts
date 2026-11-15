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
import {
  ActiveFaultsResponseDto,
  RESOLVED_WINDOWS,
  type ResolvedWindow,
} from './dto/faults.dto';

@Controller('faults')
@ApiTags('faults')
export class FaultsController {
  constructor(
    private readonly activeFaultsService: ActiveFaultsService,
    private readonly scopeService: ScopeService,
  ) {}

  @Get()
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Active fuse-opening faults, loss-of-voltage alarms, SMAC phase alarms and device alerts (free fall, solar-panel failure, overload and imbalance) inside the authenticated user scope (US10: F-47, F-48, F-49, F-50, NF-09; US16: F-47; US18: F-47).',
    description:
      'Fuse openings of the same fuse set whose opening instants are less than the grouping window apart (FAULT_GROUPING_WINDOW_MINUTES, 5 by default) form one fault, classified as single-, two- or three-phase by distinct canonical phases. A fault is open while any phase has not reported a close. Loss of voltage (NO_VOLTAGE, one entry per fuse) and SMAC phase alarms (PHASE_LOSS, PHASE_OUT_OF_RANGE, one entry per transformer channel) are never grouped: each is active from the first SET after its last CLEAR until the next CLEAR. Only open entries are listed, ordered by severity (F-57): the faults with the most affected clients first and, with equal client counts, the oldest first; a null client count (unknown, and every source alarm for now) counts as 0 for this order only. Device alerts are also one entry per source, never grouped: FREE_FALL (a Falcon fuse with a 13xx01 SET or MSG event, until a later reading reports is_free_fall_alarm false), SOLAR_PANEL_FAILURE (a Falcon fuse whose last is_solar_panel_alarm is true) and OVERLOAD_UNBALANCE (one per SMAC transformer whose last load_percent, vuf_percent or cuf_percent is above its threshold: SMAC_OVERLOAD_PERCENT 90 and SMAC_VOLTAGE_UNBALANCE_PERCENT 2 by default; SMAC_CURRENT_UNBALANCE_PERCENT has no approved value yet (TD-10), so current imbalance is not reported until it is set). A missing (null) reading never raises or clears a device alert. The fuse-opening, voltage and phase alerts come from the alarms table only: a fuse or transformer whose telemetry shows a problem but whose alarms do not is not listed. The scope is node-level. Device alerts are derived from the readings on every request and nothing is stored: that persistence is still a team decision. Their resolved episodes are neither stored nor listed (GET /faults/resolved does not return them), so a free fall, solar-panel failure or overload that has ended simply leaves this list.',
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
      'Lists only the faults and alarms resolved within the selected window (last hour or last day), ordered by resolution time newest first (F-62), with total duration from activation to resolution (F-63). Device alerts (FREE_FALL, SOLAR_PANEL_FAILURE, OVERLOAD_UNBALANCE) are not listed: they are derived on demand and their resolved episodes are not kept yet (pending team decision).',
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
