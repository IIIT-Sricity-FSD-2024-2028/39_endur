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
exports.AuditLogsService = void 0;
const common_1 = require("@nestjs/common");
const data_store_service_1 = require("../seed/data-store.service");
let AuditLogsService = class AuditLogsService {
    store;
    constructor(store) {
        this.store = store;
    }
    findAll(page = 1, limit = 50, module, actor) {
        let logs = this.store.getAuditLogs();
        if (module)
            logs = logs.filter((l) => l.module.toLowerCase().includes(module.toLowerCase()));
        if (actor)
            logs = logs.filter((l) => l.actor === actor || l.actorName?.toLowerCase().includes(actor.toLowerCase()));
        const total = logs.length;
        const start = (page - 1) * limit;
        const data = logs.slice(start, start + limit);
        return { total, page, limit, data };
    }
};
exports.AuditLogsService = AuditLogsService;
exports.AuditLogsService = AuditLogsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [data_store_service_1.DataStoreService])
], AuditLogsService);
//# sourceMappingURL=audit-logs.service.js.map