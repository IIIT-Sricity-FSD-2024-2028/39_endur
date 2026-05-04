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
  @ApiPropertyOptional({ example: 'Pedagogical Clarity', description: 'Updated parameter name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'Measures how effectively the instructor delivers complex material.', description: 'Updated description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'Instructional Design' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 30, description: 'Updated weight percentage' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  weight?: number;

  @ApiPropertyOptional({ example: 'APPROVED', enum: ['DRAFT', 'SUBMITTED', 'APPROVED', 'REVISION_REQUESTED'] })
  @IsOptional()
  @IsString()
  status?: string;
}

export class BulkImportEvalParamsDto {
  @ApiProperty({ type: [CreateEvalParamDto] })
  @IsArray()
  params: CreateEvalParamDto[];
}

