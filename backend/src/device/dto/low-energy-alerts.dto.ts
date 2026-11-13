import { ApiProperty } from '@nestjs/swagger';
import { LocationRefDto, SubstationRefDto } from './inactive-devices.dto';

export class LowEnergyAlertDto {
  @ApiProperty({ enum: ['LOW_ENERGY'], example: 'LOW_ENERGY' })
  alert_type: 'LOW_ENERGY';

  @ApiProperty({ enum: ['FALCON', 'SMAC'], example: 'FALCON' })
  kind: 'FALCON' | 'SMAC';

  @ApiProperty({
    example: '1301000004',
    description: 'Device hardware id (hw_id).',
  })
  hw_id: string;

  @ApiProperty({
    example: '0000100002-A-R',
    description:
      'Stable id of what the device monitors: fuse or transformer custom_id.',
  })
  source_id: string;

  @ApiProperty({ example: '0000100002', description: 'Node identifier.' })
  node: string;

  @ApiProperty({ type: () => LocationRefDto })
  zone: LocationRefDto;

  @ApiProperty({ type: () => SubstationRefDto })
  substation: SubstationRefDto;

  @ApiProperty({ type: () => LocationRefDto })
  circuit: LocationRefDto;

  @ApiProperty({
    example: 12,
    description:
      'Latest stored level in %: supercaps_per (Falcon, F-44) or battery_per (SMAC, F-45).',
  })
  energy_percent: number;

  @ApiProperty({
    example: 30,
    description:
      'Threshold it is below (NF-08: FALCON_LOW_ENERGY_PERCENT / SMAC_LOW_ENERGY_PERCENT).',
  })
  threshold_percent: number;

  @ApiProperty({
    format: 'date-time',
    example: '2026-11-12T10:00:00.000Z',
    description: 'Stored timestamp of that latest reading (F-46).',
  })
  recorded_at: string;

  @ApiProperty({
    format: 'date-time',
    example: '2026-11-12T06:15:00.000Z',
    description:
      'First reading of the current low streak: the alert has been active since then.',
  })
  since: string;
}

export class LowEnergyAlertsResponseDto {
  @ApiProperty({ example: 30 }) falcon_low_energy_percent: number;
  @ApiProperty({ example: 30 }) smac_low_energy_percent: number;

  @ApiProperty({ example: 1, description: 'Number of active alerts.' })
  count: number;

  @ApiProperty({
    type: () => [LowEnergyAlertDto],
    description:
      'One active alert per device of the user scope whose latest reading is below its threshold, lowest level first.',
  })
  alerts: LowEnergyAlertDto[];
}
