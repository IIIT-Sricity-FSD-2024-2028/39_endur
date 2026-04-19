"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const seed_module_1 = require("./seed/seed.module");
const auth_module_1 = require("./auth/auth.module");
const users_module_1 = require("./users/users.module");
const courses_module_1 = require("./courses/courses.module");
const feedback_cycles_module_1 = require("./feedback-cycles/feedback-cycles.module");
const evaluation_parameters_module_1 = require("./evaluation-parameters/evaluation-parameters.module");
const feedback_responses_module_1 = require("./feedback-responses/feedback-responses.module");
const audit_logs_module_1 = require("./audit-logs/audit-logs.module");
const faculty_reports_module_1 = require("./faculty-reports/faculty-reports.module");
const departments_module_1 = require("./departments/departments.module");
const settings_module_1 = require("./settings/settings.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            seed_module_1.SeedModule,
            auth_module_1.AuthModule,
            users_module_1.UsersModule,
            courses_module_1.CoursesModule,
            feedback_cycles_module_1.FeedbackCyclesModule,
            evaluation_parameters_module_1.EvaluationParametersModule,
            feedback_responses_module_1.FeedbackResponsesModule,
            audit_logs_module_1.AuditLogsModule,
            faculty_reports_module_1.FacultyReportsModule,
            departments_module_1.DepartmentsModule,
            settings_module_1.SettingsModule,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map