import { IsString, IsOptional, IsArray } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Jane Doe' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'newpassword' })
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional({ example: 'faculty' })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({ example: 'Mathematics' })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional({ example: ['CS101'], type: [String] })
  @IsOptional()
  @IsArray()
  enrolledCourses?: string[];

  @ApiPropertyOptional({ example: 'oldpassword' })
  @IsOptional()
  @IsString()
  currentPassword?: string;
}
