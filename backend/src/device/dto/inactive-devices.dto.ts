import { ApiProperty } from '@nestjs/swagger';

export class InactivityPeriodDto {
  @ApiProperty({
    format: 'date-time',
    example: '2026-11-11T09:00:00.000Z',
    description:
      'Moment the device was declared inactive: its previous record plus the threshold (F-38: the inactivity alarm opens).',
  })
  start: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    example: null,
    description:
      'Timestamp of the record that ended the silence (F-39: the alarm resolves by itself). Null while the device is still silent.',
  })
  end: string | null;
}

export class LocationRefDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'North Ring 01' })
  name: string;
}

export class SubstationRefDto extends LocationRefDto {
  @ApiProperty({ example: 'SUB-N-001' })
  code: string;
}

export class InactiveDeviceDto {
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

  @ApiProperty({ enum: ['FALCON', 'SMAC'], example: 'FALCON' })
  kind: 'FALCON' | 'SMAC';

  @ApiProperty({ example: '0000100002', description: 'Node identifier.' })
  node: string;

  @ApiProperty({ type: () => LocationRefDto })
  zone: LocationRefDto;

  @ApiProperty({ type: () => SubstationRefDto })
  substation: SubstationRefDto;

  @ApiProperty({ type: () => LocationRefDto })
  circuit: LocationRefDto;

  @ApiProperty({
    example: 9,
    description:
      'Hours without records after which this device is inactive (FALCON_INACTIVITY_HOURS / SMAC_INACTIVITY_HOURS).',
  })
  threshold_hours: number;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    example: '2026-11-11T00:00:00.000Z',
    description:
      'Stored timestamp of its latest record (F-46); null if it never reported.',
  })
  last_record_at: string | null;

  @ApiProperty({
    example: true,
    description:
      'Silent for more than its threshold now, or never reported (F-36, F-37). Equals having an open period, except for a device that never reported, which has none.',
  })
  inactive_now: boolean;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 12,
    description:
      'Latest energy level in %: supercapacitors (Falcon) or battery (SMAC). Null without a reading.',
  })
  energy_percent: number | null;

  @ApiProperty({
    type: Boolean,
    nullable: true,
    example: true,
    description:
      'energy_percent below the low-energy threshold (NF-08: FALCON_LOW_ENERGY_PERCENT / SMAC_LOW_ENERGY_PERCENT, 30 by default). It can explain why the device went silent. Null without a reading.',
  })
  low_energy: boolean | null;

  @ApiProperty({
    type: () => [InactivityPeriodDto],
    description:
      'Its inactivity alarms that touch the window, oldest first. Full periods, not cut to the window.',
  })
  periods: InactivityPeriodDto[];
}

export class InactiveDevicesThresholdsDto {
  @ApiProperty({ example: 9 }) falcon_inactivity_hours: number;
  @ApiProperty({ example: 3 }) smac_inactivity_hours: number;
  @ApiProperty({ example: 30 }) falcon_low_energy_percent: number;
  @ApiProperty({ example: 30 }) smac_low_energy_percent: number;
}

export class InactiveDevicesResponseDto {
  @ApiProperty({
    format: 'date-time',
    description: 'Start of the window (now − hours).',
  })
  from: string;

  @ApiProperty({
    format: 'date-time',
    description: 'End of the window: the moment of the request.',
  })
  to: string;

  @ApiProperty({ type: () => InactiveDevicesThresholdsDto })
  thresholds: InactiveDevicesThresholdsDto;

  @ApiProperty({ example: 2, description: 'Number of devices returned.' })
  count: number;

  @ApiProperty({
    type: () => [InactiveDeviceDto],
    description:
      'Devices in the user scope that were inactive at some moment of the window (or never reported). F-40 order: inactive now first, oldest last record first; then the ones that reported again, most recently resolved first.',
  })
  devices: InactiveDeviceDto[];
}
