"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SeedService = void 0;
const common_1 = require("@nestjs/common");
let SeedService = class SeedService {
    users = [];
    onModuleInit() {
        this.users = [
            {
                id: 'SU001',
                password: 'superuser123',
                name: 'SuperUser',
                role: 'superuser',
                department: 'System',
            },
        ];
    }
    getUsers() {
        return this.users;
    }
    setUsers(users) {
        this.users = users;
    }
};
exports.SeedService = SeedService;
exports.SeedService = SeedService = __decorate([
    (0, common_1.Injectable)()
], SeedService);
//# sourceMappingURL=seed.service.js.map