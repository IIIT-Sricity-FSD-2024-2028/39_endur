import { IsString, IsNumber, IsOptional, IsArray, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateEvalParamDto {
  @ApiProperty({ example: 'Teaching Clarity' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'Measures how clearly the faculty explains concepts.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'Pedagogy' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty({ example: 25, description: 'Weight percentage (0-100)' })
  @IsNumber()
  @Min(0)
  @Max(100)
  weight: number;

  @ApiPropertyOptional({ example: 'rating', enum: ['rating', 'text'] })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiProperty({ example: 'Computer Science', description: 'Department this parameter belongs to' })
  @IsString()
  department: string;
}

export class UpdateEvalParamDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  weight?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
}
