"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeedbackCyclesModule = void 0;
const common_1 = require("@nestjs/common");
const feedback_cycles_controller_1 = require("./feedback-cycles.controller");
const feedback_cycles_service_1 = require("./feedback-cycles.service");
let FeedbackCyclesModule = class FeedbackCyclesModule {
};
exports.FeedbackCyclesModule = FeedbackCyclesModule;
exports.FeedbackCyclesModule = FeedbackCyclesModule = __decorate([
    (0, common_1.Module)({
        controllers: [feedback_cycles_controller_1.FeedbackCyclesController],
        providers: [feedback_cycles_service_1.FeedbackCyclesService],
        exports: [feedback_cycles_service_1.FeedbackCyclesService],
    })
], FeedbackCyclesModule);
//# sourceMappingURL=feedback-cycles.module.js.map