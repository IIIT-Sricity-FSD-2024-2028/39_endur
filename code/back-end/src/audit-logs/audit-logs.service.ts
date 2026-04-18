import { Injectable } from '@nestjs/common';
import { DataStoreService } from '../seed/data-store.service';

@Injectable()
export class AuditLogsService {
  constructor(private readonly store: DataStoreService) {}

  findAll(page = 1, limit = 50, module?: string, actor?: string) {
    let logs = this.store.getAuditLogs();
    if (module) logs = logs.filter((l) => l.module.toLowerCase().includes(module.toLowerCase()));
    if (actor) logs = logs.filter((l) => l.actor === actor || l.actorName?.toLowerCase().includes(actor.toLowerCase()));

    const total = logs.length;
    const start = (page - 1) * limit;
    const data = logs.slice(start, start + limit);

    return { total, page, limit, data };
  }
}
