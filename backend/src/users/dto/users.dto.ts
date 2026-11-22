import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const USER_ROLES = [
  'Colbits administrator',
  'consultation user',
] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const SCOPE_ENTITY_TYPES = [
  'zone',
  'substation',
  'circuit',
  'node',
  'device',
] as const;
export type ScopeEntityType = (typeof SCOPE_ENTITY_TYPES)[number];

export class ScopeAssignmentDto {
  @ApiProperty({
    enum: [...SCOPE_ENTITY_TYPES],
    example: 'circuit',
    description:
      'Hierarchy level of the scope assignment: zone, substation, circuit, node or device (F-08).',
  })
  entity_type: ScopeEntityType;

  @ApiProperty({
    example: '1',
    description:
      'Identifier of the assigned zone, substation, circuit, node or device (F-08, F-09).',
  })
  entity_id: string;
}

export class CreateUserDto {
  @ApiProperty({
    example: 'operator@client.co',
    description: 'Unique username for the account (F-07).',
  })
  username: string;

  @ApiProperty({
    example: 'StrongPassword123!',
    description: 'Plaintext password to be hashed with bcrypt (NF-04).',
  })
  password: string;

  // No role (F-03): POST /users always creates a consultation user. The service still reads a
  // submitted `role` from the raw body and rejects any value other than 'consultation user'.

  @ApiPropertyOptional({
    type: () => [ScopeAssignmentDto],
    description:
      'Initial data scope assignments for a consultation user (F-07, F-08, F-09).',
  })
  scopes?: ScopeAssignmentDto[];
}

export class UpdateUserDto {
  @ApiPropertyOptional({
    example: 'operator2@client.co',
    description: 'Updated unique username (F-05).',
  })
  username?: string;

  @ApiPropertyOptional({
    example: 'NewStrongPassword123!',
    description: 'Updated password to be hashed with bcrypt (F-05, NF-04).',
  })
  password?: string;

  // No role (F-03): a user's role cannot be changed, and a body with `role` is rejected with 400.

  @ApiPropertyOptional({
    example: true,
    description: 'Whether the user account is active (F-05).',
  })
  is_active?: boolean;

  @ApiPropertyOptional({
    type: () => [ScopeAssignmentDto],
    description:
      'Replaces the consultation user scope assignments when provided (F-08, F-09).',
  })
  scopes?: ScopeAssignmentDto[];
}

export class ReplaceUserScopesDto {
  @ApiProperty({
    type: () => [ScopeAssignmentDto],
    description:
      'Full list of scope assignments for the user (zone, substation, circuit, node or device) (F-08, F-09).',
  })
  scopes: ScopeAssignmentDto[];
}

export class UserResponseDto {
  @ApiProperty({ example: 2 })
  id: number;

  @ApiProperty({ example: 'client@colbits.com' })
  username: string;

  @ApiProperty({ enum: [...USER_ROLES], example: 'consultation user' })
  role: UserRole;

  @ApiProperty({ example: true })
  is_active: boolean;

  @ApiProperty({ type: () => [ScopeAssignmentDto] })
  scopes: ScopeAssignmentDto[];
}
