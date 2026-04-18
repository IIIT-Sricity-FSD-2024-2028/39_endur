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
exports.FeedbackCyclesService = void 0;
const common_1 = require("@nestjs/common");
const data_store_service_1 = require("../seed/data-store.service");
let FeedbackCyclesService = class FeedbackCyclesService {
    store;
    constructor(store) {
        this.store = store;
    }
    findAll() {
        return this.store.getFeedbackCycles();
    }
    findActive() {
        const cycles = this.store.getFeedbackCycles();
        return cycles.filter((c) => c.status === 'active');
    }
    findOne(id) {
        const cycle = this.store.getFeedbackCycles().find((c) => c.cycleId === id);
        if (!cycle)
            throw new common_1.NotFoundException(`Cycle ${id} not found`);
        return cycle;
    }
    getCycleState() {
        return this.store.getCycleState();
    }
    create(dto, actorId, actorName) {
        const cycles = this.store.getFeedbackCycles();
        const entry = {
            cycleId: this.store.genId('CYCLE'),
            ...dto,
            status: 'active',
            phase: 'PREPARATION',
        };
        cycles.unshift(entry);
        this.store.setFeedbackCycles(cycles);
        this.store.appendAuditLog({
            actor: actorId || 'SU001',
            actorName: actorName || 'Super User',
            actorRole: actorId ? 'admin' : 'superuser',
            action: 'CREATE',
            module: 'Feedback Cycles',
            target: `${entry.cycleId} — ${dto.cycleName}`,
            details: 'New feedback cycle created.',
        });
        return entry;
    }
    update(id, dto, actorId, actorName) {
        const cycles = this.store.getFeedbackCycles();
        const idx = cycles.findIndex((c) => c.cycleId === id);
        if (idx === -1)
            throw new common_1.NotFoundException(`Cycle ${id} not found`);
        cycles[idx] = { ...cycles[idx], ...dto };
        this.store.setFeedbackCycles(cycles);
        this.store.appendAuditLog({
            actor: actorId || 'SU001',
            actorName: actorName || 'Super User',
            actorRole: 'admin',
            action: 'UPDATE',
            module: 'Feedback Cycles',
            target: `${id} — ${cycles[idx].cycleName}`,
            details: 'Cycle details updated.',
        });
        return cycles[idx];
    }
    updateStatus(id, dto, actorId, actorName) {
        const cycles = this.store.getFeedbackCycles();
        const idx = cycles.findIndex((c) => c.cycleId === id);
        if (idx === -1)
            throw new common_1.NotFoundException(`Cycle ${id} not found`);
        cycles[idx].status = dto.status;
        if (dto.phase)
            cycles[idx].phase = dto.phase;
        this.store.setFeedbackCycles(cycles);
        if (dto.status === 'active' && dto.phase) {
            this.store.setCycleState({ id, phase: dto.phase, ...cycles[idx] });
        }
        else if (dto.status === 'closed') {
            const state = this.store.getCycleState();
            if (state?.id === id) {
                this.store.setCycleState({ ...state, status: 'closed', phase: 'COMPLETED' });
            }
        }
        this.store.appendAuditLog({
            actor: actorId || 'SU001',
            actorName: actorName || 'Super User',
            actorRole: 'admin',
            action: 'UPDATE',
            module: 'Feedback Cycles',
            target: `${id} — ${cycles[idx].cycleName}`,
            details: `Cycle status changed to '${dto.status}'.`,
        });
        return cycles[idx];
    }
    remove(id, actorId, actorName) {
        const cycles = this.store.getFeedbackCycles();
        const cycle = cycles.find((c) => c.cycleId === id);
        if (!cycle)
            throw new common_1.NotFoundException(`Cycle ${id} not found`);
        this.store.setFeedbackCycles(cycles.filter((c) => c.cycleId !== id));
        this.store.appendAuditLog({ actor: actorId || 'SU001', actorName: actorName || 'Super User', actorRole: 'admin', action: 'DELETE', module: 'Feedback Cycles', target: `${id} — ${cycle.cycleName}`, details: 'Cycle permanently deleted.' });
        return { message: `Cycle ${id} deleted` };
    }
    bulkCreate(cyclesToImport, actorId, actorName) {
        const cycles = this.store.getFeedbackCycles();
        const responsesStore = this.store.getFeedbackResponses();
        const success = [];
        const failed = [];
        cycles.forEach(c => { if (c.status === 'active')
            c.status = 'closed'; });
        for (const dto of cyclesToImport) {
            const cycleId = this.store.genId('CYCLE');
            const entry = { cycleId, ...dto, status: 'closed', phase: 'COMPLETED' };
            delete entry.responses;
            cycles.unshift(entry);
            success.push(entry);
            if (dto.responses && Array.isArray(dto.responses)) {
                dto.responses.forEach(r => {
                    responsesStore.push({
                        responseId: this.store.genId('RESP'),
                        cycleId: cycleId,
                        studentId: r.studentId || this.store.genId('ANON'),
                        courseId: r.courseId,
                        facultyId: r.facultyId,
                        ratings: r.ratingsJson ? JSON.parse(r.ratingsJson) : r.ratings || {},
                        comments: r.openEndedComment || r.comments || '',
                        submittedAt: new Date().toISOString()
                    });
                });
            }
        }
        this.store.setFeedbackCycles(cycles);
        this.store.setFeedbackResponses(responsesStore);
        if (success.length > 0) {
            this.store.appendAuditLog({ actor: actorId || 'SU001', actorName: actorName || 'Super User', actorRole: 'superuser', action: 'BULK_CREATE', module: 'Feedback Cycles', target: `${success.length} cycles`, details: `Bulk import: ${success.length} historical cycles imported.` });
        }
        return { success, failed, total: cyclesToImport.length };
    }
};
exports.FeedbackCyclesService = FeedbackCyclesService;
exports.FeedbackCyclesService = FeedbackCyclesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [data_store_service_1.DataStoreService])
], FeedbackCyclesService);
//# sourceMappingURL=feedback-cycles.service.js.map