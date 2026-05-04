export declare class RatingEntryDto {
    paramId: string;
    score: number;
    comment?: string;
}
export declare class SubmitFeedbackDto {
    cycleId: string;
    courseId: string;
    studentId: string;
    studentDepartment?: string;
    facultyId?: string;
    ratings: RatingEntryDto[];
}
