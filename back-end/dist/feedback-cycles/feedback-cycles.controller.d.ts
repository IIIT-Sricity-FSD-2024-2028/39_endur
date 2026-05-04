import { FeedbackCyclesService } from './feedback-cycles.service';
import { CreateFeedbackCycleDto, UpdateFeedbackCycleDto, UpdateCycleStatusDto, BulkImportCyclesDto } from './dto/feedback-cycle.dto';
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
        departmentParameters: Record<string, any[]>;
        cycleName: string;
        type?: string;
        startTimestamp: string;
        endTimestamp: string;
        prepDeadline?: string;
        studentDeadline?: string;
        reflectionDeadline?: string;
        actionReportDeadline?: string;
        responses?: any[];
        parametersJson?: string;
        cycleId: string;
    };
    update(id: string, dto: UpdateFeedbackCycleDto, req: any): any;
    updateStatus(id: string, dto: UpdateCycleStatusDto, req: any): any;
    remove(id: string, req: any): {
        message: string;
    };
    bulkImport(dto: BulkImportCyclesDto, req: any): {
        success: any[];
        failed: {
            cycle: any;
            reason: string;
        }[];
        total: number;
    };
}
