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
exports.FacultyReportsService = void 0;
const common_1 = require("@nestjs/common");
const data_store_service_1 = require("../seed/data-store.service");
let FacultyReportsService = class FacultyReportsService {
    store;
    constructor(store) {
        this.store = store;
    }
    findAllReflections(cycleId, courseId, facultyId) {
        let refs = this.store.getSelfReflections();
        if (cycleId)
            refs = refs.filter(r => r.cycleId === cycleId);
        if (courseId)
            refs = refs.filter(r => r.courseId === courseId);
        if (facultyId)
            refs = refs.filter(r => r.facultyId === facultyId);
        return refs;
    }
    submitReflection(dto, actorId, actorName) {
        const refs = this.store.getSelfReflections();
        const existingIdx = refs.findIndex(r => r.facultyId === dto.facultyId && r.courseId === dto.courseId && r.cycleId === dto.cycleId);
        const entry = { reflectionId: `REFL_${Date.now()}`, ...dto, submissionDate: new Date().toISOString() };
        if (existingIdx > -1) {
            entry.reflectionId = refs[existingIdx].reflectionId;
            refs[existingIdx] = entry;
        }
        else
            refs.push(entry);
        this.store.setSelfReflections(refs);
        this.store.appendAuditLog({ actor: actorId || dto.facultyId, actorName: actorName || 'Faculty', actorRole: 'faculty', action: existingIdx > -1 ? 'UPDATE' : 'CREATE', module: 'Self Reflections', target: `${dto.courseId} (Cycle: ${dto.cycleId})`, details: 'Self-reflection submitted.' });
        return entry;
    }
    findAllActionReports(cycleId, courseId, facultyId) {
        let reports = this.store.getActionReports();
        if (cycleId)
            reports = reports.filter(r => r.cycleId === cycleId);
        if (courseId)
            reports = reports.filter(r => r.courseId === courseId);
        if (facultyId)
            reports = reports.filter(r => r.facultyId === facultyId);
        return reports;
    }
    submitActionReport(dto, actorId, actorName) {
        const reports = this.store.getActionReports();
        const existingIdx = reports.findIndex(r => r.facultyId === dto.facultyId && r.courseId === dto.courseId && r.cycleId === dto.cycleId);
        const entry = { reportId: `ACT_${Date.now()}`, ...dto, status: 'SUBMITTED', hodNotes: '', hodOutcomes: '', submissionDate: new Date().toISOString() };
        if (existingIdx > -1) {
            entry.reportId = reports[existingIdx].reportId;
            entry.hodNotes = reports[existingIdx].hodNotes;
            entry.hodOutcomes = reports[existingIdx].hodOutcomes;
            reports[existingIdx] = entry;
        }
        else
            reports.push(entry);
        this.store.setActionReports(reports);
        this.store.appendAuditLog({ actor: actorId || dto.facultyId, actorName: actorName || 'Faculty', actorRole: 'faculty', action: existingIdx > -1 ? 'UPDATE' : 'CREATE', module: 'Action Reports', target: `${dto.courseId} (Cycle: ${dto.cycleId})`, details: 'Action report submitted.' });
        return entry;
    }
    markActionRequired(dto, actorId, actorName) {
        const reports = this.store.getActionReports();
        const existing = reports.find(r => r.facultyId === dto.facultyId && r.courseId === dto.courseId && r.cycleId === dto.cycleId);
        if (existing) {
            return existing;
        }
        const entry = {
            reportId: `ACT_${Date.now()}`,
            ...dto,
            status: 'REQUIRED',
            rootCause: '',
            plannedStrategies: '',
            timeline: '',
            hodNotes: '',
            hodOutcomes: '',
            submissionDate: null,
        };
        reports.push(entry);
        this.store.setActionReports(reports);
        this.store.appendAuditLog({
            actor: actorId || 'HOD',
            actorName: actorName || 'HOD',
            actorRole: 'hod',
            action: 'TRIGGER',
            module: 'Action Reports',
            target: `${dto.courseId} (Faculty: ${dto.facultyId})`,
            details: 'Action report explicitly required by HOD.',
        });
        return entry;
    }
    reviewCheckin(reportId, dto, actorId, actorName) {
        const reports = this.store.getActionReports();
        const idx = reports.findIndex(r => r.reportId === reportId);
        if (idx === -1)
            throw new common_1.NotFoundException(`Action Report ${reportId} not found`);
        if (dto.hodNotes !== undefined)
            reports[idx].hodNotes = dto.hodNotes;
        if (dto.hodOutcomes !== undefined)
            reports[idx].hodOutcomes = dto.hodOutcomes;
        reports[idx].status = dto.status;
        this.store.setActionReports(reports);
        this.store.appendAuditLog({ actor: actorId || 'HOD', actorName: actorName || 'HOD User', actorRole: 'hod', action: 'UPDATE', module: 'Review Check-ins', target: `${reports[idx].courseId} (Faculty: ${reports[idx].facultyId})`, details: `Check-in status updated to ${dto.status}.` });
        return reports[idx];
    }
};
exports.FacultyReportsService = FacultyReportsService;
exports.FacultyReportsService = FacultyReportsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [data_store_service_1.DataStoreService])
], FacultyReportsService);
//# sourceMappingURL=faculty-reports.service.js.map