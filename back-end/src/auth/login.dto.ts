import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'SU001', description: 'Institutional ID' })
  @IsString()
  id: string;

  @ApiProperty({ example: 'superuser123', description: 'User password' })
  @IsString()
  password: string;
}
