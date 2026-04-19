import { DataStoreService } from '../seed/data-store.service';
export declare class SettingsService {
    private readonly store;
    constructor(store: DataStoreService);
    getSettings(): any;
    updateSettings(dto: any, actorId?: string, actorName?: string): any;
}
