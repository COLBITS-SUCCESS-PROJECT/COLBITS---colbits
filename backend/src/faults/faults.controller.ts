import {
  Controller,
  Get,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { ScopeService } from '../scope/scope.service';
import { ActiveFaultsService } from './active-faults.service';
import { ActiveFaultsResponseDto } from './dto/faults.dto';

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
      'Active fuse-opening faults, loss-of-voltage alarms and SMAC phase alarms inside the authenticated user scope (US10: F-47, F-48, F-49, F-50, NF-09; US16: F-47).',
    description:
      'Fuse openings of the same fuse set whose opening instants are less than the grouping window apart (FAULT_GROUPING_WINDOW_MINUTES, 5 by default) form one fault, classified as single-, two- or three-phase by distinct canonical phases. A fault is open while any phase has not reported a close. Loss of voltage (NO_VOLTAGE, one entry per fuse) and SMAC phase alarms (PHASE_LOSS, PHASE_OUT_OF_RANGE, one entry per transformer channel) are never grouped: each is active from the first SET after its last CLEAR until the next CLEAR. Only open entries are listed, oldest first. Everything comes from the alarms table: a fuse or transformer whose telemetry shows a problem but whose alarms do not is not listed.',
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
