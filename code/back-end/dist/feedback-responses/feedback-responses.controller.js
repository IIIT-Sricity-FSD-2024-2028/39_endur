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
exports.FeedbackResponsesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const feedback_responses_service_1 = require("./feedback-responses.service");
const feedback_response_dto_1 = require("./dto/feedback-response.dto");
const role_guard_1 = require("../common/guards/role.guard");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
let FeedbackResponsesController = class FeedbackResponsesController {
    svc;
    constructor(svc) {
        this.svc = svc;
    }
    findAll(cycleId, courseId, studentId, facultyId) {
        return this.svc.findAll(cycleId, courseId, studentId, facultyId);
    }
    submit(dto) {
        return this.svc.submit(dto);
    }
    getSummary(courseId, cycleId) {
        return this.svc.getSummary(courseId, cycleId);
    }
    checkSubmitted(courseId, studentId, cycleId) {
        return this.svc.checkSubmitted(courseId, studentId, cycleId);
    }
};
exports.FeedbackResponsesController = FeedbackResponsesController;
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)('superuser', 'admin', 'dean', 'hod', 'faculty', 'student'),
    (0, swagger_1.ApiOperation)({ summary: 'List feedback responses (filterable by cycle/course/student/faculty)' }),
    (0, swagger_1.ApiQuery)({ name: 'cycleId', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'courseId', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'studentId', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'facultyId', required: false }),
    __param(0, (0, common_1.Query)('cycleId')),
    __param(1, (0, common_1.Query)('courseId')),
    __param(2, (0, common_1.Query)('studentId')),
    __param(3, (0, common_1.Query)('facultyId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", void 0)
], FeedbackResponsesController.prototype, "findAll", null);
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)('student'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, swagger_1.ApiOperation)({ summary: 'Submit feedback (student only)' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [feedback_response_dto_1.SubmitFeedbackDto]),
    __metadata("design:returntype", void 0)
], FeedbackResponsesController.prototype, "submit", null);
__decorate([
    (0, common_1.Get)('summary/:courseId'),
    (0, roles_decorator_1.Roles)('superuser', 'admin', 'dean', 'hod', 'faculty'),
    (0, swagger_1.ApiOperation)({ summary: 'Get aggregated feedback summary for a course' }),
    (0, swagger_1.ApiQuery)({ name: 'cycleId', required: false }),
    __param(0, (0, common_1.Param)('courseId')),
    __param(1, (0, common_1.Query)('cycleId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], FeedbackResponsesController.prototype, "getSummary", null);
__decorate([
    (0, common_1.Get)('check'),
    (0, roles_decorator_1.Roles)('student'),
    (0, swagger_1.ApiOperation)({ summary: 'Check if student has submitted feedback for a course+cycle' }),
    (0, swagger_1.ApiQuery)({ name: 'courseId', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'studentId', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'cycleId', required: true }),
    __param(0, (0, common_1.Query)('courseId')),
    __param(1, (0, common_1.Query)('studentId')),
    __param(2, (0, common_1.Query)('cycleId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], FeedbackResponsesController.prototype, "checkSubmitted", null);
exports.FeedbackResponsesController = FeedbackResponsesController = __decorate([
    (0, swagger_1.ApiTags)('Feedback Responses'),
    (0, swagger_1.ApiHeader)({ name: 'x-role', description: 'Caller role for RBAC', required: true }),
    (0, common_1.UseGuards)(role_guard_1.RoleGuard),
    (0, common_1.Controller)('feedback-responses'),
    __metadata("design:paramtypes", [feedback_responses_service_1.FeedbackResponsesService])
], FeedbackResponsesController);
//# sourceMappingURL=feedback-responses.controller.js.map