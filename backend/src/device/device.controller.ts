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
import { InactivityResultDto } from './dto/inactivity-result.dto';
import { DeviceService } from './device.service';

@Controller('device')
@UseGuards(AuthGuard)
@ApiTags('device')
@ApiBearerAuth()
export class DeviceController {
  constructor(
    private readonly deviceService: DeviceService,
    private readonly scopeService: ScopeService,
  ) {}

  @Get('inactivity-status')
  @ApiOperation({
    summary:
      'Evaluate device inactivity using the supplied hours since its last record.',
  })
  @ApiQuery({
    name: 'deviceId',
    required: true,
    type: String,
    example: '0501000001',
    description:
      'Hardware identifier of a device that exists in the database and is visible in the authenticated user scope. As a example use 1301000001 for a Falcon device or 0501000001 for a SMAC device.',
  })
  @ApiQuery({ name: 'type', enum: ['Falcon', 'SMAC'], required: true })
  @ApiQuery({
    name: 'lastTimestamp',
    required: true,
    type: Number,
    example: 4,
    description:
      'Hours elapsed since the last record. The API derives lastRecordTimestamp from this value; inactivity is true only when the value is greater than the device threshold.',
  })
  @ApiOkResponse({ type: InactivityResultDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description:
      'deviceId is required, type must be Falcon or SMAC, and lastTimestamp must be a non-negative number of hours.',
  })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'Bearer token is missing, invalid, or expired.',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Device was not found in the authenticated user scope.',
  })
  async getInactivityStatus(
    @Query('deviceId') deviceId: string,
    @Query('type') type: string,
    @Query('lastTimestamp') lastTimestamp: string,
    @Req() request: Request,
  ) {
    if (typeof deviceId !== 'string' || deviceId.trim().length === 0) {
      throw new BadRequestException('deviceId is required');
    }

    if (type !== 'Falcon' && type !== 'SMAC') {
      throw new BadRequestException('type must be Falcon or SMAC');
    }

    if (
      typeof lastTimestamp !== 'string' ||
      lastTimestamp.trim().length === 0
    ) {
      throw new BadRequestException(
        'lastTimestamp must be a non-negative number of hours',
      );
    }
    const hoursSinceLastRecord = Number(lastTimestamp);
    if (!Number.isFinite(hoursSinceLastRecord) || hoursSinceLastRecord < 0) {
      throw new BadRequestException(
        'lastTimestamp must be a non-negative number of hours',
      );
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

    return this.deviceService.checkInactivity(
      deviceId,
      type,
      hoursSinceLastRecord,
      scope,
    );
  }
}
