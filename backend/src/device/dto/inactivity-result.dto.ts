import { ApiProperty } from '@nestjs/swagger';

export class InactivityResultDto {
  @ApiProperty({ example: '1301000001' })
  deviceId!: string;

  @ApiProperty({ enum: ['Falcon', 'SMAC'], example: 'Falcon' })
  deviceType!: 'Falcon' | 'SMAC';

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    example: '2026-10-21T12:00:00.000Z',
  })
  lastRecordTimestamp!: Date | null;

  @ApiProperty({ example: 9 })
  thresholdHours!: number;

  @ApiProperty({ type: Number, nullable: true, example: 4.25 })
  hoursSilent!: number | null;

  @ApiProperty({ example: false })
  isInactive!: boolean;
}