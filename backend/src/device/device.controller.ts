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