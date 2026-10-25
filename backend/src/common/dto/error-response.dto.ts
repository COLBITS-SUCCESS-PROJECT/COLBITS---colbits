import { ApiProperty } from '@nestjs/swagger';

export class ErrorResponseDto {
  @ApiProperty({ example: 401, description: 'HTTP status code.' })
  statusCode: number;

  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: 'Invalid credentials',
    description: 'Error details returned by the API.',
  })
  message: string | string[];

  @ApiProperty({ example: 'Unauthorized' })
  error: string;
}
