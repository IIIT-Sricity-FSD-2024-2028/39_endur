import { IsString, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RatingEntryDto {
  @ApiProperty({ example: 'EV101' })
  @IsString()
  paramId: string;

  @ApiProperty({ example: 5 })
  score: number;

  @ApiPropertyOptional({ example: 'Great explanation of concepts!' })
  @IsOptional()
  @IsString()
  comment?: string;
}

export class SubmitFeedbackDto {
  @ApiProperty({ example: 'CYC-101' })
  @IsString()
  cycleId: string;

  @ApiProperty({ example: 'CS101' })
  @IsString()
  courseId: string;

  @ApiProperty({ example: 'S001' })
  @IsString()
  studentId: string;

  @ApiPropertyOptional({ example: 'DEPT-CS' })
  @IsOptional()
  @IsString()
  studentDepartment?: string;

  @ApiPropertyOptional({ example: 'F001' })
  @IsOptional()
  @IsString()
  facultyId?: string;

  @ApiProperty({
    type: [RatingEntryDto],
    example: [
      { paramId: 'EV101', score: 5, comment: 'Excellent!' },
      { paramId: 'EV102', score: 4, comment: 'Very relevant.' },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RatingEntryDto)
  ratings: RatingEntryDto[];
}
