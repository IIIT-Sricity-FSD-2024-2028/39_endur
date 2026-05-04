import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Request,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiHeader,
  ApiQuery,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { BulkImportDto } from './dto/bulk-import.dto';
import { RoleGuard } from '../common/guards/role.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Users')
@UseGuards(RoleGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles('superuser', 'admin', 'dean', 'hod')
  @ApiOperation({ summary: 'List all users (filterable by role / department)' })
  @ApiQuery({ name: 'role', required: false, example: 'student' })
  @ApiQuery({ name: 'department', required: false, example: 'Physics' })
  @ApiResponse({ status: 200, description: 'Array of user objects (no passwords)' })
  findAll(
    @Query('role') role?: string,
    @Query('department') department?: string,
  ) {
    return this.usersService.findAll(role, department);
  }
  
  @Get('profile/me')
  @Roles('superuser', 'admin', 'dean', 'hod', 'faculty', 'student')
  @ApiOperation({ summary: 'Get current logged in user profile' })
  getMe(@Request() req: any) {
    const userId = req.headers['x-user-id'];
    return this.usersService.findOne(userId);
  }

  @Get('me/courses')
  @Roles('student')
  @ApiOperation({ summary: 'Get enrolled courses for the current student' })
  getMyCourses(@Request() req: any) {
    const userId = req.headers['x-user-id'];
    return this.usersService.getEnrolledCourses(userId);
  }

  @Get(':id')
  @Roles('superuser', 'admin', 'dean', 'hod', 'faculty', 'student')
  @ApiOperation({ summary: 'Get a single user by ID' })
  @ApiParam({ name: 'id', example: 'S001' })
  @ApiResponse({ status: 200, description: 'User object (no password)' })
  @ApiResponse({ status: 404, description: 'User not found' })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  @Roles('superuser')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a single user (superuser only)' })
  @ApiResponse({ status: 201, description: 'Created user object' })
  @ApiResponse({ status: 409, description: 'User ID already exists' })
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Post('bulk')
  @Roles('superuser')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Bulk import users from JSON array (superuser only)' })
  @ApiResponse({ status: 201, description: '{ success: [], failed: [], total: n }' })
  bulkImport(@Body() dto: BulkImportDto, @Request() req: any) {
    const actorId = req.headers['x-user-id'];
    const actorName = req.headers['x-user-name'];
    return this.usersService.bulkCreate(dto.users, actorId, actorName);
  }

  @Patch(':id')
  @Roles('superuser', 'admin', 'dean', 'hod', 'faculty', 'student')
  @ApiOperation({ summary: 'Update a user (restricted self-service for non-SU)' })
  @ApiParam({ name: 'id', example: 'S001' })
  @ApiResponse({ status: 200, description: 'Updated user object' })
  @ApiResponse({ status: 404, description: 'User not found' })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @Request() req: any) {
    const actorId = req.headers['x-user-id'];
    const actorName = req.headers['x-user-name'];
    const actorRole = req.headers['x-role'];
    return this.usersService.update(id, dto, actorId, actorName, actorRole);
  }

  @Delete(':id')
  @Roles('superuser')
  @ApiOperation({ summary: 'Delete a user (superuser only)' })
  @ApiParam({ name: 'id', example: 'S001' })
  @ApiResponse({ status: 200, description: 'Deletion confirmation' })
  @ApiResponse({ status: 404, description: 'User not found' })
  remove(@Param('id') id: string, @Request() req: any) {
    return this.usersService.remove(id, req.headers['x-user-id'], req.headers['x-user-name']);
  }
}
