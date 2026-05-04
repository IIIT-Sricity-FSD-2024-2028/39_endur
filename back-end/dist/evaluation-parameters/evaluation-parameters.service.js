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
exports.EvaluationParametersService = void 0;
const common_1 = require("@nestjs/common");
const data_store_service_1 = require("../seed/data-store.service");
let EvaluationParametersService = class EvaluationParametersService {
    store;
    constructor(store) {
        this.store = store;
    }
    findAll(department) {
        const drafts = this.store.getDraftParameters();
        const statuses = this.store.getDeptConfigStatus();
        let flat = [];
        Object.entries(drafts).forEach(([dept, params]) => {
            params.forEach((p) => {
                flat.push({ ...p, department: dept, configStatus: statuses[dept] || 'DRAFT' });
            });
        });
        if (department)
            flat = flat.filter((p) => p.department === department);
        return flat;
    }
    getDeptStatus() {
        return this.store.getDeptConfigStatus();
    }
    getDeptNotes() {
        return this.store.getDeptConfigNotes();
    }
    getDraftsByDept(department) {
        const drafts = this.store.getDraftParameters();
        return drafts[department] || [];
    }
    ensurePreparationPhase() {
        const state = this.store.getCycleState();
        if (!state || state.id === 'SETUP') {
            throw new common_1.BadRequestException('No active evaluation cycle initialized.');
        }
        if (state.phase !== 'PREPARATION') {
            throw new common_1.BadRequestException(`Parameter modifications are only allowed in PREPARATION phase. Current phase: ${state.phase}`);
        }
    }
    create(dto, actorId, actorName, actorRole) {
        this.ensurePreparationPhase();
        const drafts = this.store.getDraftParameters();
        if (!drafts[dto.department])
            drafts[dto.department] = [];
        const entry = {
            id: this.store.genId('EP'),
            name: dto.name,
            description: dto.description || '',
            category: dto.category || '',
            weight: dto.weight,
            type: dto.type || 'rating',
        };
        drafts[dto.department].unshift(entry);
        this.store.setDraftParameters(drafts);
        this.store.appendAuditLog({
            actor: actorId || 'SU001',
            actorName: actorName || 'Super User',
            actorRole: actorRole || 'superuser',
            action: 'CREATE',
            module: 'Evaluation Parameters',
            target: `${dto.department} — ${dto.name}`,
            details: `New evaluation parameter created for ${dto.department}.`,
        });
        return { ...entry, department: dto.department };
    }
    update(id, department, dto, actorId, actorName) {
        this.ensurePreparationPhase();
        const drafts = this.store.getDraftParameters();
        if (!drafts[department])
            throw new common_1.NotFoundException(`No parameters found for ${department}`);
        const idx = drafts[department].findIndex((p) => p.id === id);
        if (idx === -1)
            throw new common_1.NotFoundException(`Parameter ${id} not found`);
        const updateData = Object.fromEntries(Object.entries(dto).filter(([_, v]) => v !== undefined));
        drafts[department][idx] = { ...drafts[department][idx], ...updateData };
        this.store.setDraftParameters(drafts);
        this.store.appendAuditLog({
            actor: actorId || 'SU001',
            actorName: actorName || 'Super User',
            actorRole: 'superuser',
            action: 'UPDATE',
            module: 'Evaluation Parameters',
            target: `${department} — ${drafts[department][idx].name}`,
            details: 'Parameter updated.',
        });
        return { ...drafts[department][idx], department };
    }
    remove(id, department, actorId, actorName) {
        this.ensurePreparationPhase();
        const drafts = this.store.getDraftParameters();
        if (!drafts[department])
            throw new common_1.NotFoundException(`No parameters found for ${department}`);
        const param = drafts[department].find((p) => p.id === id);
        if (!param)
            throw new common_1.NotFoundException(`Parameter ${id} not found`);
        drafts[department] = drafts[department].filter((p) => p.id !== id);
        this.store.setDraftParameters(drafts);
        this.store.appendAuditLog({
            actor: actorId || 'SU001',
            actorName: actorName || 'Super User',
            actorRole: 'hod',
            action: 'DELETE',
            module: 'Evaluation Parameters',
            target: `${department} — ${param.name}`,
            details: 'Parameter deleted.',
        });
        return { message: `Parameter ${id} deleted` };
    }
    revertToDraft(department, actorId, actorName) {
        this.ensurePreparationPhase();
        const statuses = this.store.getDeptConfigStatus();
        statuses[department] = 'DRAFT';
        this.store.setDeptConfigStatus(statuses);
        const notes = this.store.getDeptConfigNotes() || {};
        delete notes[department];
        this.store.setDeptConfigNotes(notes);
        this.store.appendAuditLog({
            actor: actorId || 'SU001',
            actorName: actorName || 'HOD',
            actorRole: 'hod',
            action: 'REVERT',
            module: 'Evaluation Parameters',
            target: `${department} Configuration`,
            details: 'Configuration reverted to DRAFT status for editing.',
        });
        return { message: `${department} parameters reverted to DRAFT`, status: 'DRAFT' };
    }
    approve(department, actorId, actorName) {
        const drafts = this.store.getDraftParameters();
        const deptParams = drafts[department] || [];
        const totalWeight = deptParams.reduce((sum, p) => sum + (p.weight || 0), 0);
        if (totalWeight !== 100) {
            throw new common_1.BadRequestException(`Cannot approve ${department}. Total weight is ${totalWeight}% but must be 100%.`);
        }
        const active = this.store.getActiveParameters();
        active[department] = deptParams;
        this.store.setActiveParameters(active);
        const statuses = this.store.getDeptConfigStatus();
        statuses[department] = 'APPROVED';
        this.store.setDeptConfigStatus(statuses);
        this.store.appendAuditLog({
            actor: actorId || 'SU001',
            actorName: actorName || 'Super User',
            actorRole: 'superuser',
            action: 'APPROVE',
            module: 'Evaluation Parameters',
            target: `${department} Configuration`,
            details: `Department evaluation parameters approved.`,
        });
        return { message: `${department} parameters approved`, params: deptParams };
    }
    submit(department, actorId, actorName) {
        this.ensurePreparationPhase();
        const statuses = this.store.getDeptConfigStatus();
        statuses[department] = 'SUBMITTED';
        this.store.setDeptConfigStatus(statuses);
        this.store.appendAuditLog({ actor: actorId || 'SU001', actorName: actorName || 'HOD', actorRole: 'hod', action: 'SUBMIT', module: 'Evaluation Parameters', target: `${department} Configuration`, details: `Department evaluation parameters submitted for approval.` });
        return { message: `${department} parameters submitted for approval` };
    }
    reject(department, note, actorId, actorName) {
        const statuses = this.store.getDeptConfigStatus();
        statuses[department] = 'REVISION_REQUESTED';
        this.store.setDeptConfigStatus(statuses);
        let notes = this.store.getDeptConfigNotes() || {};
        notes[department] = note || 'Please revise your configuration.';
        this.store.setDeptConfigNotes(notes);
        this.store.appendAuditLog({ actor: actorId || 'SU001', actorName: actorName || 'Dean', actorRole: 'dean', action: 'REVISE', module: 'Evaluation Parameters', target: `${department} Configuration`, details: `Revision requested: ${note}` });
        return { message: `Revision requested for ${department} parameters.` };
    }
    bulkCreate(paramsToImport, actorId, actorName) {
        const drafts = this.store.getDraftParameters();
        const success = [];
        const failed = [];
        for (const dto of paramsToImport) {
            if (!dto.department) {
                failed.push({ param: dto, reason: 'Missing department field' });
                continue;
            }
            if (!drafts[dto.department])
                drafts[dto.department] = [];
            const entry = { id: this.store.genId('EP'), name: dto.name, description: dto.description || '', category: dto.category || '', weight: dto.weight, type: dto.type || 'rating' };
            drafts[dto.department].push(entry);
            success.push({ ...entry, department: dto.department });
        }
        this.store.setDraftParameters(drafts);
        if (success.length > 0) {
            this.store.appendAuditLog({ actor: actorId || 'SU001', actorName: actorName || 'Super User', actorRole: 'superuser', action: 'BULK_CREATE', module: 'Evaluation Parameters', target: `${success.length} params`, details: `Bulk import: ${success.length} created, ${failed.length} failed.` });
        }
        return { success, failed, total: paramsToImport.length };
    }
};
exports.EvaluationParametersService = EvaluationParametersService;
exports.EvaluationParametersService = EvaluationParametersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [data_store_service_1.DataStoreService])
], EvaluationParametersService);
//# sourceMappingURL=evaluation-parameters.service.js.map