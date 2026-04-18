import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DataStoreService } from '../seed/data-store.service';
import { SeedService } from '../seed/seed.service';
import { CreateCourseDto, UpdateCourseDto, EnrollStudentsDto } from './dto/course.dto';

const THUMBNAILS = [
  'img_backtoschool.jpg',
  'img_bookclub.jpg',
  'img_breakfast.jpg',
  'img_learnlanguage.jpg',
  'img_read.jpg',
];

@Injectable()
export class CoursesService {
  constructor(
    private readonly store: DataStoreService,
    private readonly seedService: SeedService,
  ) { }

  findAll(department?: string, facultyId?: string) {
    let courses = this.store.getCourses();
    if (department) courses = courses.filter((c) => c.department === department);
    if (facultyId) courses = courses.filter((c) => c.facultyId === facultyId);
    return courses;
  }

  findOne(id: string) {
    const course = this.store.getCourses().find((c) => c.id === id);
    if (!course) throw new NotFoundException(`Course ${id} not found`);
    return course;
  }

  create(dto: CreateCourseDto, actorId?: string, actorName?: string) {
    const courses = this.store.getCourses();
    if (courses.find((c) => c.id === dto.id)) {
      throw new ConflictException(`Course ${dto.id} already exists`);
    }
    const entry = {
      ...dto,
      enrolled: dto.enrolled || 0,
      thumbnail: dto.thumbnail || THUMBNAILS[Math.floor(Math.random() * THUMBNAILS.length)],
    };
    courses.unshift(entry);
    this.store.setCourses(courses);

    this.store.appendAuditLog({
      actor: actorId || 'SU001',
      actorName: actorName || 'Super User',
      actorRole: 'superuser',
      action: 'CREATE',
      module: 'Courses',
      target: `${dto.id} — ${dto.name}`,
      details: 'New course added to system.',
    });
    return entry;
  }

  update(id: string, dto: UpdateCourseDto, actorId?: string, actorName?: string) {
    const courses = this.store.getCourses();
    const idx = courses.findIndex((c) => c.id === id);
    if (idx === -1) throw new NotFoundException(`Course ${id} not found`);
    courses[idx] = { ...courses[idx], ...dto };
    this.store.setCourses(courses);

    this.store.appendAuditLog({
      actor: actorId || 'SU001',
      actorName: actorName || 'Super User',
      actorRole: 'superuser',
      action: 'UPDATE',
      module: 'Courses',
      target: `${id} — ${courses[idx].name}`,
      details: 'Course details updated.',
    });
    return courses[idx];
  }

  remove(id: string, actorId?: string, actorName?: string) {
    const courses = this.store.getCourses();
    const course = courses.find((c) => c.id === id);
    if (!course) throw new NotFoundException(`Course ${id} not found`);
    this.store.setCourses(courses.filter((c) => c.id !== id));

    this.store.appendAuditLog({
      actor: actorId || 'SU001',
      actorName: actorName || 'Super User',
      actorRole: 'superuser',
      action: 'DELETE',
      module: 'Courses',
      target: `${id} — ${course.name}`,
      details: 'Course removed from system.',
    });
    return { message: `Course ${id} deleted` };
  }

  enroll(courseId: string, dto: EnrollStudentsDto, actorId?: string, actorName?: string) {
    const courses = this.store.getCourses();
    const courseIdx = courses.findIndex((c) => c.id === courseId);
    if (courseIdx === -1) throw new NotFoundException(`Course ${courseId} not found`);

    // Update student enrollments
    const users = this.seedService.getUsers();
    users.forEach((u) => {
      if (u.role !== 'student') return;
      let enrolled = u.enrolledCourses || [];
      if (dto.studentIds.includes(u.id)) {
        if (!enrolled.includes(courseId)) enrolled.push(courseId);
      } else {
        enrolled = enrolled.filter((c) => c !== courseId);
      }
      u.enrolledCourses = enrolled;
    });
    this.seedService.setUsers(users);

    // Update course enrollment count
    courses[courseIdx].enrolled = dto.studentIds.length;
    this.store.setCourses(courses);

    this.store.appendAuditLog({
      actor: actorId || 'SU001',
      actorName: actorName || 'Super User',
      actorRole: 'superuser',
      action: 'ASSIGN',
      module: 'Courses',
      target: courseId,
      details: `Students assigned. Total: ${dto.studentIds.length}`,
    });

    return courses[courseIdx];
  }

  bulkCreate(coursesToImport: CreateCourseDto[], actorId?: string, actorName?: string) {
    const existing = this.store.getCourses();
    const success: any[] = [];
    const failed: Array<{ course: any; reason: string }> = [];

    for (const dto of coursesToImport) {
      if (existing.find((c) => c.id === dto.id)) {
        failed.push({ course: dto, reason: `Course ID ${dto.id} already exists` });
        continue;
      }
      const entry = { ...dto, enrolled: dto.enrolled || 0, thumbnail: dto.thumbnail || THUMBNAILS[Math.floor(Math.random() * THUMBNAILS.length)] };
      existing.unshift(entry);
      success.push(entry);
    }
    this.store.setCourses(existing);

    if (success.length > 0) {
      this.store.appendAuditLog({ actor: actorId || 'SU001', actorName: actorName || 'Super User', actorRole: 'superuser', action: 'BULK_CREATE', module: 'Courses', target: `${success.length} courses`, details: `Bulk import: ${success.length} created, ${failed.length} failed.` });
    }
    return { success, failed, total: coursesToImport.length };
  }
}
