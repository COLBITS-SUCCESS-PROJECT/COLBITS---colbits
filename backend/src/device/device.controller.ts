import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { ScopeService } from '../scope/scope.service';
import { InactiveDevicesResponseDto } from './dto/inactive-devices.dto';
import { InactivityResultDto } from './dto/inactivity-result.dto';
import { DeviceService } from './device.service';
import {
  DEFAULT_WINDOW_HOURS,
  InactiveDevicesService,
  MAX_WINDOW_HOURS,
} from './inactive-devices.service';

@Controller('device')
@UseGuards(AuthGuard)
@ApiTags('device')
@ApiBearerAuth()
export class DeviceController {
  constructor(
    private readonly deviceService: DeviceService,
    private readonly scopeService: ScopeService,
    private readonly inactiveDevicesService: InactiveDevicesService,
  ) {}

  @Get('inactive')
  @ApiOperation({
    summary:
      'Inactive devices of the user scope with their inactivity alarms (US17: F-38, F-39, F-40, F-46; NF-07, NF-08).',
    description:
      'A device is inactive when its next record comes more than its threshold after the previous one (FALCON_INACTIVITY_HOURS 9, SMAC_INACTIVITY_HOURS 3), or when it has not reported for longer than that. Each such silence is an inactivity alarm: it opens at "previous record + threshold" (F-38) and resolves by itself at the next stored record (F-39); end is null while it is open. Lists the devices of the user scope inactive at any moment of the last `hours` (or that never reported): inactive now first, oldest last record first (F-40), then the ones that reported again, most recently resolved first. low_energy flags an energy level below FALCON_LOW_ENERGY_PERCENT / SMAC_LOW_ENERGY_PERCENT (30 % by default, NF-08), which can explain the silence.',
  })
  @ApiQuery({
    name: 'hours',
    required: false,
    type: Number,
    example: DEFAULT_WINDOW_HOURS,
    description: `Window in hours up to now (default ${DEFAULT_WINDOW_HOURS}, at most ${MAX_WINDOW_HOURS}).`,
  })
  @ApiOkResponse({ type: InactiveDevicesResponseDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: `hours must be a number greater than 0 and at most ${MAX_WINDOW_HOURS}.`,
  })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'Bearer token is missing, invalid, or expired.',
  })
  async getInactiveDevices(
    @Query('hours') hours: string | undefined,
    @Req() request: Request,
  ) {
    const windowHours = parseWindowHours(hours);
    const scope = await this.scopeService.resolve(userIdOf(request));

    return this.inactiveDevicesService.inactiveDevices(scope, windowHours);
  }

  @Get('inactivity-status')
  @ApiOperation({
    summary:
      'Evaluate device inactivity from its latest stored database timestamp (US5: F-36, F-37, F-46, NF-07).',
    description:
      'Reads the latest recorded_at timestamp from the database (last_falcon_values for Falcon; newest of last_smac_vc_values, last_smac_pw_values, and last_smac_pf_values for SMAC) and compares elapsed hours against the configured device threshold (FALCON_INACTIVITY_HOURS, 9 by default; SMAC_INACTIVITY_HOURS, 3 by default). A device with no telemetry records is treated as inactive. A device that does not exist and one outside the user scope give the same 404.',
  })
  @ApiQuery({
    name: 'deviceId',
    required: true,
    type: String,
    example: '0501000001',
    description:
      'Hardware identifier of a device that exists in the database and is visible in the authenticated user scope. As an example, use 1301000001 for a Falcon device or 0501000001 for a SMAC device.',
  })
  @ApiQuery({
    name: 'type',
    enum: ['Falcon', 'SMAC'],
    required: true,
    description: 'Device type; it selects the table and inactivity threshold.',
  })
  @ApiOkResponse({
    type: InactivityResultDto,
    description: 'Inactivity evaluation of the device.',
  })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'deviceId is required and type must be Falcon or SMAC.',
  })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'Bearer token is missing, invalid, expired, or logged out.',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Device was not found in the authenticated user scope.',
  })
  async getInactivityStatus(
    @Query('deviceId') deviceId: string,
    @Query('type') type: string,
    @Req() request: Request,
  ) {
    if (typeof deviceId !== 'string' || deviceId.trim().length === 0) {
      throw new BadRequestException('deviceId is required');
    }

    if (type !== 'Falcon' && type !== 'SMAC') {
      throw new BadRequestException('type must be Falcon or SMAC');
    }

    const userId: unknown = (request as Request & { user?: { sub?: unknown } })
      .user?.sub;

    if (
      typeof userId !== 'number' ||
      !Number.isSafeInteger(userId) ||
      userId <= 0
    ) {
      throw new UnauthorizedException('Invalid user identity');
    }

    const scope = await this.scopeService.resolve(userId);

    return this.deviceService.checkInactivity(deviceId.trim(), type, scope);
  }
}

/** Window of GET /device/inactive: the default when absent, otherwise a number in (0, MAX_WINDOW_HOURS]. */
function parseWindowHours(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_WINDOW_HOURS;
  const hours = Number(raw);
  if (!Number.isFinite(hours) || hours <= 0 || hours > MAX_WINDOW_HOURS) {
    throw new BadRequestException(
      `hours must be a number greater than 0 and at most ${MAX_WINDOW_HOURS}`,
    );
  }
  return hours;
}

/** User id from the verified token, or 401 (the guard already checked the signature). */
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
