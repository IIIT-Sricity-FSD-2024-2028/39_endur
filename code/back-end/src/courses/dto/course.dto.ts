import { IsString, IsOptional, IsNumber, IsArray, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCourseDto {
  @ApiProperty({ example: 'CS101' })
  @IsString()
  id: string;

  @ApiProperty({ example: 'Data Structures' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'F101', description: 'Faculty user ID' })
  @IsString()
  facultyId: string;

  @ApiPropertyOptional({ example: 'Dr. Alan Turing' })
  @IsOptional()
  @IsString()
  faculty?: string;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  facultyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  faculty?: string;

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
