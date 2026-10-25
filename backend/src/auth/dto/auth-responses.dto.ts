import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginResponseDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description:
      'JWT access token. Send it as a Bearer token on protected routes.',
  })
  access_token: string;
}

export class AccessTokenPayloadDto {
  @ApiProperty({ example: 42, description: 'Authenticated user ID.' })
  sub: number;

  @ApiProperty({ example: 'admin@colbits.com' })
  username: string;

  @ApiProperty({
    example: 'admin user',
    description: 'Role assigned to the authenticated account.',
  })
  role: string;

  @ApiPropertyOptional({
    example: 1_798_000_000,
    description: 'Issued-at time (Unix timestamp).',
  })
  iat?: number;

  @ApiPropertyOptional({
    example: 1_798_000_900,
    description: 'Expiration time (Unix timestamp).',
  })
  exp?: number;
}

export class ProfileResponseDto {
  @ApiProperty({
    example: 'Access granted! You are inside the protected route.',
  })
  message: string;

  @ApiProperty({ type: () => AccessTokenPayloadDto })
  user: AccessTokenPayloadDto;
}

export class LogoutResponseDto {
  @ApiProperty({ example: 'Successfully logged out' })
  message: string;
}
