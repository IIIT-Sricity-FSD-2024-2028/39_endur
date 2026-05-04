import {
  Controller, Get, Post, Patch, Delete, Body, Param, Request,
  HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader, ApiResponse, ApiParam } from '@nestjs/swagger';
import { FeedbackCyclesService } from './feedback-cycles.service';
import {
  CreateFeedbackCycleDto,
  UpdateFeedbackCycleDto,
  UpdateCycleStatusDto,
  BulkImportCyclesDto,
} from './dto/feedback-cycle.dto';
import { RoleGuard } from '../common/guards/role.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Feedback Cycles')
@UseGuards(RoleGuard)
@Controller('feedback-cycles')
export class FeedbackCyclesController {
  constructor(private readonly svc: FeedbackCyclesService) {}

  @Get()
  @Roles('superuser', 'admin', 'dean', 'hod', 'faculty', 'student')
  @ApiOperation({ summary: 'List all feedback cycles' })
  findAll() { return this.svc.findAll(); }

  @Get('active')
  @Roles('superuser', 'admin', 'dean', 'hod', 'faculty', 'student')
  @ApiOperation({ summary: 'Get active feedback cycles' })
  findActive() { return this.svc.findActive(); }

  @Get('state')
  @Roles('superuser', 'admin', 'dean', 'hod', 'faculty', 'student')
  @ApiOperation({ summary: 'Get current global cycle state (phase info)' })
  getCycleState() { return this.svc.getCycleState(); }

  @Get(':id')
  @Roles('superuser', 'admin', 'dean', 'hod', 'faculty', 'student')
  @ApiOperation({ summary: 'Get a single feedback cycle by ID' })
  @ApiParam({ name: 'id', example: 'C001' })
  findOne(@Param('id') id: string) { return this.svc.findOne(id); }

  @Post()
  @Roles('superuser', 'admin', 'dean')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a feedback cycle (superuser/admin only)' })
  create(@Body() dto: CreateFeedbackCycleDto, @Request() req: any) {
    return this.svc.create(dto, req.headers['x-user-id'], req.headers['x-user-name']);
  }

  @Patch(':id')
  @Roles('superuser', 'admin', 'dean')
  @ApiOperation({ summary: 'Update a feedback cycle (superuser/admin only)' })
  @ApiParam({ name: 'id', example: 'C001' })
  update(@Param('id') id: string, @Body() dto: UpdateFeedbackCycleDto, @Request() req: any) {
    return this.svc.update(id, dto, req.headers['x-user-id'], req.headers['x-user-name']);
  }

  @Patch(':id/status')
  @Roles('superuser', 'admin', 'dean')
  @ApiOperation({ summary: 'Update cycle status/phase (superuser/admin only)' })
  @ApiParam({ name: 'id', example: 'C001' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateCycleStatusDto, @Request() req: any) {
    return this.svc.updateStatus(id, dto, req.headers['x-user-id'], req.headers['x-user-name']);
  }

  @Delete(':id')
  @Roles('superuser', 'admin')
  @ApiOperation({ summary: 'Delete a feedback cycle (superuser/admin only)' })
  @ApiParam({ name: 'id', example: 'C001' })
  remove(@Param('id') id: string, @Request() req: any) {
    return this.svc.remove(id, req.headers['x-user-id'], req.headers['x-user-name']);
  }

  @Post('bulk')
  @Roles('superuser', 'admin')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Bulk import historical feedback cycles (superuser/admin only)' })
  bulkImport(@Body() dto: BulkImportCyclesDto, @Request() req: any) {
    return this.svc.bulkCreate(dto.cycles, req.headers['x-user-id'], req.headers['x-user-name']);
  }
}
