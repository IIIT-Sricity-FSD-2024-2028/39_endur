import { IsString, IsOptional, IsArray, IsNumber, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SubmitFeedbackDto {
  @ApiProperty({ example: 'CYCLE_W5' })
  @IsString()
  cycleId: string;

  @ApiProperty({ example: 'CS101' })
  @IsString()
  courseId: string;

  @ApiProperty({ example: 'S001' })
  @IsString()
  studentId: string;

  @ApiPropertyOptional({ example: 'F001' })
  @IsOptional()
  @IsString()
  facultyId?: string;

  @ApiPropertyOptional({ example: { EP001: 4, EP002: 5 }, description: 'Parameter ID → rating score map' })
  @IsOptional()
  @IsObject()
  ratings?: Record<string, number>;

  @ApiPropertyOptional({ example: 'Great course!' })
  @IsOptional()
  @IsString()
  openEndedComment?: string;
}
