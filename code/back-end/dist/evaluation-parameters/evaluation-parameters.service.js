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
exports.EvaluationParametersService = void 0;
const common_1 = require("@nestjs/common");
const data_store_service_1 = require("../seed/data-store.service");
const eval_param_dto_1 = require("./dto/eval-param.dto");
let EvaluationParametersService = class EvaluationParametersService {
    store;
    constructor(store) {
        this.store = store;
    }
    findAll(department) {
        const drafts = this.store.getDraftParameters();
        const statuses = this.store.getDeptConfigStatus();
        let flat = [];
        Object.entries(drafts).forEach(([dept, params]) => {
            params.forEach((p) => {
                flat.push({ ...p, department: dept, configStatus: statuses[dept] || 'DRAFT' });
            });
        });
        if (department)
            flat = flat.filter((p) => p.department === department);
        return flat;
    }
    getDeptStatus() {
        return this.store.getDeptConfigStatus();
    }
    getDraftsByDept(department) {
        const drafts = this.store.getDraftParameters();
        return drafts[department] || [];
    }
    ensurePreparationPhase() {
        const state = this.store.getCycleState();
        if (!state || state.id === 'SETUP') {
            throw new common_1.BadRequestException('No active evaluation cycle initialized.');
        }
        if (state.phase !== 'PREPARATION') {
            throw new common_1.BadRequestException(`Parameter modifications are only allowed in PREPARATION phase. Current phase: ${state.phase}`);
        }
    }
    create(dto, actorId, actorName, actorRole) {
        this.ensurePreparationPhase();
        const drafts = this.store.getDraftParameters();
        update(id, string, department, string, dto, eval_param_dto_1.UpdateEvalParamDto, actorId ?  : string, actorName ?  : string);
        {
            this.ensurePreparationPhase();
            const drafts = this.store.getDraftParameters();
            remove(id, string, department, string, actorId ?  : string, actorName ?  : string);
            {
                this.ensurePreparationPhase();
                const drafts = this.store.getDraftParameters();
                revertToDraft(department, string, actorId ?  : string, actorName ?  : string);
                {
                    this.ensurePreparationPhase();
                    const statuses = this.store.getDeptConfigStatus();
                    submit(department, string, actorId ?  : string, actorName ?  : string);
                    {
                        this.ensurePreparationPhase();
                        const statuses = this.store.getDeptConfigStatus();
                        reject(department, string, note ?  : string, actorId ?  : string, actorName ?  : string);
                        {
                            const statuses = this.store.getDeptConfigStatus();
                            statuses[department] = 'REVISION_REQUESTED';
                            this.store.setDeptConfigStatus(statuses);
                            let notes = this.store.getDeptConfigNotes() || {};
                            notes[department] = note || 'Please revise your configuration.';
                            this.store.setDeptConfigNotes(notes);
                            this.store.appendAuditLog({ actor: actorId || 'SU001', actorName: actorName || 'Dean', actorRole: 'dean', action: 'REVISE', module: 'Evaluation Parameters', target: `${department} Configuration`, details: `Revision requested: ${note}` });
                            return { message: `Revision requested for ${department} parameters.` };
                        }
                        bulkCreate(paramsToImport, eval_param_dto_1.CreateEvalParamDto[], actorId ?  : string, actorName ?  : string);
                        {
                            const drafts = this.store.getDraftParameters();
                            const success = [];
                            const failed = [];
                            for (const dto of paramsToImport) {
                                if (!dto.department) {
                                    failed.push({ param: dto, reason: 'Missing department field' });
                                    continue;
                                }
                                if (!drafts[dto.department])
                                    drafts[dto.department] = [];
                                const entry = { id: this.store.genId('EP'), name: dto.name, description: dto.description || '', category: dto.category || '', weight: dto.weight, type: dto.type || 'rating' };
                                drafts[dto.department].push(entry);
                                success.push({ ...entry, department: dto.department });
                            }
                            this.store.setDraftParameters(drafts);
                            if (success.length > 0) {
                                this.store.appendAuditLog({ actor: actorId || 'SU001', actorName: actorName || 'Super User', actorRole: 'superuser', action: 'BULK_CREATE', module: 'Evaluation Parameters', target: `${success.length} params`, details: `Bulk import: ${success.length} created, ${failed.length} failed.` });
                            }
                            return { success, failed, total: paramsToImport.length };
                        }
                    }
                }
            }
        }
    }
};
exports.EvaluationParametersService = EvaluationParametersService;
exports.EvaluationParametersService = EvaluationParametersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [data_store_service_1.DataStoreService])
], EvaluationParametersService);
//# sourceMappingURL=evaluation-parameters.service.js.map