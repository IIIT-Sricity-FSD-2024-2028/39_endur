import { DataStoreService } from '../seed/data-store.service';
export declare class AuditLogsService {
    private readonly store;
    constructor(store: DataStoreService);
    findAll(page?: number, limit?: number, module?: string, actor?: string): {
        total: number;
        page: number;
        limit: number;
        data: import("../seed/data-store.service").AuditLog[];
    };
}
