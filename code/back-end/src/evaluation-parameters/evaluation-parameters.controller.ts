import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, Request,
  HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader, ApiQuery } from '@nestjs/swagger';
import { EvaluationParametersService } from './evaluation-parameters.service';
import { CreateEvalParamDto, UpdateEvalParamDto, BulkImportEvalParamsDto } from './dto/eval-param.dto';
import { RoleGuard } from '../common/guards/role.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Evaluation Parameters')
@ApiHeader({ name: 'x-role', description: 'Caller role for RBAC', required: true })
@UseGuards(RoleGuard)
@Controller('evaluation-parameters')
export class EvaluationParametersController {
  constructor(private readonly svc: EvaluationParametersService) {}

  @Get()
  @Roles('superuser', 'admin', 'dean', 'hod', 'faculty', 'student')
  @ApiOperation({ summary: 'List all evaluation parameters (optionally filtered by department)' })
  @ApiQuery({ name: 'department', required: false })
  findAll(@Query('department') dept?: string) {
    return this.svc.findAll(dept);
  }

  @Get('status')
  @Roles('superuser', 'admin', 'dean', 'hod')
  @ApiOperation({ summary: 'Get department config status map' })
  getDeptStatus() {
    return this.svc.getDeptStatus();
  }

  @Get('dept/:department')
  @Roles('superuser', 'admin', 'dean', 'hod', 'faculty')
  @ApiOperation({ summary: 'Get draft parameters for a department' })
  getDraftsByDept(@Param('department') dept: string) {
    return this.svc.getDraftsByDept(dept);
  }

  @Get('notes')
  @Roles('superuser', 'admin', 'dean', 'hod')
  @ApiOperation({ summary: 'Get department config notes map' })
  getDeptNotes() {
    return this.svc.getDeptNotes();
  }

  @Post()
  @Roles('superuser', 'admin', 'hod')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an evaluation parameter (superuser/admin/hod)' })
  create(@Body() dto: CreateEvalParamDto, @Request() req: any) {
    return this.svc.create(
      dto,
      req.headers['x-user-id'],
      req.headers['x-user-name'],
      req.headers['x-role'],
    );
  }

  @Patch(':id/dept/:department')
  @Roles('superuser', 'admin', 'hod')
  @ApiOperation({ summary: 'Update a parameter by ID and department' })
  update(
    @Param('id') id: string,
    @Param('department') dept: string,
    @Body() dto: UpdateEvalParamDto,
    @Request() req: any,
  ) {
    return this.svc.update(id, dept, dto, req.headers['x-user-id'], req.headers['x-user-name']);
  }

  @Delete(':id/dept/:department')
  @Roles('superuser', 'admin', 'hod')
  @ApiOperation({ summary: 'Delete a parameter (superuser/admin/hod)' })
  remove(
    @Param('id') id: string,
    @Param('department') dept: string,
    @Request() req: any,
  ) {
    return this.svc.remove(id, dept, req.headers['x-user-id'], req.headers['x-user-name']);
  }

  @Post('dept/:department/revert')
  @Roles('hod')
  @ApiOperation({ summary: 'Revert dept params from SUBMITTED back to DRAFT (hod only)' })
  revert(@Param('department') dept: string, @Request() req: any) {
    return this.svc.revertToDraft(dept, req.headers['x-user-id'], req.headers['x-user-name']);
  }

  @Post('dept/:department/approve')
  @Roles('superuser', 'dean')
  @ApiOperation({ summary: 'Approve dept params if total weight = 100% (superuser/dean only)' })
  approve(@Param('department') dept: string, @Request() req: any) {
    return this.svc.approve(dept, req.headers['x-user-id'], req.headers['x-user-name']);
  }

  @Post('dept/:department/submit')
  @Roles('hod')
  @ApiOperation({ summary: 'Submit dept params for approval (hod only)' })
  submit(@Param('department') dept: string, @Request() req: any) {
    return this.svc.submit(dept, req.headers['x-user-id'], req.headers['x-user-name']);
  }

  @Post('dept/:department/reject')
  @Roles('superuser', 'dean')
  @ApiOperation({ summary: 'Reject dept params to request revision (superuser/dean only)' })
  reject(@Param('department') dept: string, @Body('note') note: string, @Request() req: any) {
    return this.svc.reject(dept, note, req.headers['x-user-id'], req.headers['x-user-name']);
  }

  @Post('bulk')
  @Roles('superuser', 'admin')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Bulk import evaluation parameters from JSON array (superuser/admin only)' })
  bulkImport(@Body() dto: BulkImportEvalParamsDto, @Request() req: any) {
    return this.svc.bulkCreate(dto.params, req.headers['x-user-id'], req.headers['x-user-name']);
  }
}
