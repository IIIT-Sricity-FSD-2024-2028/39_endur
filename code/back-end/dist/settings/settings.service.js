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
exports.SettingsService = void 0;
const common_1 = require("@nestjs/common");
const data_store_service_1 = require("../seed/data-store.service");
let SettingsService = class SettingsService {
    store;
    constructor(store) {
        this.store = store;
    }
    getSettings() {
        return this.store.getSystemSettings();
    }
    updateSettings(dto, actorId, actorName) {
        this.store.setSystemSettings(dto);
        this.store.appendAuditLog({
            actor: actorId || 'SU001',
            actorName: actorName || 'Super User',
            actorRole: 'superuser',
            action: 'UPDATE',
            module: 'Settings',
            target: 'Institution Config',
            details: 'Updated global system configuration.',
        });
        return this.store.getSystemSettings();
    }
};
exports.SettingsService = SettingsService;
exports.SettingsService = SettingsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [data_store_service_1.DataStoreService])
], SettingsService);
//# sourceMappingURL=settings.service.js.map