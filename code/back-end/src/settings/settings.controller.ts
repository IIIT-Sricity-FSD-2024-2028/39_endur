import {
  Controller,
  Get,
  Patch,
  Body,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { RoleGuard } from '../common/guards/role.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Settings')
@ApiHeader({ name: 'x-role', description: 'Caller role for RBAC', required: true })
@UseGuards(RoleGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @Roles('superuser', 'admin', 'dean', 'hod', 'faculty', 'student')
  @ApiOperation({ summary: 'Get global system settings' })
  findAll() {
    return this.settingsService.getSettings();
  }

  @Patch()
  @Roles('superuser')
  @ApiOperation({ summary: 'Update global system settings (superuser only)' })
  update(@Body() dto: any, @Request() req: any) {
    return this.settingsService.updateSettings(
      dto,
      req.headers['x-user-id'],
      req.headers['x-user-name'],
    );
  }
}
