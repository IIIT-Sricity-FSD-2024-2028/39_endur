import { DataStoreService, AuditLog } from '../seed/data-store.service';
export declare class AuditLogsService {
    private readonly store;
    constructor(store: DataStoreService);
    findAll(page?: number, limit?: number, module?: string, actor?: string): {
        total: number;
        page: number;
        limit: number;
        data: AuditLog[];
    };
    create(entry: Omit<AuditLog, 'id' | 'timestamp'>): {
        message: string;
    };
}
