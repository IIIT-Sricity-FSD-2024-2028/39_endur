import {
  Controller, Get, Post, Body, Param, Query, Request,
  HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader, ApiQuery } from '@nestjs/swagger';
import { FeedbackResponsesService } from './feedback-responses.service';
import { SubmitFeedbackDto } from './dto/feedback-response.dto';
import { RoleGuard } from '../common/guards/role.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Feedback Responses')
@ApiHeader({ name: 'x-role', description: 'Caller role for RBAC', required: true })
@UseGuards(RoleGuard)
@Controller('feedback-responses')
export class FeedbackResponsesController {
  constructor(private readonly svc: FeedbackResponsesService) {}

  @Get()
  @Roles('superuser', 'admin', 'dean', 'hod', 'faculty', 'student')
  @ApiOperation({ summary: 'List feedback responses (filterable by cycle/course/student/faculty)' })
  @ApiQuery({ name: 'cycleId',   required: false })
  @ApiQuery({ name: 'courseId',  required: false })
  @ApiQuery({ name: 'studentId', required: false })
  @ApiQuery({ name: 'facultyId', required: false })
  findAll(
    @Query('cycleId')   cycleId?:   string,
    @Query('courseId')  courseId?:  string,
    @Query('studentId') studentId?: string,
    @Query('facultyId') facultyId?: string,
  ) {
    return this.svc.findAll(cycleId, courseId, studentId, facultyId);
  }

  @Post()
  @Roles('student')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit feedback (student only)' })
  submit(@Body() dto: SubmitFeedbackDto) {
    return this.svc.submit(dto);
  }

  @Get('summary/:courseId')
  @Roles('superuser', 'admin', 'dean', 'hod', 'faculty')
  @ApiOperation({ summary: 'Get aggregated feedback summary for a course' })
  @ApiQuery({ name: 'cycleId', required: false })
  getSummary(@Param('courseId') courseId: string, @Query('cycleId') cycleId?: string) {
    return this.svc.getSummary(courseId, cycleId);
  }

  @Get('check')
  @Roles('student')
  @ApiOperation({ summary: 'Check if student has submitted feedback for a course+cycle' })
  @ApiQuery({ name: 'courseId', required: true })
  @ApiQuery({ name: 'studentId', required: true })
  @ApiQuery({ name: 'cycleId', required: true })
  checkSubmitted(
    @Query('courseId') courseId: string,
    @Query('studentId') studentId: string,
    @Query('cycleId') cycleId: string,
  ) {
    return this.svc.checkSubmitted(courseId, studentId, cycleId);
  }
}
