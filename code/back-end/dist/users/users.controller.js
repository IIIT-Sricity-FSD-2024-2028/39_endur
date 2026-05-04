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
exports.UsersController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const users_service_1 = require("./users.service");
const create_user_dto_1 = require("./dto/create-user.dto");
const update_user_dto_1 = require("./dto/update-user.dto");
const bulk_import_dto_1 = require("./dto/bulk-import.dto");
const role_guard_1 = require("../common/guards/role.guard");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
let UsersController = class UsersController {
    usersService;
    constructor(usersService) {
        this.usersService = usersService;
    }
    findAll(role, department) {
        return this.usersService.findAll(role, department);
    }
    getMe(req) {
        const userId = req.headers['x-user-id'];
        return this.usersService.findOne(userId);
    }
    getMyCourses(req) {
        const userId = req.headers['x-user-id'];
        return this.usersService.getEnrolledCourses(userId);
    }
    findOne(id) {
        return this.usersService.findOne(id);
    }
    create(dto) {
        return this.usersService.create(dto);
    }
    bulkImport(dto, req) {
        const actorId = req.headers['x-user-id'];
        const actorName = req.headers['x-user-name'];
        return this.usersService.bulkCreate(dto.users, actorId, actorName);
    }
    update(id, dto, req) {
        const actorId = req.headers['x-user-id'];
        const actorName = req.headers['x-user-name'];
        const actorRole = req.headers['x-role'];
        return this.usersService.update(id, dto, actorId, actorName, actorRole);
    }
    remove(id, req) {
        return this.usersService.remove(id, req.headers['x-user-id'], req.headers['x-user-name']);
    }
};
exports.UsersController = UsersController;
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)('superuser', 'admin', 'dean', 'hod'),
    (0, swagger_1.ApiOperation)({ summary: 'List all users (filterable by role / department)' }),
    (0, swagger_1.ApiQuery)({ name: 'role', required: false, example: 'student' }),
    (0, swagger_1.ApiQuery)({ name: 'department', required: false, example: 'Physics' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Array of user objects (no passwords)' }),
    __param(0, (0, common_1.Query)('role')),
    __param(1, (0, common_1.Query)('department')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('profile/me'),
    (0, roles_decorator_1.Roles)('superuser', 'admin', 'dean', 'hod', 'faculty', 'student'),
    (0, swagger_1.ApiOperation)({ summary: 'Get current logged in user profile' }),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "getMe", null);
__decorate([
    (0, common_1.Get)('me/courses'),
    (0, roles_decorator_1.Roles)('student'),
    (0, swagger_1.ApiOperation)({ summary: 'Get enrolled courses for the current student' }),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "getMyCourses", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, roles_decorator_1.Roles)('superuser', 'admin', 'dean', 'hod', 'faculty', 'student'),
    (0, swagger_1.ApiOperation)({ summary: 'Get a single user by ID' }),
    (0, swagger_1.ApiParam)({ name: 'id', example: 'U001' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'User object (no password)' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'User not found' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)('superuser'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, swagger_1.ApiOperation)({ summary: 'Create a single user (superuser only)' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Created user object' }),
    (0, swagger_1.ApiResponse)({ status: 409, description: 'User ID already exists' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_user_dto_1.CreateUserDto]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "create", null);
__decorate([
    (0, common_1.Post)('bulk'),
    (0, roles_decorator_1.Roles)('superuser'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, swagger_1.ApiOperation)({ summary: 'Bulk import users from JSON array (superuser only)' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: '{ success: [], failed: [], total: n }' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [bulk_import_dto_1.BulkImportDto, Object]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "bulkImport", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, roles_decorator_1.Roles)('superuser', 'admin', 'dean', 'hod', 'faculty', 'student'),
    (0, swagger_1.ApiOperation)({ summary: 'Update a user (restricted self-service for non-SU)' }),
    (0, swagger_1.ApiParam)({ name: 'id', example: 'U001' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Updated user object' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'User not found' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_user_dto_1.UpdateUserDto, Object]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, roles_decorator_1.Roles)('superuser'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete a user (superuser only)' }),
    (0, swagger_1.ApiParam)({ name: 'id', example: 'U001' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Deletion confirmation' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'User not found' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "remove", null);
exports.UsersController = UsersController = __decorate([
    (0, swagger_1.ApiTags)('Users'),
    (0, common_1.UseGuards)(role_guard_1.RoleGuard),
    (0, common_1.Controller)('users'),
    __metadata("design:paramtypes", [users_service_1.UsersService])
], UsersController);
//# sourceMappingURL=users.controller.js.map