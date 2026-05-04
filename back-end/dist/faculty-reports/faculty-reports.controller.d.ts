import { FacultyReportsService } from './faculty-reports.service';
import { SubmitSelfReflectionDto, SubmitActionReportDto, ReviewCheckinDto, TriggerActionReportDto } from './dto/faculty-report.dto';
export declare class FacultyReportsController {
    private readonly svc;
    constructor(svc: FacultyReportsService);
    findReflections(cycleId?: string, courseId?: string, facultyId?: string): any[];
    submitReflection(dto: SubmitSelfReflectionDto, req: any): {
        submissionDate: string;
        facultyId: string;
        courseId: string;
        cycleId: string;
        expectedRatings: Record<string, number>;
        reflectionText: string;
        reflectionId: string;
    };
    findActionReports(cycleId?: string, courseId?: string, facultyId?: string): any[];
    submitActionReport(dto: SubmitActionReportDto, req: any): any;
    triggerActionReport(dto: TriggerActionReportDto, req: any): any;
    reviewCheckin(id: string, dto: ReviewCheckinDto, req: any): any;
}
