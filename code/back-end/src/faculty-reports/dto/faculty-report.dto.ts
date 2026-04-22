import { IsString, IsNotEmpty, IsOptional, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SubmitSelfReflectionDto {
  @ApiProperty() @IsString() @IsNotEmpty() facultyId: string;
  @ApiProperty() @IsString() @IsNotEmpty() courseId: string;
  @ApiProperty() @IsString() @IsNotEmpty() cycleId: string;
  @ApiProperty() @IsObject() expectedRatings: Record<string, number>;
  @ApiProperty() @IsString() reflectionText: string;
}

export class SubmitActionReportDto {
  @ApiProperty() @IsString() @IsNotEmpty() facultyId: string;
  @ApiProperty() @IsString() @IsNotEmpty() courseId: string;
  @ApiProperty() @IsString() @IsNotEmpty() cycleId: string;
  @ApiProperty() @IsString() rootCause: string;
  @ApiProperty() @IsString() plannedStrategies: string;
  @ApiProperty() @IsString() timeline: string;
}

export class ReviewCheckinDto {
  @ApiProperty() @IsString() status: string;
  @ApiPropertyOptional() @IsOptional() @IsString() hodNotes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() hodOutcomes?: string;
}

export class TriggerActionReportDto {
  @ApiProperty() @IsString() @IsNotEmpty() facultyId: string;
  @ApiProperty() @IsString() @IsNotEmpty() courseId: string;
  @ApiProperty() @IsString() @IsNotEmpty() cycleId: string;
}
