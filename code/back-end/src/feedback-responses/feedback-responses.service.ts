import { Injectable, ConflictException } from '@nestjs/common';
import { DataStoreService } from '../seed/data-store.service';
import { SubmitFeedbackDto } from './dto/feedback-response.dto';

@Injectable()
export class FeedbackResponsesService {
  constructor(private readonly store: DataStoreService) {}

  findAll(cycleId?: string, courseId?: string, studentId?: string, facultyId?: string) {
    let responses = this.store.getFeedbackResponses();
    if (cycleId)   responses = responses.filter((r) => r.cycleId   === cycleId);
    if (courseId)  responses = responses.filter((r) => r.courseId  === courseId);
    if (studentId) responses = responses.filter((r) => r.studentId === studentId);
    if (facultyId) responses = responses.filter((r) => r.facultyId === facultyId);
    return responses;
  }

  submit(dto: SubmitFeedbackDto) {
    const responses = this.store.getFeedbackResponses();

    // Duplicate check — one response per student/course/faculty/cycle combo
    const existing = responses.find(
      (r) =>
        r.cycleId    === dto.cycleId &&
        r.courseId   === dto.courseId &&
        r.studentId  === dto.studentId &&
        (dto.facultyId ? r.facultyId === dto.facultyId : true),
    );
    if (existing) {
      throw new ConflictException('Feedback already submitted for this course in this cycle');
    }

    // Resolve course + department for snapshot enrichment
    const course     = this.store.getCourses().find(c => c.id === dto.courseId);
    const department = course?.department || 'Unassigned';
    const cycle      = this.store.getFeedbackCycles().find(c => c.cycleId === dto.cycleId);

    // Build parameter name/weight lookup map from the cycle's departmentParameters
    const paramLookup: Map<string, { name: string; weight: number }> = new Map();
    if (cycle?.departmentParameters) {
      const deptParams: any[] =
        cycle.departmentParameters[department] ||
        cycle.departmentParameters['Unassigned'] ||
        Object.values(cycle.departmentParameters)[0] || [];
      deptParams.forEach((p: any) => paramLookup.set(p.id, { name: p.name, weight: p.weight ?? 25 }));
    }

    // Enrich ratings array — preserve comment, add name + weight snapshot
    const enrichedRatings = (dto.ratings || []).map((r) => {
      const def = paramLookup.get(r.paramId);
      return {
        paramId:   r.paramId,
        paramName: def?.name  ?? r.paramId,
        weight:    def?.weight ?? 25,
        score:     Number(r.score),
        comment:   r.comment ?? '',
      };
    });

    const entry = {
      responseId:        this.store.genId('RESP'),
      cycleId:           dto.cycleId,
      studentId:         dto.studentId,
      studentDepartment: dto.studentDepartment ?? department,
      courseId:          dto.courseId,
      facultyId:         dto.facultyId ?? null,
      ratings:           enrichedRatings,
      submittedAt:       new Date().toISOString(),
    };

    responses.push(entry);
    this.store.setFeedbackResponses(responses);
    return entry;
  }

  /** Aggregate stats for a course (used by faculty reports / HOD) */
  getSummary(courseId: string, cycleId?: string) {
    let responses = this.store.getFeedbackResponses().filter((r) => r.courseId === courseId);
    if (cycleId) responses = responses.filter((r) => r.cycleId === cycleId);

    if (!responses.length) {
      return { courseId, cycleId, totalResponses: 0, averageRatings: [], comments: [] };
    }

    // Collect per-param totals across all responses
    const totals: Record<string, { name: string; sum: number; count: number; weight: number }> = {};
    const comments: { paramId: string; paramName: string; comment: string }[] = [];

    responses.forEach((r) => {
      if (!Array.isArray(r.ratings)) return;
      r.ratings.forEach((entry: any) => {
        const key = entry.paramId;
        if (!totals[key]) totals[key] = { name: entry.paramName ?? key, sum: 0, count: 0, weight: entry.weight ?? 25 };
        totals[key].sum   += Number(entry.score);
        totals[key].count += 1;
        if (entry.comment) comments.push({ paramId: key, paramName: entry.paramName ?? key, comment: entry.comment });
      });
    });

    const averageRatings = Object.entries(totals).map(([paramId, { name, sum, count, weight }]) => ({
      paramId,
      paramName: name,
      weight,
      averageScore: Math.round((sum / count) * 10) / 10,
    }));

    return { courseId, cycleId, totalResponses: responses.length, averageRatings, comments };
  }

  checkSubmitted(courseId: string, studentId: string, cycleId: string) {
    const done = this.store
      .getFeedbackResponses()
      .some((r) => r.courseId === courseId && r.studentId === studentId && r.cycleId === cycleId);
    return { submitted: done };
  }
}
