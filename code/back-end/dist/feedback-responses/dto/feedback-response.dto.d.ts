export declare class SubmitFeedbackDto {
    cycleId: string;
    courseId: string;
    studentId: string;
    ratings?: Record<string, number>;
    openEndedComment?: string;
}
