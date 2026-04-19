import { Injectable } from '@nestjs/common';
import { DataStoreService } from '../seed/data-store.service';

@Injectable()
export class SettingsService {
  constructor(private readonly store: DataStoreService) {}

  getSettings() {
    return this.store.getSystemSettings();
  }

  updateSettings(dto: any, actorId?: string, actorName?: string) {
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
}
