import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { ScopeService } from '../scope/scope.service';
import { DeviceService } from './device.service';

@Controller('device')
@UseGuards(AuthGuard)
export class DeviceController {
  constructor(
    private readonly deviceService: DeviceService,
    private readonly scopeService: ScopeService,
  ) {}

  @Get(':deviceId/inactivity-status')
  async getInactivityStatus(
    @Param('deviceId') deviceId: string,
    @Query('type') type: string,
    @Req() request: Request,
  ) {
    if (!deviceId || (type !== 'Falcon' && type !== 'SMAC')) {
      throw new BadRequestException('type must be Falcon or SMAC');
    }

    const userId: unknown = (
      request as Request & { user?: { sub?: unknown } }
    ).user?.sub;

    if (
      typeof userId !== 'number' ||
      !Number.isSafeInteger(userId) ||
      userId <= 0
    ) {
      throw new UnauthorizedException('Invalid user identity');
    }

    const scope = await this.scopeService.resolve(userId);

    return this.deviceService.checkInactivity(deviceId, type, scope);
  }
}