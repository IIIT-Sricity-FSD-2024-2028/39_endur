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
exports.DepartmentsService = void 0;
const common_1 = require("@nestjs/common");
const data_store_service_1 = require("../seed/data-store.service");
const seed_service_1 = require("../seed/seed.service");
let DepartmentsService = class DepartmentsService {
    store;
    seedService;
    constructor(store, seedService) {
        this.store = store;
        this.seedService = seedService;
    }
    findAll() {
        return this.store.getDepartments();
    }
    create(dto, actorId, actorName) {
        const departments = this.store.getDepartments();
        if (!dto.id || !dto.name) {
            throw new common_1.BadRequestException('Department id and name are required.');
        }
        if (departments.some(d => d.id === dto.id)) {
            throw new common_1.BadRequestException(`Department with id ${dto.id} already exists.`);
        }
        const newDept = { id: dto.id, name: dto.name };
        departments.push(newDept);
        this.store.setDepartments(departments);
        this.store.appendAuditLog({
            actor: actorId || 'SU001',
            actorName: actorName || 'Super User',
            actorRole: 'superuser',
            action: 'CREATE',
            module: 'Departments',
            target: dto.name,
            details: `Department created with ID ${dto.id}`,
        });
        return newDept;
    }
    remove(id, actorId, actorName) {
        const departments = this.store.getDepartments();
        const dept = departments.find(d => d.id === id);
        if (!dept) {
            throw new common_1.NotFoundException(`Department ${id} not found.`);
        }
        this.store.setDepartments(departments.filter(d => d.id !== id));
        const users = this.seedService.getUsers();
        let updatedUsers = false;
        users.forEach(u => {
            if (u.department === dept.name || u.department === id) {
                u.department = 'Unassigned';
                updatedUsers = true;
            }
        });
        if (updatedUsers)
            this.seedService.setUsers(users);
        const courses = this.store.getCourses();
        let updatedCourses = false;
        courses.forEach(c => {
            if (c.department === dept.name || c.department === id) {
                c.department = 'Unassigned';
                updatedCourses = true;
            }
        });
        if (updatedCourses)
            this.store.setCourses(courses);
        this.store.appendAuditLog({
            actor: actorId || 'SU001',
            actorName: actorName || 'Super User',
            actorRole: 'superuser',
            action: 'DELETE',
            module: 'Departments',
            target: dept.name,
            details: 'Department deleted',
        });
        return { message: 'Department deleted successfully' };
    }
    bulkCreate(dtos, actorId, actorName) {
        const departments = this.store.getDepartments();
        let newCount = 0;
        const added = [];
        for (const dto of dtos) {
            if (!dto.id || !dto.name)
                continue;
            if (!departments.some(d => d.id === dto.id)) {
                const newDept = { id: dto.id, name: dto.name };
                departments.push(newDept);
                added.push(newDept);
                newCount++;
            }
        }
        if (newCount > 0) {
            this.store.setDepartments(departments);
            this.store.appendAuditLog({
                actor: actorId || 'SU001',
                actorName: actorName || 'Super User',
                actorRole: 'superuser',
                action: 'CREATE',
                module: 'Departments',
                target: 'Bulk Import',
                details: `Bulk imported ${newCount} departments`,
            });
        }
        return { message: `Successfully imported ${newCount} new departments.`, added };
    }
};
exports.DepartmentsService = DepartmentsService;
exports.DepartmentsService = DepartmentsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [data_store_service_1.DataStoreService,
        seed_service_1.SeedService])
], DepartmentsService);
//# sourceMappingURL=departments.service.js.map