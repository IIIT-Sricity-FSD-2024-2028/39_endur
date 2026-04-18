import { DataStoreService } from '../seed/data-store.service';
import { SubmitSelfReflectionDto, SubmitActionReportDto, ReviewCheckinDto } from './dto/faculty-report.dto';
export declare class FacultyReportsService {
    private readonly store;
    constructor(store: DataStoreService);
    findAllReflections(cycleId?: string, courseId?: string, facultyId?: string): any[];
    submitReflection(dto: SubmitSelfReflectionDto, actorId?: string, actorName?: string): {
        submissionDate: string;
        facultyId: string;
        courseId: string;
        cycleId: string;
        expectedRatings: Record<string, number>;
        reflectionText: string;
        reflectionId: string;
    };
    findAllActionReports(cycleId?: string, courseId?: string, facultyId?: string): any[];
    submitActionReport(dto: SubmitActionReportDto, actorId?: string, actorName?: string): any;
    reviewCheckin(reportId: string, dto: ReviewCheckinDto, actorId?: string, actorName?: string): any;
}
