import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { DepartmentsService } from './departments.service';
import { CreateDepartmentDto } from './dto/department.dto';

@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Get()
  findAll() {
    return this.departmentsService.findAll();
  }

  @Post('bulk')
  bulkCreate(
    @Body() dtos: CreateDepartmentDto[],
    @Headers('x-role') role: string,
    @Headers('x-user-id') userId: string,
  ) {
    if (role !== 'superuser' && role !== 'admin') {
      throw new UnauthorizedException('Insufficient permissions');
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const dummyActorName = 'Super User';
    return this.departmentsService.bulkCreate(dtos, userId, dummyActorName);
  }

  @Post()
  create(
    @Body() dto: CreateDepartmentDto,
    @Headers('x-role') role: string,
    @Headers('x-user-id') userId: string,
  ) {
    // Only superuser/admin can create
    if (role !== 'superuser' && role !== 'admin') {
      throw new UnauthorizedException('Insufficient permissions');
    }
    return this.departmentsService.create(dto, userId);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @Headers('x-role') role: string,
    @Headers('x-user-id') userId: string,
  ) {
    // Only superuser/admin can delete
    if (role !== 'superuser' && role !== 'admin') {
      throw new UnauthorizedException('Insufficient permissions');
    }
    return this.departmentsService.remove(id, userId);
  }
}
