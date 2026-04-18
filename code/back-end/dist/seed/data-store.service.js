"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataStoreService = void 0;
const common_1 = require("@nestjs/common");
let DataStoreService = class DataStoreService {
    courses = [];
    feedbackCycles = [];
    evaluationParameters = [];
    feedbackResponses = [];
    auditLogs = [];
    draftParameters = {};
    activeParameters = {};
    departmentConfigStatus = {};
    selfReflections = [];
    actionReports = [];
    reviewCheckins = [];
    cycleState = { phase: 'COMPLETED' };
    getCourses() { return this.courses; }
    setCourses(c) { this.courses = c; }
    getFeedbackCycles() { return this.feedbackCycles; }
    setFeedbackCycles(c) { this.feedbackCycles = c; }
    getCycleState() { return this.cycleState; }
    setCycleState(s) { this.cycleState = s; }
    getEvalParams() { return this.evaluationParameters; }
    setEvalParams(p) { this.evaluationParameters = p; }
    getDraftParameters() { return this.draftParameters; }
    setDraftParameters(d) { this.draftParameters = d; }
    getActiveParameters() { return this.activeParameters; }
    setActiveParameters(a) { this.activeParameters = a; }
    getDeptConfigStatus() { return this.departmentConfigStatus; }
    setDeptConfigStatus(s) { this.departmentConfigStatus = s; }
    getFeedbackResponses() { return this.feedbackResponses; }
    setFeedbackResponses(r) { this.feedbackResponses = r; }
    getSelfReflections() { return this.selfReflections; }
    setSelfReflections(r) { this.selfReflections = r; }
    getActionReports() { return this.actionReports; }
    setActionReports(r) { this.actionReports = r; }
    getReviewCheckins() { return this.reviewCheckins; }
    setReviewCheckins(r) { this.reviewCheckins = r; }
    getAuditLogs() { return this.auditLogs; }
    appendAuditLog(entry) {
        this.auditLogs.unshift({
            id: `LOG${Date.now().toString(36).toUpperCase()}`,
            timestamp: new Date().toISOString(),
            ...entry,
        });
    }
    genId(prefix = 'ID') {
        return `${prefix}${Date.now().toString(36).toUpperCase()}`;
    }
};
exports.DataStoreService = DataStoreService;
exports.DataStoreService = DataStoreService = __decorate([
    (0, common_1.Injectable)()
], DataStoreService);
//# sourceMappingURL=data-store.service.js.map