import { IsString, IsOptional, IsArray } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Dr. Jane Smith', description: 'Updated full name of the user' })
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

  @ApiPropertyOptional({ example: 'faculty@university.edu' })
  @IsOptional()
  @IsString()
  email?: string;

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
