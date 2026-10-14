import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { DeviceService } from './device.service';

@Controller('device')
export class DeviceController {
  constructor(private readonly deviceService: DeviceService) {}

  @Get('inactivity-status')
  getInactivityStatus(
    @Query('deviceId') deviceId: string,
    @Query('type') type: string, // Changed to general string to allow the safety check
    @Query('lastTimestamp') lastTimestamp: string,
  ) {
    if (!deviceId || !type || !lastTimestamp) {
      throw new BadRequestException('deviceId, type, and lastTimestamp are required');
    }
    if (type !== 'Falcon' && type !== 'SMAC') {
      throw new BadRequestException('type must be Falcon or SMAC');
    }

    // Cast the type back to the strict literal for the service
    return this.deviceService.checkInactivity(deviceId, type as 'Falcon' | 'SMAC', lastTimestamp);
  }
}