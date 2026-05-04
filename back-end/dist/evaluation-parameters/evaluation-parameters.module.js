"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EvaluationParametersModule = void 0;
const common_1 = require("@nestjs/common");
const evaluation_parameters_controller_1 = require("./evaluation-parameters.controller");
const evaluation_parameters_service_1 = require("./evaluation-parameters.service");
let EvaluationParametersModule = class EvaluationParametersModule {
};
exports.EvaluationParametersModule = EvaluationParametersModule;
exports.EvaluationParametersModule = EvaluationParametersModule = __decorate([
    (0, common_1.Module)({
        controllers: [evaluation_parameters_controller_1.EvaluationParametersController],
        providers: [evaluation_parameters_service_1.EvaluationParametersService],
        exports: [evaluation_parameters_service_1.EvaluationParametersService],
    })
], EvaluationParametersModule);
//# sourceMappingURL=evaluation-parameters.module.js.map