"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CoursesService = void 0;
const common_1 = require("@nestjs/common");
const data_store_service_1 = require("../seed/data-store.service");
const seed_service_1 = require("../seed/seed.service");
const THUMBNAILS = [
    'img_backtoschool.jpg',
    'img_bookclub.jpg',
    'img_breakfast.jpg',
    'img_learnlanguage.jpg',
    'img_read.jpg',
];
let CoursesService = class CoursesService {
    store;
    seedService;
    constructor(store, seedService) {
        this.store = store;
        this.seedService = seedService;
    }
    findAll(department, facultyId) {
        let courses = this.store.getCourses();
        if (department)
            courses = courses.filter((c) => c.department === department);
        if (facultyId)
            courses = courses.filter((c) => c.facultyId === facultyId);
        return courses;
    }
    findOne(id) {
        const course = this.store.getCourses().find((c) => c.id === id);
        if (!course)
            throw new common_1.NotFoundException(`Course ${id} not found`);
        return course;
    }
    create(dto, actorId, actorName) {
        const courses = this.store.getCourses();
        if (courses.find((c) => c.id === dto.id)) {
            throw new common_1.ConflictException(`Course ${dto.id} already exists`);
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
    update(id, dto, actorId, actorName) {
        const courses = this.store.getCourses();
        const idx = courses.findIndex((c) => c.id === id);
        if (idx === -1)
            throw new common_1.NotFoundException(`Course ${id} not found`);
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
    remove(id, actorId, actorName) {
        const courses = this.store.getCourses();
        const course = courses.find((c) => c.id === id);
        if (!course)
            throw new common_1.NotFoundException(`Course ${id} not found`);
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
    enroll(courseId, dto, actorId, actorName) {
        const courses = this.store.getCourses();
        const courseIdx = courses.findIndex((c) => c.id === courseId);
        if (courseIdx === -1)
            throw new common_1.NotFoundException(`Course ${courseId} not found`);
        const users = this.seedService.getUsers();
        users.forEach((u) => {
            if (u.role !== 'student')
                return;
            let enrolled = u.enrolledCourses || [];
            if (dto.studentIds.includes(u.id)) {
                if (!enrolled.includes(courseId))
                    enrolled.push(courseId);
            }
            else {
                enrolled = enrolled.filter((c) => c !== courseId);
            }
            u.enrolledCourses = enrolled;
        });
        this.seedService.setUsers(users);
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
};
exports.CoursesService = CoursesService;
exports.CoursesService = CoursesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [data_store_service_1.DataStoreService,
        seed_service_1.SeedService])
], CoursesService);
//# sourceMappingURL=courses.service.js.map