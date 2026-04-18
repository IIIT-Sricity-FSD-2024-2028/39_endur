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
exports.FeedbackCyclesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const feedback_cycles_service_1 = require("./feedback-cycles.service");
const feedback_cycle_dto_1 = require("./dto/feedback-cycle.dto");
const role_guard_1 = require("../common/guards/role.guard");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
let FeedbackCyclesController = class FeedbackCyclesController {
    svc;
    constructor(svc) {
        this.svc = svc;
    }
    findAll() { return this.svc.findAll(); }
    findActive() { return this.svc.findActive(); }
    getCycleState() { return this.svc.getCycleState(); }
    findOne(id) { return this.svc.findOne(id); }
    create(dto, req) {
        return this.svc.create(dto, req.headers['x-user-id'], req.headers['x-user-name']);
    }
    update(id, dto, req) {
        return this.svc.update(id, dto, req.headers['x-user-id'], req.headers['x-user-name']);
    }
    updateStatus(id, dto, req) {
        return this.svc.updateStatus(id, dto, req.headers['x-user-id'], req.headers['x-user-name']);
    }
    remove(id, req) {
        return this.svc.remove(id, req.headers['x-user-id'], req.headers['x-user-name']);
    }
    bulkImport(dto, req) {
        return this.svc.bulkCreate(dto.cycles, req.headers['x-user-id'], req.headers['x-user-name']);
    }
};
exports.FeedbackCyclesController = FeedbackCyclesController;
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)('superuser', 'admin', 'dean', 'hod', 'faculty', 'student'),
    (0, swagger_1.ApiOperation)({ summary: 'List all feedback cycles' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], FeedbackCyclesController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('active'),
    (0, roles_decorator_1.Roles)('superuser', 'admin', 'dean', 'hod', 'faculty', 'student'),
    (0, swagger_1.ApiOperation)({ summary: 'Get active feedback cycles' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], FeedbackCyclesController.prototype, "findActive", null);
__decorate([
    (0, common_1.Get)('state'),
    (0, roles_decorator_1.Roles)('superuser', 'admin', 'dean', 'hod', 'faculty', 'student'),
    (0, swagger_1.ApiOperation)({ summary: 'Get current global cycle state (phase info)' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], FeedbackCyclesController.prototype, "getCycleState", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, roles_decorator_1.Roles)('superuser', 'admin', 'dean', 'hod', 'faculty', 'student'),
    (0, swagger_1.ApiOperation)({ summary: 'Get a single feedback cycle by ID' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], FeedbackCyclesController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)('superuser', 'admin', 'dean'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, swagger_1.ApiOperation)({ summary: 'Create a feedback cycle (superuser/admin only)' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [feedback_cycle_dto_1.CreateFeedbackCycleDto, Object]),
    __metadata("design:returntype", void 0)
], FeedbackCyclesController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, roles_decorator_1.Roles)('superuser', 'admin', 'dean'),
    (0, swagger_1.ApiOperation)({ summary: 'Update a feedback cycle (superuser/admin only)' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, feedback_cycle_dto_1.UpdateFeedbackCycleDto, Object]),
    __metadata("design:returntype", void 0)
], FeedbackCyclesController.prototype, "update", null);
__decorate([
    (0, common_1.Patch)(':id/status'),
    (0, roles_decorator_1.Roles)('superuser', 'admin', 'dean'),
    (0, swagger_1.ApiOperation)({ summary: 'Update cycle status/phase (superuser/admin only)' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, feedback_cycle_dto_1.UpdateCycleStatusDto, Object]),
    __metadata("design:returntype", void 0)
], FeedbackCyclesController.prototype, "updateStatus", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, roles_decorator_1.Roles)('superuser', 'admin'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete a feedback cycle (superuser/admin only)' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], FeedbackCyclesController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)('bulk'),
    (0, roles_decorator_1.Roles)('superuser', 'admin'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, swagger_1.ApiOperation)({ summary: 'Bulk import historical feedback cycles (superuser/admin only)' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [feedback_cycle_dto_1.BulkImportCyclesDto, Object]),
    __metadata("design:returntype", void 0)
], FeedbackCyclesController.prototype, "bulkImport", null);
exports.FeedbackCyclesController = FeedbackCyclesController = __decorate([
    (0, swagger_1.ApiTags)('Feedback Cycles'),
    (0, swagger_1.ApiHeader)({ name: 'x-role', description: 'Caller role for RBAC', required: true }),
    (0, common_1.UseGuards)(role_guard_1.RoleGuard),
    (0, common_1.Controller)('feedback-cycles'),
    __metadata("design:paramtypes", [feedback_cycles_service_1.FeedbackCyclesService])
], FeedbackCyclesController);
//# sourceMappingURL=feedback-cycles.controller.js.map