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
exports.FacultyReportsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const faculty_reports_service_1 = require("./faculty-reports.service");
const faculty_report_dto_1 = require("./dto/faculty-report.dto");
const role_guard_1 = require("../common/guards/role.guard");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
let FacultyReportsController = class FacultyReportsController {
    svc;
    constructor(svc) {
        this.svc = svc;
    }
    findReflections(cycleId, courseId, facultyId) {
        return this.svc.findAllReflections(cycleId, courseId, facultyId);
    }
    submitReflection(dto, req) {
        return this.svc.submitReflection(dto, req.headers['x-user-id'], req.headers['x-user-name']);
    }
    findActionReports(cycleId, courseId, facultyId) {
        return this.svc.findAllActionReports(cycleId, courseId, facultyId);
    }
    submitActionReport(dto, req) {
        return this.svc.submitActionReport(dto, req.headers['x-user-id'], req.headers['x-user-name']);
    }
    triggerActionReport(dto, req) {
        return this.svc.markActionRequired(dto, req.headers['x-user-id'], req.headers['x-user-name']);
    }
    reviewCheckin(id, dto, req) {
        return this.svc.reviewCheckin(id, dto, req.headers['x-user-id'], req.headers['x-user-name']);
    }
};
exports.FacultyReportsController = FacultyReportsController;
__decorate([
    (0, common_1.Get)('self-reflections'),
    (0, roles_decorator_1.Roles)('superuser', 'admin', 'dean', 'hod', 'faculty'),
    (0, swagger_1.ApiOperation)({ summary: 'Get all self reflections' }),
    (0, swagger_1.ApiQuery)({ name: 'cycleId', required: false, example: 'C001' }),
    (0, swagger_1.ApiQuery)({ name: 'courseId', required: false, example: 'CS101' }),
    (0, swagger_1.ApiQuery)({ name: 'facultyId', required: false, example: 'F001' }),
    __param(0, (0, common_1.Query)('cycleId')),
    __param(1, (0, common_1.Query)('courseId')),
    __param(2, (0, common_1.Query)('facultyId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], FacultyReportsController.prototype, "findReflections", null);
__decorate([
    (0, common_1.Post)('self-reflections'),
    (0, roles_decorator_1.Roles)('faculty'),
    (0, swagger_1.ApiOperation)({ summary: 'Submit or update a self reflection' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [faculty_report_dto_1.SubmitSelfReflectionDto, Object]),
    __metadata("design:returntype", void 0)
], FacultyReportsController.prototype, "submitReflection", null);
__decorate([
    (0, common_1.Get)('action-reports'),
    (0, roles_decorator_1.Roles)('superuser', 'admin', 'dean', 'hod', 'faculty'),
    (0, swagger_1.ApiOperation)({ summary: 'Get all action reports' }),
    (0, swagger_1.ApiQuery)({ name: 'cycleId', required: false, example: 'C001' }),
    (0, swagger_1.ApiQuery)({ name: 'courseId', required: false, example: 'CS101' }),
    (0, swagger_1.ApiQuery)({ name: 'facultyId', required: false, example: 'F001' }),
    __param(0, (0, common_1.Query)('cycleId')),
    __param(1, (0, common_1.Query)('courseId')),
    __param(2, (0, common_1.Query)('facultyId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], FacultyReportsController.prototype, "findActionReports", null);
__decorate([
    (0, common_1.Post)('action-reports'),
    (0, roles_decorator_1.Roles)('faculty'),
    (0, swagger_1.ApiOperation)({ summary: 'Submit or resubmit an action report' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [faculty_report_dto_1.SubmitActionReportDto, Object]),
    __metadata("design:returntype", void 0)
], FacultyReportsController.prototype, "submitActionReport", null);
__decorate([
    (0, common_1.Post)('action-reports/trigger'),
    (0, roles_decorator_1.Roles)('hod', 'dean', 'superuser'),
    (0, swagger_1.ApiOperation)({ summary: 'HOD triggers an action report for a faculty' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [faculty_report_dto_1.TriggerActionReportDto, Object]),
    __metadata("design:returntype", void 0)
], FacultyReportsController.prototype, "triggerActionReport", null);
__decorate([
    (0, common_1.Patch)('action-reports/:id/checkin'),
    (0, roles_decorator_1.Roles)('hod', 'dean', 'superuser'),
    (0, swagger_1.ApiOperation)({ summary: 'HOD review / finalize / request revision on action report' }),
    (0, swagger_1.ApiParam)({ name: 'id', example: 'REPT001' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, faculty_report_dto_1.ReviewCheckinDto, Object]),
    __metadata("design:returntype", void 0)
], FacultyReportsController.prototype, "reviewCheckin", null);
exports.FacultyReportsController = FacultyReportsController = __decorate([
    (0, swagger_1.ApiTags)('Faculty Reports & Check-ins'),
    (0, common_1.UseGuards)(role_guard_1.RoleGuard),
    (0, common_1.Controller)('faculty-reports'),
    __metadata("design:paramtypes", [faculty_reports_service_1.FacultyReportsService])
], FacultyReportsController);
//# sourceMappingURL=faculty-reports.controller.js.map