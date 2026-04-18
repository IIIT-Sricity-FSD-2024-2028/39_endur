import { FeedbackResponsesService } from './feedback-responses.service';
import { SubmitFeedbackDto } from './dto/feedback-response.dto';
export declare class FeedbackResponsesController {
    private readonly svc;
    constructor(svc: FeedbackResponsesService);
    findAll(cycleId?: string, courseId?: string, studentId?: string): any[];
    submit(dto: SubmitFeedbackDto): {
        submittedAt: string;
        cycleId: string;
        courseId: string;
        studentId: string;
        ratings?: Record<string, number>;
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
