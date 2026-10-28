import { ApiProperty } from '@nestjs/swagger';

export class InactivityResultDto {
  @ApiProperty({
    example: '0501000001',
    description: 'Device hardware identifier.',
  })
  deviceId: string;

  @ApiProperty({ enum: ['Falcon', 'SMAC'], example: 'SMAC' })
  deviceType: 'Falcon' | 'SMAC';

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-10-22T10:30:00.000Z',
    description:
      'ISO timestamp derived from the supplied number of silent hours.',
  })
  lastRecordTimestamp: Date;

  @ApiProperty({
    example: 3,
    description: 'Configured inactivity threshold in hours.',
  })
  thresholdHours: number;

  @ApiProperty({
    example: 4,
    description:
      'Hours since the latest record, as supplied in the lastTimestamp query parameter.',
  })
  hoursSilent: number;

  @ApiProperty({
    example: true,
    description: 'True when the device exceeds the inactivity threshold.',
  })
  isInactive: boolean;
}
