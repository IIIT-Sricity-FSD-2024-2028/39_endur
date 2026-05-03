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
    generateDefaultParameters() {
        const depts = this.store.getDepartments();
        const map = {};
        const defaultParams = [
            { id: 'delivery', name: 'Course Delivery & Clarity', weight: 25 },
            { id: 'relevance', name: 'Course Relevance', weight: 25 },
            { id: 'support', name: 'Faculty Support & Availability', weight: 25 },
            { id: 'assessment', name: 'Fairness of Assessments', weight: 25 },
        ];
        for (const d of depts) {
            map[d.id] = [...defaultParams];
        }
        map['Unassigned'] = [...defaultParams];
        return map;
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
        const activeParams = this.store.getActiveParameters();
        const depts = this.store.getDepartments();
        const finalParams = {};
        const defaultParams = [
            { id: 'delivery', name: 'Course Delivery & Clarity', weight: 25 },
            { id: 'relevance', name: 'Course Relevance', weight: 25 },
            { id: 'support', name: 'Faculty Support & Availability', weight: 25 },
            { id: 'assessment', name: 'Fairness of Assessments', weight: 25 },
        ];
        for (const d of depts) {
            if (activeParams[d.name]) {
                finalParams[d.name] = JSON.parse(JSON.stringify(activeParams[d.name]));
            }
            else if (activeParams[d.id]) {
                finalParams[d.name] = JSON.parse(JSON.stringify(activeParams[d.id]));
            }
            else {
                finalParams[d.name] = [...defaultParams];
            }
        }
        finalParams['Unassigned'] = [...defaultParams];
        const entry = {
            cycleId: this.store.genId('CYCLE'),
            ...dto,
            status: 'active',
            phase: 'PREPARATION',
            departmentParameters: finalParams
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
        if (dto.phase === 'STUDENT_FEEDBACK' && cycles[idx].phase === 'PREPARATION') {
            const activeParams = this.store.getActiveParameters();
            const depts = this.store.getDepartments();
            const finalParams = {};
            const defaultParams = [
                { id: 'delivery', name: 'Course Delivery & Clarity', weight: 25 },
                { id: 'relevance', name: 'Course Relevance', weight: 25 },
                { id: 'support', name: 'Faculty Support & Availability', weight: 25 },
                { id: 'assessment', name: 'Fairness of Assessments', weight: 25 },
            ];
            for (const d of depts) {
                if (activeParams[d.name]) {
                    finalParams[d.name] = JSON.parse(JSON.stringify(activeParams[d.name]));
                }
                else if (activeParams[d.id]) {
                    finalParams[d.name] = JSON.parse(JSON.stringify(activeParams[d.id]));
                }
                else {
                    finalParams[d.name] = [...defaultParams];
                }
            }
            finalParams['Unassigned'] = [...defaultParams];
            cycles[idx].departmentParameters = finalParams;
        }
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
            let params = null;
            try {
                params = dto.parametersJson ? JSON.parse(dto.parametersJson) : null;
            }
            catch (e) { }
            if (!params || typeof params !== 'object') {
                params = this.generateDefaultParameters();
            }
            const entry = { cycleId, ...dto, status: 'closed', phase: 'COMPLETED', departmentParameters: params };
            delete entry.responses;
            delete entry.parametersJson;
            cycles.unshift(entry);
            success.push(entry);
            if (dto.responses && Array.isArray(dto.responses)) {
                dto.responses.forEach(r => {
                    let enrichedRatings = [];
                    const course = this.store.getCourses().find(c => c.id === r.courseId);
                    const department = course ? course.department : 'Unassigned';
                    const activeParamsForCycle = params[department] || params['Unassigned'] || [];
                    if (Array.isArray(r.ratings)) {
                        enrichedRatings = r.ratings.map(rt => {
                            const pDef = activeParamsForCycle.find(p => p.id === rt.paramId);
                            let score = Number(rt.score);
                            if (score > 5)
                                score = score / 20;
                            return {
                                paramId: rt.paramId,
                                paramName: pDef ? pDef.name : rt.paramId,
                                weight: pDef ? pDef.weight : 25,
                                score: score,
                                comment: rt.comment ?? ''
                            };
                        });
                    }
                    else {
                        let rawRatings = {};
                        try {
                            rawRatings = r.ratingsJson ? JSON.parse(r.ratingsJson) : r.ratings || {};
                        }
                        catch (e) { }
                        Object.entries(rawRatings).forEach(([key, val]) => {
                            if (val === undefined || val === null || val === '')
                                return;
                            let score = Number(val);
                            if (isNaN(score))
                                return;
                            const pDef = activeParamsForCycle.find(p => p.id === key);
                            if (score > 5)
                                score = score / 20;
                            enrichedRatings.push({
                                paramId: key,
                                paramName: pDef ? pDef.name : key,
                                weight: pDef ? pDef.weight : 25,
                                score: score,
                                comment: r.openEndedComment || r.comments || ''
                            });
                        });
                    }
                    if (enrichedRatings.length === 0)
                        return;
                    responsesStore.push({
                        responseId: this.store.genId('RESP'),
                        cycleId: cycleId,
                        studentId: r.studentId || `ANON-${this.store.genId('')}`,
                        courseId: r.courseId,
                        facultyId: r.facultyId,
                        studentDepartment: department,
                        ratings: enrichedRatings,
                        submittedAt: r.submittedAt || new Date().toISOString()
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