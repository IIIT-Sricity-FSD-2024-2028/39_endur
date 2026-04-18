import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader, ApiQuery } from '@nestjs/swagger';
import { AuditLogsService } from './audit-logs.service';
import { RoleGuard } from '../common/guards/role.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Audit Logs')
@ApiHeader({ name: 'x-role', description: 'Caller role for RBAC', required: true })
@UseGuards(RoleGuard)
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly svc: AuditLogsService) {}

  @Get()
  @Roles('superuser', 'admin')
  @ApiOperation({ summary: 'Get paginated audit logs (superuser/admin only)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'module', required: false })
  @ApiQuery({ name: 'actor', required: false })
  findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('module') module?: string,
    @Query('actor') actor?: string,
  ) {
    return this.svc.findAll(Number(page) || 1, Number(limit) || 50, module, actor);
  }
}
