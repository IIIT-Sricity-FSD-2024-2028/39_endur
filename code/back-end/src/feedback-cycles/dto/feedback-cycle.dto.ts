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
}

export class UpdateFeedbackCycleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cycleName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startTimestamp?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endTimestamp?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  reflectionDeadline?: string;

  @ApiPropertyOptional()
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

