import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface InactivityResult {
  deviceId: string;
  deviceType: 'Falcon' | 'SMAC';
  lastRecordTimestamp: Date;
  thresholdHours: number;
  hoursSilent: number;
  isInactive: boolean;
}

@Injectable()
export class DeviceService {
  constructor(private configService: ConfigService) {}

  checkInactivity(
    deviceId: string,
    deviceType: 'Falcon' | 'SMAC',
    lastRecordTimestamp: Date | string,
  ): InactivityResult {
    // NF-07: Read limits from .env (fallback to defaults if undefined)
    const falconHours = Number(this.configService.get('FALCON_INACTIVITY_HOURS')) || 9;
    const smacHours = Number(this.configService.get('SMAC_INACTIVITY_HOURS')) || 3;
    const thresholdHours = deviceType === 'Falcon' ? falconHours : smacHours;

    // F-46: Base time delta strictly on the stored event timestamp
    const recordTime = new Date(lastRecordTimestamp).getTime();
    const currentTime = Date.now();
    const diffHours = (currentTime - recordTime) / (1000 * 60 * 60);

    return {
      deviceId,
      deviceType,
      lastRecordTimestamp: new Date(lastRecordTimestamp),
      thresholdHours,
      hoursSilent: parseFloat(diffHours.toFixed(2)),
      isInactive: diffHours > thresholdHours,
    };
  }
}