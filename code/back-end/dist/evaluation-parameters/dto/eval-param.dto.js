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
exports.BulkImportEvalParamsDto = exports.UpdateEvalParamDto = exports.CreateEvalParamDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class CreateEvalParamDto {
    name;
    description;
    category;
    weight;
    type;
    department;
}
exports.CreateEvalParamDto = CreateEvalParamDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Teaching Clarity' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateEvalParamDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Measures how clearly the faculty explains concepts.' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateEvalParamDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'Pedagogy' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateEvalParamDto.prototype, "category", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 25, description: 'Weight percentage (0-100)' }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(100),
    __metadata("design:type", Number)
], CreateEvalParamDto.prototype, "weight", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'rating', enum: ['rating', 'text'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateEvalParamDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Computer Science', description: 'Department this parameter belongs to' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateEvalParamDto.prototype, "department", void 0);
class UpdateEvalParamDto {
    name;
    description;
    category;
    weight;
    status;
}
exports.UpdateEvalParamDto = UpdateEvalParamDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateEvalParamDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateEvalParamDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateEvalParamDto.prototype, "category", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(100),
    __metadata("design:type", Number)
], UpdateEvalParamDto.prototype, "weight", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateEvalParamDto.prototype, "status", void 0);
class BulkImportEvalParamsDto {
    params;
}
exports.BulkImportEvalParamsDto = BulkImportEvalParamsDto;
__decorate([
    (0, swagger_1.ApiProperty)({ type: [CreateEvalParamDto] }),
    (0, class_validator_1.IsArray)(),
    __metadata("design:type", Array)
], BulkImportEvalParamsDto.prototype, "params", void 0);
//# sourceMappingURL=eval-param.dto.js.map