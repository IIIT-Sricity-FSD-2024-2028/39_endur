import { DataStoreService } from '../seed/data-store.service';
import { SubmitFeedbackDto } from './dto/feedback-response.dto';
export declare class FeedbackResponsesService {
    private readonly store;
    constructor(store: DataStoreService);
    findAll(cycleId?: string, courseId?: string, studentId?: string, facultyId?: string): any[];
    submit(dto: SubmitFeedbackDto): {
        responseId: string;
        cycleId: string;
        studentId: string;
        studentDepartment: any;
        courseId: string;
        facultyId: string | null;
        ratings: {
            paramId: string;
            paramName: string;
            weight: number;
            score: number | null;
            comment: string;
        }[];
        submittedAt: string;
    };
    getSummary(courseId: string, cycleId?: string): {
        courseId: string;
        cycleId: string | undefined;
        totalResponses: number;
        averageRatings: {
            paramId: string;
            paramName: string;
            weight: number;
            averageScore: number;
        }[];
        comments: {
            paramId: string;
            paramName: string;
            comment: string;
        }[];
    };
    checkSubmitted(courseId: string, studentId: string, cycleId: string): {
        submitted: boolean;
    };
}
