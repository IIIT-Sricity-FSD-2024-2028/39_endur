export declare class SubmitSelfReflectionDto {
    facultyId: string;
    courseId: string;
    cycleId: string;
    expectedRatings: Record<string, number>;
    reflectionText: string;
}
export declare class SubmitActionReportDto {
    facultyId: string;
    courseId: string;
    cycleId: string;
    rootCause: string;
    plannedStrategies: string;
    timeline: string;
}
export declare class ReviewCheckinDto {
    status: string;
    hodNotes?: string;
    hodOutcomes?: string;
}
