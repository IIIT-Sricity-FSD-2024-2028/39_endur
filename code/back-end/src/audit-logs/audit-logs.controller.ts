import { Controller, Get, Post, Body, Query, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader, ApiQuery } from '@nestjs/swagger';
import { AuditLogsService } from './audit-logs.service';
import { RoleGuard } from '../common/guards/role.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Audit Logs')
@UseGuards(RoleGuard)
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly svc: AuditLogsService) {}

  @Get()
  @Roles('superuser', 'admin')
  @ApiOperation({ summary: 'Get paginated audit logs (superuser/admin only)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'module', required: false, example: 'Courses' })
  @ApiQuery({ name: 'actor', required: false, example: 'U001' })
  findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('module') module?: string,
    @Query('actor') actor?: string,
  ) {
    return this.svc.findAll(Number(page) || 1, Number(limit) || 50, module, actor);
  }

  @Post()
  @Roles('superuser', 'admin', 'dean', 'hod', 'faculty', 'student')
  @ApiOperation({ summary: 'Create an audit log entry from the frontend' })
  create(@Body() body: any, @Request() req: any) {
    return this.svc.create({
      actor: body.actor || req.headers['x-user-id'] || 'UNKNOWN',
      actorName: body.actorName || req.headers['x-user-name'] || 'Unknown',
      actorRole: body.actorRole || req.headers['x-role'] || 'unknown',
      action: body.action || 'LOG',
      module: body.module || 'General',
      target: body.target || '',
      details: body.details || '',
    });
  }
}
