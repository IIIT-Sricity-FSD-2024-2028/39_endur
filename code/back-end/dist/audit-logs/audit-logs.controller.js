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
exports.AuditLogsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const audit_logs_service_1 = require("./audit-logs.service");
const role_guard_1 = require("../common/guards/role.guard");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
let AuditLogsController = class AuditLogsController {
    svc;
    constructor(svc) {
        this.svc = svc;
    }
    findAll(page, limit, module, actor) {
        return this.svc.findAll(Number(page) || 1, Number(limit) || 50, module, actor);
    }
    create(body, req) {
        return this.svc.create({
            actor: body.actor || req.headers['x-user-id'] || 'UNKNOWN',
            actorName: body.actorName || req.headers['x-user-name'] || 'Unknown',
            actorRole: body.actorRole || req.headers['x-role'] || 'unknown',
            action: body.action || 'LOG',
            module: body.module || 'General',
            target: body.target || '',
            details: body.details || '',
        });
    }
};
exports.AuditLogsController = AuditLogsController;
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)('superuser', 'admin'),
    (0, swagger_1.ApiOperation)({ summary: 'Get paginated audit logs (superuser/admin only)' }),
    (0, swagger_1.ApiQuery)({ name: 'page', required: false, type: Number, example: 1 }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number, example: 10 }),
    (0, swagger_1.ApiQuery)({ name: 'module', required: false, example: 'Courses' }),
    (0, swagger_1.ApiQuery)({ name: 'actor', required: false, example: 'SU001' }),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('module')),
    __param(3, (0, common_1.Query)('actor')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number, String, String]),
    __metadata("design:returntype", void 0)
], AuditLogsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)('superuser', 'admin', 'dean', 'hod', 'faculty', 'student'),
    (0, swagger_1.ApiOperation)({ summary: 'Create an audit log entry from the frontend' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AuditLogsController.prototype, "create", null);
exports.AuditLogsController = AuditLogsController = __decorate([
    (0, swagger_1.ApiTags)('Audit Logs'),
    (0, common_1.UseGuards)(role_guard_1.RoleGuard),
    (0, common_1.Controller)('audit-logs'),
    __metadata("design:paramtypes", [audit_logs_service_1.AuditLogsService])
], AuditLogsController);
//# sourceMappingURL=audit-logs.controller.js.map