import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DataStoreService } from '../seed/data-store.service';
import { SeedService } from '../seed/seed.service';
import { CreateDepartmentDto } from './dto/department.dto';

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly store: DataStoreService,
    private readonly seedService: SeedService
  ) {}

  findAll() {
    return this.store.getDepartments();
  }

  create(dto: CreateDepartmentDto, actorId?: string, actorName?: string) {
    const departments = this.store.getDepartments();
    if (!dto.id || !dto.name) {
      throw new BadRequestException('Department id and name are required.');
    }
    if (departments.some(d => d.id === dto.id)) {
      throw new BadRequestException(`Department with id ${dto.id} already exists.`);
    }

    const newDept = { id: dto.id, name: dto.name };
    departments.push(newDept);
    this.store.setDepartments(departments);

    this.store.appendAuditLog({
      actor: actorId || 'SU001',
      actorName: actorName || 'Super User',
      actorRole: 'superuser',
      action: 'CREATE',
      module: 'Departments',
      target: dto.name,
      details: `Department created with ID ${dto.id}`,
    });

    return newDept;
  }

  remove(id: string, actorId?: string, actorName?: string) {
    const departments = this.store.getDepartments();
    const dept = departments.find(d => d.id === id);
    if (!dept) {
      throw new NotFoundException(`Department ${id} not found.`);
    }

    this.store.setDepartments(departments.filter(d => d.id !== id));

    const users = this.seedService.getUsers();
    let updatedUsers = false;
    users.forEach(u => {
      if (u.department === dept.name || u.department === id) {
        u.department = 'Unassigned';
        updatedUsers = true;
      }
    });
    if (updatedUsers) this.seedService.setUsers(users);

    const courses = this.store.getCourses();
    let updatedCourses = false;
    courses.forEach(c => {
      if (c.department === dept.name || c.department === id) {
        c.department = 'Unassigned';
        updatedCourses = true;
      }
    });
    if (updatedCourses) this.store.setCourses(courses);

    this.store.appendAuditLog({
      actor: actorId || 'SU001',
      actorName: actorName || 'Super User',
      actorRole: 'superuser',
      action: 'DELETE',
      module: 'Departments',
      target: dept.name,
      details: 'Department deleted',
    });

    return { message: 'Department deleted successfully' };
  }

  bulkCreate(dtos: CreateDepartmentDto[], actorId?: string, actorName?: string) {
    const departments = this.store.getDepartments();
    let newCount = 0;
    const added: any[] = [];

    for (const dto of dtos) {
      if (!dto.id || !dto.name) continue;
      if (!departments.some(d => d.id === dto.id)) {
        const newDept = { id: dto.id, name: dto.name };
        departments.push(newDept);
        added.push(newDept);
        newCount++;
      }
    }

    if (newCount > 0) {
      this.store.setDepartments(departments);
      this.store.appendAuditLog({
        actor: actorId || 'SU001',
        actorName: actorName || 'Super User',
        actorRole: 'superuser',
        action: 'CREATE',
        module: 'Departments',
        target: 'Bulk Import',
        details: `Bulk imported ${newCount} departments`,
      });
    }

    return { message: `Successfully imported ${newCount} new departments.`, added };
  }
}
