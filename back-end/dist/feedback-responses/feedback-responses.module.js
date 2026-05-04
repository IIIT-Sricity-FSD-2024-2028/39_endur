"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeedbackResponsesModule = void 0;
const common_1 = require("@nestjs/common");
const feedback_responses_controller_1 = require("./feedback-responses.controller");
const feedback_responses_service_1 = require("./feedback-responses.service");
let FeedbackResponsesModule = class FeedbackResponsesModule {
};
exports.FeedbackResponsesModule = FeedbackResponsesModule;
exports.FeedbackResponsesModule = FeedbackResponsesModule = __decorate([
    (0, common_1.Module)({
        controllers: [feedback_responses_controller_1.FeedbackResponsesController],
        providers: [feedback_responses_service_1.FeedbackResponsesService],
        exports: [feedback_responses_service_1.FeedbackResponsesService],
    })
], FeedbackResponsesModule);
//# sourceMappingURL=feedback-responses.module.js.map