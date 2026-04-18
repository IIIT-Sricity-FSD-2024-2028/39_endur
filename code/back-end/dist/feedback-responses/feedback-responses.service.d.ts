import { DataStoreService } from '../seed/data-store.service';
import { SubmitFeedbackDto } from './dto/feedback-response.dto';
export declare class FeedbackResponsesService {
    private readonly store;
    constructor(store: DataStoreService);
    findAll(cycleId?: string, courseId?: string, studentId?: string): any[];
    submit(dto: SubmitFeedbackDto): {
        ratings: any[] | Record<string, number> | undefined;
        submittedAt: string;
        cycleId: string;
        courseId: string;
        studentId: string;
        facultyId?: string;
        openEndedComment?: string;
        id: string;
    };
    getSummary(courseId: string, cycleId?: string): {
        courseId: string;
        cycleId: string | undefined;
        totalResponses: number;
        averageRatings: Record<string, number>;
        comments: string[];
    };
    checkSubmitted(courseId: string, studentId: string, cycleId: string): {
        submitted: boolean;
    };
}
