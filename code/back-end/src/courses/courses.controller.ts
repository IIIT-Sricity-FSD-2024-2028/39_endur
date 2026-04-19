import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, Request,
  HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { CoursesService } from './courses.service';
import { CreateCourseDto, UpdateCourseDto, EnrollStudentsDto, BulkImportCoursesDto } from './dto/course.dto';
import { RoleGuard } from '../common/guards/role.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Courses')
@ApiHeader({ name: 'x-role', description: 'Caller role for RBAC', required: true })
@UseGuards(RoleGuard)
@Controller('courses')
export class CoursesController {
  constructor(private readonly svc: CoursesService) {}

  @Get()
  @Roles('superuser', 'admin', 'dean', 'hod', 'faculty', 'student')
  @ApiOperation({ summary: 'List all courses' })
  @ApiQuery({ name: 'department', required: false })
  @ApiQuery({ name: 'facultyId', required: false })
  findAll(@Query('department') dept?: string, @Query('facultyId') fid?: string) {
    return this.svc.findAll(dept, fid);
  }

  @Get(':id')
  @Roles('superuser', 'admin', 'dean', 'hod', 'faculty', 'student')
  @ApiOperation({ summary: 'Get a single course by ID' })
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post()
  @Roles('superuser')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a course (superuser only)' })
  create(@Body() dto: CreateCourseDto, @Request() req: any) {
    return this.svc.create(dto, req.headers['x-user-id'], req.headers['x-user-name']);
  }

  @Patch(':id')
  @Roles('superuser')
  @ApiOperation({ summary: 'Update a course (superuser only)' })
  update(@Param('id') id: string, @Body() dto: UpdateCourseDto, @Request() req: any) {
    return this.svc.update(id, dto, req.headers['x-user-id'], req.headers['x-user-name']);
  }

  @Delete(':id')
  @Roles('superuser')
  @ApiOperation({ summary: 'Delete a course (superuser only)' })
  remove(@Param('id') id: string, @Request() req: any) {
    return this.svc.remove(id, req.headers['x-user-id'], req.headers['x-user-name']);
  }

  @Post(':id/enroll')
  @Roles('superuser')
  @ApiOperation({ summary: 'Assign/update student enrollments for a course (superuser only)' })
  enroll(@Param('id') id: string, @Body() dto: EnrollStudentsDto, @Request() req: any) {
    return this.svc.enroll(id, dto, req.headers['x-user-id'], req.headers['x-user-name']);
  }

  @Post('bulk')
  @Roles('superuser')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Bulk import courses from JSON array (superuser only)' })
  bulkImport(@Body() dto: BulkImportCoursesDto, @Request() req: any) {
    return this.svc.bulkCreate(dto.courses, req.headers['x-user-id'], req.headers['x-user-name']);
  }

  @Post('auto-assign-all')
  @Roles('superuser')
  @ApiOperation({ summary: 'Global auto-enrollment for all courses based on department (superuser only)' })
  autoAssignAll(@Request() req: any) {
    return this.svc.autoAssignAll(req.headers['x-user-id'], req.headers['x-user-name']);
  }
}
