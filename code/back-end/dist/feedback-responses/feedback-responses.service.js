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
exports.FeedbackResponsesService = void 0;
const common_1 = require("@nestjs/common");
const data_store_service_1 = require("../seed/data-store.service");
let FeedbackResponsesService = class FeedbackResponsesService {
    store;
    constructor(store) {
        this.store = store;
    }
    findAll(cycleId, courseId, studentId, facultyId) {
        let responses = this.store.getFeedbackResponses();
        if (cycleId)
            responses = responses.filter((r) => r.cycleId === cycleId);
        if (courseId)
            responses = responses.filter((r) => r.courseId === courseId);
        if (studentId)
            responses = responses.filter((r) => r.studentId === studentId);
        if (facultyId)
            responses = responses.filter((r) => r.facultyId === facultyId);
        return responses;
    }
    submit(dto) {
        const responses = this.store.getFeedbackResponses();
        const existing = responses.find((r) => r.cycleId === dto.cycleId &&
            r.courseId === dto.courseId &&
            r.studentId === dto.studentId &&
            (dto.facultyId ? r.facultyId === dto.facultyId : true));
        if (existing) {
            throw new common_1.ConflictException('Feedback already submitted for this course in this cycle');
        }
        const course = this.store.getCourses().find(c => c.id === dto.courseId);
        const department = course?.department || 'Unassigned';
        const cycle = this.store.getFeedbackCycles().find(c => c.cycleId === dto.cycleId);
        const paramLookup = new Map();
        if (cycle?.departmentParameters) {
            const deptParams = cycle.departmentParameters[department] ||
                cycle.departmentParameters['Unassigned'] ||
                Object.values(cycle.departmentParameters)[0] || [];
            deptParams.forEach((p) => paramLookup.set(p.id, { name: p.name, weight: p.weight ?? 25 }));
        }
        const enrichedRatings = (dto.ratings || []).map((r) => {
            const def = paramLookup.get(r.paramId);
            let rawScore = Number(r.score);
            const score = isNaN(rawScore) ? null : rawScore;
            return {
                paramId: r.paramId,
                paramName: def?.name ?? r.paramId,
                weight: def?.weight ?? 25,
                score: score,
                comment: r.comment ?? '',
            };
        }).filter(r => r.score !== null);
        const entry = {
            responseId: this.store.genId('RESP'),
            cycleId: dto.cycleId,
            studentId: dto.studentId,
            studentDepartment: dto.studentDepartment ?? department,
            courseId: dto.courseId,
            facultyId: dto.facultyId ?? null,
            ratings: enrichedRatings,
            submittedAt: new Date().toISOString(),
        };
        responses.push(entry);
        this.store.setFeedbackResponses(responses);
        return entry;
    }
    getSummary(courseId, cycleId) {
        let responses = this.store.getFeedbackResponses().filter((r) => r.courseId === courseId);
        if (cycleId)
            responses = responses.filter((r) => r.cycleId === cycleId);
        if (!responses.length) {
            return { courseId, cycleId, totalResponses: 0, averageRatings: [], comments: [] };
        }
        const totals = {};
        const comments = [];
        responses.forEach((r) => {
            if (!Array.isArray(r.ratings))
                return;
            r.ratings.forEach((entry) => {
                const key = entry.paramId;
                if (!totals[key])
                    totals[key] = { name: entry.paramName ?? key, sum: 0, count: 0, weight: entry.weight ?? 25 };
                totals[key].sum += Number(entry.score);
                totals[key].count += 1;
                if (entry.comment)
                    comments.push({ paramId: key, paramName: entry.paramName ?? key, comment: entry.comment });
            });
        });
        const averageRatings = Object.entries(totals).map(([paramId, { name, sum, count, weight }]) => ({
            paramId,
            paramName: name,
            weight,
            averageScore: Math.round((sum / count) * 10) / 10,
        }));
        return { courseId, cycleId, totalResponses: responses.length, averageRatings, comments };
    }
    checkSubmitted(courseId, studentId, cycleId) {
        const done = this.store
            .getFeedbackResponses()
            .some((r) => r.courseId === courseId && r.studentId === studentId && r.cycleId === cycleId);
        return { submitted: done };
    }
};
exports.FeedbackResponsesService = FeedbackResponsesService;
exports.FeedbackResponsesService = FeedbackResponsesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [data_store_service_1.DataStoreService])
], FeedbackResponsesService);
//# sourceMappingURL=feedback-responses.service.js.map