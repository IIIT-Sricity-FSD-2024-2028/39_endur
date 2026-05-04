import { AuditLogsService } from './audit-logs.service';
export declare class AuditLogsController {
    private readonly svc;
    constructor(svc: AuditLogsService);
    findAll(page?: number, limit?: number, module?: string, actor?: string): {
        total: number;
        page: number;
        limit: number;
        data: import("../seed/data-store.service").AuditLog[];
    };
    create(body: any, req: any): {
        message: string;
    };
}
