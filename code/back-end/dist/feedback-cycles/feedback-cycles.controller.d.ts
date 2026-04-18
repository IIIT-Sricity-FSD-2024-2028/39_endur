import { FeedbackCyclesService } from './feedback-cycles.service';
import { CreateFeedbackCycleDto, UpdateFeedbackCycleDto, UpdateCycleStatusDto } from './dto/feedback-cycle.dto';
export declare class FeedbackCyclesController {
    private readonly svc;
    constructor(svc: FeedbackCyclesService);
    findAll(): any[];
    findActive(): any[];
    getCycleState(): any;
    findOne(id: string): any;
    create(dto: CreateFeedbackCycleDto, req: any): {
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
    update(id: string, dto: UpdateFeedbackCycleDto, req: any): any;
    updateStatus(id: string, dto: UpdateCycleStatusDto, req: any): any;
    remove(id: string, req: any): {
        message: string;
    };
}
