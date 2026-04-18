import { Injectable, ConflictException } from '@nestjs/common';
import { DataStoreService } from '../seed/data-store.service';
import { SubmitFeedbackDto } from './dto/feedback-response.dto';

@Injectable()
export class FeedbackResponsesService {
  constructor(private readonly store: DataStoreService) {}

  findAll(cycleId?: string, courseId?: string, studentId?: string) {
    let responses = this.store.getFeedbackResponses();
    if (cycleId) responses = responses.filter((r) => r.cycleId === cycleId);
    if (courseId) responses = responses.filter((r) => r.courseId === courseId);
    if (studentId) responses = responses.filter((r) => r.studentId === studentId);
    return responses;
  }

  submit(dto: SubmitFeedbackDto) {
    const responses = this.store.getFeedbackResponses();
    const existing = responses.find(
      (r) => r.cycleId === dto.cycleId && r.courseId === dto.courseId && r.studentId === dto.studentId && (r.facultyId === dto.facultyId || !dto.facultyId),
    );
    if (existing) {
      throw new ConflictException('Feedback already submitted for this course in this cycle');
    }

    const course = this.store.getCourses().find(c => c.id === dto.courseId);
    const department = course ? course.department : 'Unassigned';
    
    const cycle = this.store.getFeedbackCycles().find(c => c.cycleId === dto.cycleId);
    let enrichedRatings: any[] = [];
    
    if (cycle && cycle.departmentParameters && dto.ratings) {
       const params = cycle.departmentParameters[department] || cycle.departmentParameters['Unassigned'] || [];
       Object.entries(dto.ratings).forEach(([key, score]) => {
           const pDef = params.find(p => p.id === key);
           enrichedRatings.push({
               id: key,
               name: pDef ? pDef.name : key,
               weight: pDef ? pDef.weight : 25,
               score: Number(score)
           });
       });
    }

    const entry = {
      id: this.store.genId('FR'),
      ...dto,
      ratings: enrichedRatings.length > 0 ? enrichedRatings : dto.ratings,
      submittedAt: new Date().toISOString(),
    };
    responses.push(entry);
    this.store.setFeedbackResponses(responses);
    return entry;
  }

  getSummary(courseId: string, cycleId?: string) {
    let responses = this.store.getFeedbackResponses().filter((r) => r.courseId === courseId);
    if (cycleId) responses = responses.filter((r) => r.cycleId === cycleId);

    if (!responses.length) {
      return { courseId, cycleId, totalResponses: 0, averageRatings: {}, comments: [] };
    }

    // Aggregate ratings
    const ratingTotals: Record<string, { sum: number; count: number }> = {};
    const comments: string[] = [];

    responses.forEach((r) => {
      if (r.ratings) {
        Object.entries(r.ratings as Record<string, number>).forEach(([paramId, score]) => {
          if (!ratingTotals[paramId]) ratingTotals[paramId] = { sum: 0, count: 0 };
          ratingTotals[paramId].sum += score;
          ratingTotals[paramId].count += 1;
        });
      }
      if (r.openEndedComment) comments.push(r.openEndedComment);
    });

    const averageRatings: Record<string, number> = {};
    Object.entries(ratingTotals).forEach(([paramId, { sum, count }]) => {
      averageRatings[paramId] = Math.round((sum / count) * 10) / 10;
    });

    return {
      courseId,
      cycleId,
      totalResponses: responses.length,
      averageRatings,
      comments,
    };
  }

  checkSubmitted(courseId: string, studentId: string, cycleId: string) {
    const done = this.store
      .getFeedbackResponses()
      .some((r) => r.courseId === courseId && r.studentId === studentId && r.cycleId === cycleId);
    return { submitted: done };
  }
}
