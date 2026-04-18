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
    findAll(cycleId, courseId, studentId) {
        let responses = this.store.getFeedbackResponses();
        if (cycleId)
            responses = responses.filter((r) => r.cycleId === cycleId);
        if (courseId)
            responses = responses.filter((r) => r.courseId === courseId);
        if (studentId)
            responses = responses.filter((r) => r.studentId === studentId);
        return responses;
    }
    submit(dto) {
        const responses = this.store.getFeedbackResponses();
        const existing = responses.find((r) => r.cycleId === dto.cycleId && r.courseId === dto.courseId && r.studentId === dto.studentId);
        if (existing) {
            throw new common_1.ConflictException('Feedback already submitted for this course in this cycle');
        }
        const entry = {
            id: this.store.genId('FR'),
            ...dto,
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
            return { courseId, cycleId, totalResponses: 0, averageRatings: {}, comments: [] };
        }
        const ratingTotals = {};
        const comments = [];
        responses.forEach((r) => {
            if (r.ratings) {
                Object.entries(r.ratings).forEach(([paramId, score]) => {
                    if (!ratingTotals[paramId])
                        ratingTotals[paramId] = { sum: 0, count: 0 };
                    ratingTotals[paramId].sum += score;
                    ratingTotals[paramId].count += 1;
                });
            }
            if (r.openEndedComment)
                comments.push(r.openEndedComment);
        });
        const averageRatings = {};
        Object.entries(ratingTotals).forEach(([paramId, { sum, count }]) => {
            averageRatings[paramId] = Math.round((sum / count) * 10) / 10;
        });
        return {
            courseId,
            cycleId,
            totalResponses: responses.length,
            averageRatings,
            comments,
        };
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