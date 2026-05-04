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
exports.DepartmentsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const departments_service_1 = require("./departments.service");
const department_dto_1 = require("./dto/department.dto");
let DepartmentsController = class DepartmentsController {
    departmentsService;
    constructor(departmentsService) {
        this.departmentsService = departmentsService;
    }
    findAll() {
        return this.departmentsService.findAll();
    }
    bulkCreate(dtos, role, userId) {
        if (role !== 'superuser' && role !== 'admin') {
            throw new common_1.UnauthorizedException('Insufficient permissions');
        }
        const dummyActorName = 'Super User';
        return this.departmentsService.bulkCreate(dtos, userId, dummyActorName);
    }
    create(dto, role, userId) {
        if (role !== 'superuser' && role !== 'admin') {
            throw new common_1.UnauthorizedException('Insufficient permissions');
        }
        return this.departmentsService.create(dto, userId);
    }
    remove(id, role, userId) {
        if (role !== 'superuser' && role !== 'admin') {
            throw new common_1.UnauthorizedException('Insufficient permissions');
        }
        return this.departmentsService.remove(id, userId);
    }
};
exports.DepartmentsController = DepartmentsController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'List all departments' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], DepartmentsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Post)('bulk'),
    (0, swagger_1.ApiOperation)({ summary: 'Bulk create departments (superuser/admin only)' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Headers)('x-role')),
    __param(2, (0, common_1.Headers)('x-user-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Array, String, String]),
    __metadata("design:returntype", void 0)
], DepartmentsController.prototype, "bulkCreate", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create a single department (superuser/admin only)' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Headers)('x-role')),
    __param(2, (0, common_1.Headers)('x-user-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [department_dto_1.CreateDepartmentDto, String, String]),
    __metadata("design:returntype", void 0)
], DepartmentsController.prototype, "create", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete a department (superuser/admin only)' }),
    (0, swagger_1.ApiParam)({ name: 'id', example: 'DEPT-PHYSICS' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Headers)('x-role')),
    __param(2, (0, common_1.Headers)('x-user-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], DepartmentsController.prototype, "remove", null);
exports.DepartmentsController = DepartmentsController = __decorate([
    (0, swagger_1.ApiTags)('Departments'),
    (0, common_1.Controller)('departments'),
    __metadata("design:paramtypes", [departments_service_1.DepartmentsService])
], DepartmentsController);
//# sourceMappingURL=departments.controller.js.map