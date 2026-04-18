import { DataStoreService } from '../seed/data-store.service';
import { CreateFeedbackCycleDto, UpdateFeedbackCycleDto, UpdateCycleStatusDto } from './dto/feedback-cycle.dto';
export declare class FeedbackCyclesService {
    private readonly store;
    constructor(store: DataStoreService);
    findAll(): any[];
    findActive(): any[];
    findOne(id: string): any;
    getCycleState(): any;
    create(dto: CreateFeedbackCycleDto, actorId?: string, actorName?: string): {
        status: string;
        phase: string;
        cycleName: string;
        type?: string;
        startTimestamp: string;
        endTimestamp: string;
        reflectionDeadline?: string;
        actionReportDeadline?: string;
        cycleId: string;
    };
    update(id: string, dto: UpdateFeedbackCycleDto, actorId?: string, actorName?: string): any;
    updateStatus(id: string, dto: UpdateCycleStatusDto, actorId?: string, actorName?: string): any;
    remove(id: string, actorId?: string, actorName?: string): {
        message: string;
    };
}
