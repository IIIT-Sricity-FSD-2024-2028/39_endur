import { IsString, IsOptional, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: 'S001', description: 'Unique institutional ID' })
  @IsString()
  id: string;

  @ApiProperty({ example: 'securepass', description: 'User password' })
  @IsString()
  password: string;

  @ApiProperty({ example: 'John Doe', description: 'Full name' })
  @IsString()
  name: string;

  @ApiProperty({
    example: 'student',
    description: 'User role',
    enum: ['student', 'faculty', 'hod', 'dean', 'admin'],
  })
  @IsString()
  role: string;

  @ApiPropertyOptional({ example: 'student@university.edu' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ example: 'Computer Science' })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional({ example: ['CS101', 'CS102'], type: [String] })
  @IsOptional()
  @IsArray()
  enrolledCourses?: string[];
}
