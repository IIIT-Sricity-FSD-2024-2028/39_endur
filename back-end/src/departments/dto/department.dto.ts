import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateDepartmentDto {
  @ApiProperty({ example: 'CS', description: 'Unique department ID' })
  @IsString()
  id: string;

  @ApiProperty({ example: 'Computer Science' })
  @IsString()
  name: string;
}
