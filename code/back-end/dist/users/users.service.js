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
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const seed_service_1 = require("../seed/seed.service");
const data_store_service_1 = require("../seed/data-store.service");
let UsersService = class UsersService {
    seedService;
    store;
    constructor(seedService, store) {
        this.seedService = seedService;
        this.store = store;
    }
    findAll(role, department) {
        let users = this.seedService.getUsers();
        if (role)
            users = users.filter((u) => u.role === role);
        if (department)
            users = users.filter((u) => u.department === department);
        return users.map(({ password: _, ...u }) => u);
    }
    findOne(id) {
        const user = this.seedService.getUsers().find((u) => u.id === id);
        if (!user)
            throw new common_1.NotFoundException(`User ${id} not found`);
        const { password: _, ...safe } = user;
        return safe;
    }
    findOneWithPassword(id) {
        return this.seedService.getUsers().find((u) => u.id === id);
    }
    create(dto) {
        const users = this.seedService.getUsers();
        if (users.find((u) => u.id === dto.id)) {
            throw new common_1.ConflictException(`User with ID ${dto.id} already exists`);
        }
        users.push({ ...dto });
        this.seedService.setUsers(users);
        this.store.appendAuditLog({
            actor: 'SU001',
            actorName: 'Super User',
            actorRole: 'superuser',
            action: 'CREATE',
            module: 'Users',
            target: `${dto.id} — ${dto.name}`,
            details: `New ${dto.role} account created for ${dto.department || 'N/A'} department.`,
        });
        const { password: _, ...safe } = dto;
        return safe;
    }
    bulkCreate(users, actorId, actorName) {
        const existing = this.seedService.getUsers();
        const success = [];
        const failed = [];
        for (const dto of users) {
            if (existing.find((u) => u.id === dto.id)) {
                failed.push({ user: dto, reason: `ID ${dto.id} already exists` });
                continue;
            }
            existing.push({ ...dto });
            const { password: _, ...safe } = dto;
            success.push(safe);
        }
        this.seedService.setUsers(existing);
        if (success.length > 0) {
            this.store.appendAuditLog({
                actor: actorId || 'SU001',
                actorName: actorName || 'Super User',
                actorRole: 'superuser',
                action: 'BULK_CREATE',
                module: 'Users',
                target: `${success.length} users`,
                details: `Bulk import: ${success.length} created, ${failed.length} failed.`,
            });
        }
        return { success, failed, total: users.length };
    }
    update(id, dto, actorId, actorName, actorRole) {
        const users = this.seedService.getUsers();
        const idx = users.findIndex((u) => u.id === id);
        if (idx === -1)
            throw new common_1.NotFoundException(`User ${id} not found`);
        if (id === 'SU001' && actorId !== 'SU001') {
            throw new common_1.BadRequestException('Cannot modify the superuser account');
        }
        if (actorRole !== 'superuser' && actorRole !== 'admin' && actorId !== id) {
            throw new common_1.ForbiddenException('You can only update your own profile');
        }
        if (dto.password && actorRole !== 'superuser' && actorRole !== 'admin') {
            if (!dto.currentPassword) {
                throw new common_1.BadRequestException('Current password is required to set a new one');
            }
            if (dto.currentPassword !== users[idx].password) {
                throw new common_1.BadRequestException('Incorrect current password');
            }
        }
        if (actorRole !== 'superuser' && actorRole !== 'admin') {
            delete dto.role;
            delete dto.department;
            delete dto.enrolledCourses;
            delete dto.currentPassword;
        }
        users[idx] = { ...users[idx], ...dto };
        this.seedService.setUsers(users);
        this.store.appendAuditLog({
            actor: actorId || 'SU001',
            actorName: actorName || 'Super User',
            actorRole: actorRole || 'superuser',
            action: 'UPDATE',
            module: 'Users',
            target: `${id} — ${users[idx].name}`,
            details: actorId === id ? 'User updated their own profile.' : 'User details updated by administrator.',
        });
        const { password: _, ...safe } = users[idx];
        return safe;
    }
    remove(id, actorId, actorName) {
        if (id === 'SU001') {
            throw new common_1.BadRequestException('Cannot delete the superuser account');
        }
        const users = this.seedService.getUsers();
        const user = users.find((u) => u.id === id);
        if (!user)
            throw new common_1.NotFoundException(`User ${id} not found`);
        this.seedService.setUsers(users.filter((u) => u.id !== id));
        this.store.appendAuditLog({
            actor: actorId || 'SU001',
            actorName: actorName || 'Super User',
            actorRole: 'superuser',
            action: 'DELETE',
            module: 'Users',
            target: `${id} — ${user.name}`,
            details: 'User account removed.',
        });
        return { message: `User ${id} deleted` };
    }
    updateEnrollments(courseId, studentIds) {
        const users = this.seedService.getUsers();
        users.forEach((u) => {
            if (u.role !== 'student')
                return;
            let enrolled = u.enrolledCourses || [];
            if (studentIds.includes(u.id)) {
                if (!enrolled.includes(courseId))
                    enrolled.push(courseId);
            }
            else {
                enrolled = enrolled.filter((c) => c !== courseId);
            }
            u.enrolledCourses = enrolled;
        });
        this.seedService.setUsers(users);
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [seed_service_1.SeedService,
        data_store_service_1.DataStoreService])
], UsersService);
//# sourceMappingURL=users.service.js.map