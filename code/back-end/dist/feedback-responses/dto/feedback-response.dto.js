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
exports.SubmitFeedbackDto = exports.RatingEntryDto = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
const swagger_1 = require("@nestjs/swagger");
class RatingEntryDto {
    paramId;
    score;
    comment;
}
exports.RatingEntryDto = RatingEntryDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'EV101' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RatingEntryDto.prototype, "paramId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 5 }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], RatingEntryDto.prototype, "score", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Great explanation of concepts!' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RatingEntryDto.prototype, "comment", void 0);
class SubmitFeedbackDto {
    cycleId;
    courseId;
    studentId;
    studentDepartment;
    facultyId;
    ratings;
}
exports.SubmitFeedbackDto = SubmitFeedbackDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'CYC-101' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SubmitFeedbackDto.prototype, "cycleId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'CS101' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SubmitFeedbackDto.prototype, "courseId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'S001' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SubmitFeedbackDto.prototype, "studentId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'DEPT-CS' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SubmitFeedbackDto.prototype, "studentDepartment", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'F001' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], SubmitFeedbackDto.prototype, "facultyId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        type: [RatingEntryDto],
        example: [
            { paramId: 'EV101', score: 5, comment: 'Excellent!' },
            { paramId: 'EV102', score: 4, comment: 'Very relevant.' },
        ],
    }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => RatingEntryDto),
    __metadata("design:type", Array)
], SubmitFeedbackDto.prototype, "ratings", void 0);
//# sourceMappingURL=feedback-response.dto.js.map