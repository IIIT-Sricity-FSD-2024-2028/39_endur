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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CoursesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const courses_service_1 = require("./courses.service");
const course_dto_1 = require("./dto/course.dto");
const role_guard_1 = require("../common/guards/role.guard");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
let CoursesController = class CoursesController {
    svc;
    constructor(svc) {
        this.svc = svc;
    }
    findAll(dept, fid) {
        return this.svc.findAll(dept, fid);
    }
    findOne(id) {
        return this.svc.findOne(id);
    }
    create(dto, req) {
        return this.svc.create(dto, req.headers['x-user-id'], req.headers['x-user-name']);
    }
    update(id, dto, req) {
        return this.svc.update(id, dto, req.headers['x-user-id'], req.headers['x-user-name']);
    }
    remove(id, req) {
        return this.svc.remove(id, req.headers['x-user-id'], req.headers['x-user-name']);
    }
    enroll(id, dto, req) {
        return this.svc.enroll(id, dto, req.headers['x-user-id'], req.headers['x-user-name']);
    }
    bulkImport(dto, req) {
        return this.svc.bulkCreate(dto.courses, req.headers['x-user-id'], req.headers['x-user-name']);
    }
};
exports.CoursesController = CoursesController;
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)('superuser', 'admin', 'dean', 'hod', 'faculty', 'student'),
    (0, swagger_1.ApiOperation)({ summary: 'List all courses' }),
    (0, swagger_1.ApiQuery)({ name: 'department', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'facultyId', required: false }),
    __param(0, (0, common_1.Query)('department')),
    __param(1, (0, common_1.Query)('facultyId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], CoursesController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, roles_decorator_1.Roles)('superuser', 'admin', 'dean', 'hod', 'faculty', 'student'),
    (0, swagger_1.ApiOperation)({ summary: 'Get a single course by ID' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], CoursesController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)('superuser'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, swagger_1.ApiOperation)({ summary: 'Create a course (superuser only)' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [course_dto_1.CreateCourseDto, Object]),
    __metadata("design:returntype", void 0)
], CoursesController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, roles_decorator_1.Roles)('superuser'),
    (0, swagger_1.ApiOperation)({ summary: 'Update a course (superuser only)' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, course_dto_1.UpdateCourseDto, Object]),
    __metadata("design:returntype", void 0)
], CoursesController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, roles_decorator_1.Roles)('superuser'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete a course (superuser only)' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], CoursesController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)(':id/enroll'),
    (0, roles_decorator_1.Roles)('superuser'),
    (0, swagger_1.ApiOperation)({ summary: 'Assign/update student enrollments for a course (superuser only)' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, course_dto_1.EnrollStudentsDto, Object]),
    __metadata("design:returntype", void 0)
], CoursesController.prototype, "enroll", null);
__decorate([
    (0, common_1.Post)('bulk'),
    (0, roles_decorator_1.Roles)('superuser'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, swagger_1.ApiOperation)({ summary: 'Bulk import courses from JSON array (superuser only)' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [course_dto_1.BulkImportCoursesDto, Object]),
    __metadata("design:returntype", void 0)
], CoursesController.prototype, "bulkImport", null);
exports.CoursesController = CoursesController = __decorate([
    (0, swagger_1.ApiTags)('Courses'),
    (0, swagger_1.ApiHeader)({ name: 'x-role', description: 'Caller role for RBAC', required: true }),
    (0, common_1.UseGuards)(role_guard_1.RoleGuard),
    (0, common_1.Controller)('courses'),
    __metadata("design:paramtypes", [courses_service_1.CoursesService])
], CoursesController);
//# sourceMappingURL=courses.controller.js.map