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
exports.EvaluationParametersController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const evaluation_parameters_service_1 = require("./evaluation-parameters.service");
const eval_param_dto_1 = require("./dto/eval-param.dto");
const role_guard_1 = require("../common/guards/role.guard");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
let EvaluationParametersController = class EvaluationParametersController {
    svc;
    constructor(svc) {
        this.svc = svc;
    }
    findAll(dept) {
        return this.svc.findAll(dept);
    }
    getDeptStatus() {
        return this.svc.getDeptStatus();
    }
    getDraftsByDept(dept) {
        return this.svc.getDraftsByDept(dept);
    }
    create(dto, req) {
        return this.svc.create(dto, req.headers['x-user-id'], req.headers['x-user-name'], req.headers['x-role']);
    }
    update(id, dept, dto, req) {
        return this.svc.update(id, dept, dto, req.headers['x-user-id'], req.headers['x-user-name']);
    }
    remove(id, dept, req) {
        return this.svc.remove(id, dept, req.headers['x-user-id'], req.headers['x-user-name']);
    }
    approve(dept, req) {
        return this.svc.approve(dept, req.headers['x-user-id'], req.headers['x-user-name']);
    }
    submit(dept, req) {
        return this.svc.submit(dept, req.headers['x-user-id'], req.headers['x-user-name']);
    }
};
exports.EvaluationParametersController = EvaluationParametersController;
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)('superuser', 'admin', 'dean', 'hod', 'faculty', 'student'),
    (0, swagger_1.ApiOperation)({ summary: 'List all evaluation parameters (optionally filtered by department)' }),
    (0, swagger_1.ApiQuery)({ name: 'department', required: false }),
    __param(0, (0, common_1.Query)('department')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], EvaluationParametersController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('status'),
    (0, roles_decorator_1.Roles)('superuser', 'admin', 'dean', 'hod'),
    (0, swagger_1.ApiOperation)({ summary: 'Get department config status map' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], EvaluationParametersController.prototype, "getDeptStatus", null);
__decorate([
    (0, common_1.Get)('dept/:department'),
    (0, roles_decorator_1.Roles)('superuser', 'admin', 'dean', 'hod', 'faculty'),
    (0, swagger_1.ApiOperation)({ summary: 'Get draft parameters for a department' }),
    __param(0, (0, common_1.Param)('department')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], EvaluationParametersController.prototype, "getDraftsByDept", null);
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)('superuser', 'admin', 'hod'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, swagger_1.ApiOperation)({ summary: 'Create an evaluation parameter (superuser/admin/hod)' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [eval_param_dto_1.CreateEvalParamDto, Object]),
    __metadata("design:returntype", void 0)
], EvaluationParametersController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id/dept/:department'),
    (0, roles_decorator_1.Roles)('superuser', 'admin', 'hod'),
    (0, swagger_1.ApiOperation)({ summary: 'Update a parameter by ID and department' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('department')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, eval_param_dto_1.UpdateEvalParamDto, Object]),
    __metadata("design:returntype", void 0)
], EvaluationParametersController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id/dept/:department'),
    (0, roles_decorator_1.Roles)('superuser', 'admin'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete a parameter (superuser/admin only)' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('department')),
    __param(2, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], EvaluationParametersController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)('dept/:department/approve'),
    (0, roles_decorator_1.Roles)('superuser', 'dean'),
    (0, swagger_1.ApiOperation)({ summary: 'Approve dept params if total weight = 100% (superuser/dean only)' }),
    __param(0, (0, common_1.Param)('department')),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], EvaluationParametersController.prototype, "approve", null);
__decorate([
    (0, common_1.Post)('dept/:department/submit'),
    (0, roles_decorator_1.Roles)('hod'),
    (0, swagger_1.ApiOperation)({ summary: 'Submit dept params for approval (hod only)' }),
    __param(0, (0, common_1.Param)('department')),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], EvaluationParametersController.prototype, "submit", null);
exports.EvaluationParametersController = EvaluationParametersController = __decorate([
    (0, swagger_1.ApiTags)('Evaluation Parameters'),
    (0, swagger_1.ApiHeader)({ name: 'x-role', description: 'Caller role for RBAC', required: true }),
    (0, common_1.UseGuards)(role_guard_1.RoleGuard),
    (0, common_1.Controller)('evaluation-parameters'),
    __metadata("design:paramtypes", [evaluation_parameters_service_1.EvaluationParametersService])
], EvaluationParametersController);
//# sourceMappingURL=evaluation-parameters.controller.js.map