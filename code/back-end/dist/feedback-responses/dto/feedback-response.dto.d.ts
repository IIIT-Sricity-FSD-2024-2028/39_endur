export declare class SubmitFeedbackDto {
    cycleId: string;
    courseId: string;
    studentId: string;
    facultyId?: string;
    ratings?: Record<string, number>;
    openEndedComment?: string;
}
