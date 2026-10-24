import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin@colbits.com', description: 'Account username.' })
  username: string;

  @ApiProperty({
    example: 'adminpassword',
    description: 'Account password.',
    format: 'password',
  })
  password: string;
}
