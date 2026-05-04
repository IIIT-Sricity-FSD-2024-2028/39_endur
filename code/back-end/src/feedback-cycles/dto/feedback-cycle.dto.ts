import { IsString, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFeedbackCycleDto {
  @ApiProperty({ example: 'Week 5 Formative Feedback' })
  @IsString()
  cycleName: string;

  @ApiPropertyOptional({ example: 'weekly', enum: ['weekly', 'monthly', 'midterm', 'endterm'] })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiProperty({ example: '2026-04-20T00:00:00Z' })
  @IsDateString()
  startTimestamp: string;

  @ApiProperty({ example: '2026-04-26T23:59:59Z' })
  @IsDateString()
  endTimestamp: string;

  @ApiPropertyOptional({ example: '2026-04-20T23:59:59Z' })
  @IsOptional()
  @IsDateString()
  prepDeadline?: string;

  @ApiPropertyOptional({ example: '2026-04-25T23:59:59Z' })
  @IsOptional()
  @IsDateString()
  studentDeadline?: string;

  @ApiPropertyOptional({ example: '2026-04-27T23:59:59Z' })
  @IsOptional()
  @IsDateString()
  reflectionDeadline?: string;

  @ApiPropertyOptional({ example: '2026-04-29T23:59:59Z' })
  @IsOptional()
  @IsDateString()
  actionReportDeadline?: string;

  @IsOptional()
  responses?: any[];

  @IsOptional()
  @IsString()
  parametersJson?: string;
}

export class UpdateFeedbackCycleDto {
  @ApiPropertyOptional({ example: 'Spring 2026 - Final Review', description: 'Updated cycle name' })
  @IsOptional()
  @IsString()
  cycleName?: string;

  @ApiPropertyOptional({ example: 'endterm', enum: ['weekly', 'monthly', 'midterm', 'endterm'] })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ example: '2026-05-01T08:00:00Z' })
  @IsOptional()
  @IsDateString()
  startTimestamp?: string;

  @ApiPropertyOptional({ example: '2026-05-15T23:59:59Z' })
  @IsOptional()
  @IsDateString()
  endTimestamp?: string;

  @ApiPropertyOptional({ example: '2026-05-02T23:59:59Z' })
  @IsOptional()
  @IsDateString()
  prepDeadline?: string;

  @ApiPropertyOptional({ example: '2026-05-10T23:59:59Z' })
  @IsOptional()
  @IsDateString()
  studentDeadline?: string;

  @ApiPropertyOptional({ example: '2026-05-12T23:59:59Z' })
  @IsOptional()
  @IsDateString()
  reflectionDeadline?: string;

  @ApiPropertyOptional({ example: '2026-05-14T23:59:59Z' })
  @IsOptional()
  @IsDateString()
  actionReportDeadline?: string;
}

export class UpdateCycleStatusDto {
  @ApiProperty({ example: 'active', enum: ['active', 'closed', 'preparation'] })
  @IsString()
  status: string;

  @ApiPropertyOptional({ example: 'STUDENT_FEEDBACK', description: 'Phase of the cycle' })
  @IsOptional()
  @IsString()
  phase?: string;
}

import { IsArray } from 'class-validator';
export class BulkImportCyclesDto {
  @ApiProperty({ type: [CreateFeedbackCycleDto] })
  @IsArray()
  cycles: CreateFeedbackCycleDto[];
}

