import { IsString, IsOptional, IsNumber, IsArray, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCourseDto {
  @ApiProperty({ example: 'CS101' })
  @IsString()
  id: string;

  @ApiProperty({ example: 'Data Structures' })
  @IsString()
  name: string;

  @ApiProperty({ example: ['F101', 'F102'], type: [String], description: 'Array of Faculty user IDs' })
  @IsArray()
  facultyIds: string[];

  @ApiPropertyOptional({ example: ['Dr. Alan Turing', 'Dr. Grace Hopper'], type: [String] })
  @IsOptional()
  @IsArray()
  facultyNames?: string[];

  @ApiPropertyOptional({ example: 'Computer Science' })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional({ example: 'standard' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  enrolled?: number;

  @ApiPropertyOptional({ example: 'img_read.jpg' })
  @IsOptional()
  @IsString()
  thumbnail?: string;
}

export class UpdateCourseDto {
  @ApiPropertyOptional({ example: 'Data Structures Advanced' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  facultyIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  facultyNames?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  thumbnail?: string;
}

export class EnrollStudentsDto {
  @ApiProperty({ example: ['S001', 'S002'], type: [String] })
  @IsArray()
  studentIds: string[];

  @ApiPropertyOptional({ example: true, description: 'Auto-enroll entire department' })
  @IsOptional()
  @IsBoolean()
  autoDept?: boolean;
}

export class BulkImportCoursesDto {
  @ApiProperty({ type: [CreateCourseDto] })
  @IsArray()
  courses: CreateCourseDto[];
}

