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
exports.UpdateCycleStatusDto = exports.UpdateFeedbackCycleDto = exports.CreateFeedbackCycleDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class CreateFeedbackCycleDto {
    cycleName;
    type;
    startTimestamp;
    endTimestamp;
    reflectionDeadline;
    actionReportDeadline;
}
exports.CreateFeedbackCycleDto = CreateFeedbackCycleDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Week 5 Formative Feedback' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateFeedbackCycleDto.prototype, "cycleName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'weekly', enum: ['weekly', 'monthly', 'midterm', 'endterm'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateFeedbackCycleDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2026-04-20T00:00:00Z' }),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], CreateFeedbackCycleDto.prototype, "startTimestamp", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2026-04-26T23:59:59Z' }),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], CreateFeedbackCycleDto.prototype, "endTimestamp", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '2026-04-27T23:59:59Z' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], CreateFeedbackCycleDto.prototype, "reflectionDeadline", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '2026-04-29T23:59:59Z' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], CreateFeedbackCycleDto.prototype, "actionReportDeadline", void 0);
class UpdateFeedbackCycleDto {
    cycleName;
    type;
    startTimestamp;
    endTimestamp;
    reflectionDeadline;
    actionReportDeadline;
}
exports.UpdateFeedbackCycleDto = UpdateFeedbackCycleDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateFeedbackCycleDto.prototype, "cycleName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateFeedbackCycleDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], UpdateFeedbackCycleDto.prototype, "startTimestamp", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], UpdateFeedbackCycleDto.prototype, "endTimestamp", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], UpdateFeedbackCycleDto.prototype, "reflectionDeadline", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], UpdateFeedbackCycleDto.prototype, "actionReportDeadline", void 0);
class UpdateCycleStatusDto {
    status;
    phase;
}
exports.UpdateCycleStatusDto = UpdateCycleStatusDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'active', enum: ['active', 'closed', 'preparation'] }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateCycleStatusDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'STUDENT_FEEDBACK', description: 'Phase of the cycle' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateCycleStatusDto.prototype, "phase", void 0);
//# sourceMappingURL=feedback-cycle.dto.js.map