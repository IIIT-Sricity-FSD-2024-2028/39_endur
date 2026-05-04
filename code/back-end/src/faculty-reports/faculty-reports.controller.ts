import { Controller, Get, Post, Patch, Body, Param, Query, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiHeader, ApiParam } from '@nestjs/swagger';
import { FacultyReportsService } from './faculty-reports.service';
import { SubmitSelfReflectionDto, SubmitActionReportDto, ReviewCheckinDto, TriggerActionReportDto } from './dto/faculty-report.dto';
import { RoleGuard } from '../common/guards/role.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Faculty Reports & Check-ins')
@UseGuards(RoleGuard)
@Controller('faculty-reports')
export class FacultyReportsController {
  constructor(private readonly svc: FacultyReportsService) {}

  @Get('self-reflections')
  @Roles('superuser', 'admin', 'dean', 'hod', 'faculty')
  @ApiOperation({ summary: 'Get all self reflections' })
  @ApiQuery({ name: 'cycleId', required: false, example: 'C001' })
  @ApiQuery({ name: 'courseId', required: false, example: 'CS101' })
  @ApiQuery({ name: 'facultyId', required: false, example: 'F001' })
  findReflections(@Query('cycleId') cycleId?: string, @Query('courseId') courseId?: string, @Query('facultyId') facultyId?: string) {
    return this.svc.findAllReflections(cycleId, courseId, facultyId);
  }

  @Post('self-reflections')
  @Roles('faculty')
  @ApiOperation({ summary: 'Submit or update a self reflection' })
  submitReflection(@Body() dto: SubmitSelfReflectionDto, @Request() req: any) {
    return this.svc.submitReflection(dto, req.headers['x-user-id'], req.headers['x-user-name']);
  }

  @Get('action-reports')
  @Roles('superuser', 'admin', 'dean', 'hod', 'faculty')
  @ApiOperation({ summary: 'Get all action reports' })
  @ApiQuery({ name: 'cycleId', required: false, example: 'C001' })
  @ApiQuery({ name: 'courseId', required: false, example: 'CS101' })
  @ApiQuery({ name: 'facultyId', required: false, example: 'F001' })
  findActionReports(@Query('cycleId') cycleId?: string, @Query('courseId') courseId?: string, @Query('facultyId') facultyId?: string) {
    return this.svc.findAllActionReports(cycleId, courseId, facultyId);
  }

  @Post('action-reports')
  @Roles('faculty')
  @ApiOperation({ summary: 'Submit or resubmit an action report' })
  submitActionReport(@Body() dto: SubmitActionReportDto, @Request() req: any) {
    return this.svc.submitActionReport(dto, req.headers['x-user-id'], req.headers['x-user-name']);
  }

  @Post('action-reports/trigger')
  @Roles('hod', 'dean', 'superuser')
  @ApiOperation({ summary: 'HOD triggers an action report for a faculty' })
  triggerActionReport(@Body() dto: TriggerActionReportDto, @Request() req: any) {
    return this.svc.markActionRequired(dto, req.headers['x-user-id'], req.headers['x-user-name']);
  }

  @Patch('action-reports/:id/checkin')
  @Roles('hod', 'dean', 'superuser')
  @ApiOperation({ summary: 'HOD review / finalize / request revision on action report' })
  @ApiParam({ name: 'id', example: 'REPT001' })
  reviewCheckin(@Param('id') id: string, @Body() dto: ReviewCheckinDto, @Request() req: any) {
    return this.svc.reviewCheckin(id, dto, req.headers['x-user-id'], req.headers['x-user-name']);
  }
}
