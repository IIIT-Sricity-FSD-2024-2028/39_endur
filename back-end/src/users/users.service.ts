import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { SeedService } from '../seed/seed.service';
import { DataStoreService } from '../seed/data-store.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly seedService: SeedService,
    private readonly store: DataStoreService,
  ) {}

  findAll(role?: string, department?: string) {
    let users = this.seedService.getUsers();
    if (role) users = users.filter((u) => u.role === role);
    if (department) users = users.filter((u) => u.department === department);
    // Never expose passwords in list responses
    return users.map(({ password: _, ...u }) => u);
  }

  findOne(id: string) {
    const user = this.seedService.getUsers().find((u) => u.id === id);
    if (!user) throw new NotFoundException(`User ${id} not found`);
    const { password: _, ...safe } = user;
    return safe;
  }

  findOneWithPassword(id: string) {
    return this.seedService.getUsers().find((u) => u.id === id);
  }

  create(dto: CreateUserDto) {
    const users = this.seedService.getUsers();
    if (users.find((u) => u.id === dto.id)) {
      throw new ConflictException(`User with ID ${dto.id} already exists`);
    }
    users.push({ ...dto });
    this.seedService.setUsers(users);
    this._syncCourseEnrollments();

    this.store.appendAuditLog({
      actor: 'SU001',
      actorName: 'Super User',
      actorRole: 'superuser',
      action: 'CREATE',
      module: 'Users',
      target: `${dto.id} — ${dto.name}`,
      details: `New ${dto.role} account created for ${dto.department || 'N/A'} department.`,
    });

    const { password: _, ...safe } = dto as any;
    return safe;
  }

  bulkCreate(users: CreateUserDto[], actorId?: string, actorName?: string) {
    const existing = this.seedService.getUsers();
    const success: any[] = [];
    const failed: Array<{ user: any; reason: string }> = [];

    for (const dto of users) {
      if (existing.find((u) => u.id === dto.id)) {
        failed.push({ user: dto, reason: `ID ${dto.id} already exists` });
        continue;
      }
      existing.push({ ...dto });
      const { password: _, ...safe } = dto as any;
      success.push(safe);
    }

    this.seedService.setUsers(existing);
    this._syncCourseEnrollments();

    if (success.length > 0) {
      this.store.appendAuditLog({
        actor: actorId || 'SU001',
        actorName: actorName || 'Super User',
        actorRole: 'superuser',
        action: 'BULK_CREATE',
        module: 'Users',
        target: `${success.length} users`,
        details: `Bulk import: ${success.length} created, ${failed.length} failed.`,
      });
    }

    return { success, failed, total: users.length };
  }

  update(id: string, dto: UpdateUserDto, actorId?: string, actorName?: string, actorRole?: string) {
    const users = this.seedService.getUsers();
    const idx = users.findIndex((u) => u.id === id);
    if (idx === -1) throw new NotFoundException(`User ${id} not found`);

    if (id === 'SU001' && actorId !== 'SU001') {
      throw new BadRequestException('Cannot modify the superuser account');
    }

    // RBAC: Non-superuser can only update their own profile
    if (actorRole !== 'superuser' && actorRole !== 'admin' && actorId !== id) {
      throw new ForbiddenException('You can only update your own profile');
    }

    // Password Verification for self-service
    if (dto.password && actorRole !== 'superuser' && actorRole !== 'admin') {
      if (!dto.currentPassword) {
        throw new BadRequestException('Current password is required to set a new one');
      }
      if (dto.currentPassword !== users[idx].password) {
        throw new BadRequestException('Incorrect current password');
      }
    }

    // Safety: only superusers can change structural fields
    if (actorRole !== 'superuser' && actorRole !== 'admin') {
      delete dto.role;
      delete dto.department;
      delete dto.enrolledCourses;
      delete dto.currentPassword; // Don't save this!
    }

    users[idx] = { ...users[idx], ...dto };
    this.seedService.setUsers(users);
    this._syncCourseEnrollments();

    this.store.appendAuditLog({
      actor: actorId || 'SU001',
      actorName: actorName || 'Super User',
      actorRole: actorRole || 'superuser',
      action: 'UPDATE',
      module: 'Users',
      target: `${id} — ${users[idx].name}`,
      details: actorId === id ? 'User updated their own profile.' : 'User details updated by administrator.',
    });

    const { password: _, ...safe } = users[idx];
    return safe;
  }

  remove(id: string, actorId?: string, actorName?: string) {
    if (id === 'SU001') {
      throw new BadRequestException('Cannot delete the superuser account');
    }
    const users = this.seedService.getUsers();
    const user = users.find((u) => u.id === id);
    if (!user) throw new NotFoundException(`User ${id} not found`);

    this.seedService.setUsers(users.filter((u) => u.id !== id));

    this.store.appendAuditLog({
      actor: actorId || 'SU001',
      actorName: actorName || 'Super User',
      actorRole: 'superuser',
      action: 'DELETE',
      module: 'Users',
      target: `${id} — ${user.name}`,
      details: 'User account removed.',
    });

    return { message: `User ${id} deleted` };
  }

  // Enroll students in a course
  updateEnrollments(courseId: string, studentIds: string[]) {
    const users = this.seedService.getUsers();
    users.forEach((u) => {
      if (u.role !== 'student') return;
      let enrolled = u.enrolledCourses || [];
      if (studentIds.includes(u.id)) {
        if (!enrolled.includes(courseId)) enrolled.push(courseId);
      } else {
        enrolled = enrolled.filter((c) => c !== courseId);
      }
      u.enrolledCourses = enrolled;
    });
    this.seedService.setUsers(users);
  }

  getEnrolledCourses(userId: string) {
    const user = this.findOneWithPassword(userId);
    if (!user) throw new NotFoundException(`User ${userId} not found`);
    const enrollmentIds = user.enrolledCourses || [];
    const allCourses = this.store.getCourses();
    return allCourses.filter((c) => enrollmentIds.includes(c.id));
  }

  private _syncCourseEnrollments() {
    const users = this.seedService.getUsers();
    const courses = this.store.getCourses();

    // Map courseId -> count
    const counts: Record<string, number> = {};
    users.forEach(u => {
      if (u.role === 'student' && u.enrolledCourses) {
        u.enrolledCourses.forEach(cid => {
          counts[cid] = (counts[cid] || 0) + 1;
        });
      }
    });

    // Update courses in store
    courses.forEach(c => {
      c.enrolled = counts[c.id] || 0;
    });
    this.store.setCourses(courses);
  }
}
