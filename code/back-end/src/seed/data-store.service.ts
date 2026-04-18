import { Injectable } from '@nestjs/common';

export interface AuditLog {
  id: string;
  timestamp: string;
  actor: string;
  actorName: string;
  actorRole: string;
  action: string;
  module: string;
  target: string;
  details: string;
}

@Injectable()
export class DataStoreService {
  // ─── In-Memory Stores ────────────────────────────────────────────
  private courses: any[] = [];
  private feedbackCycles: any[] = [];
  private evaluationParameters: any[] = [];
  private feedbackResponses: any[] = [];
  private auditLogs: AuditLog[] = [];
  private draftParameters: Record<string, any[]> = {};
  private activeParameters: Record<string, any[]> = {};
  private departmentConfigStatus: Record<string, string> = {};
  private selfReflections: any[] = [];
  private actionReports: any[] = [];
  private reviewCheckins: any[] = [];
  private cycleState: any = { phase: 'COMPLETED' };

  // ─── Courses ─────────────────────────────────────────────────────
  getCourses() { return this.courses; }
  setCourses(c: any[]) { this.courses = c; }

  // ─── Feedback Cycles ─────────────────────────────────────────────
  getFeedbackCycles() { return this.feedbackCycles; }
  setFeedbackCycles(c: any[]) { this.feedbackCycles = c; }
  getCycleState() { return this.cycleState; }
  setCycleState(s: any) { this.cycleState = s; }

  // ─── Evaluation Parameters ───────────────────────────────────────
  getEvalParams() { return this.evaluationParameters; }
  setEvalParams(p: any[]) { this.evaluationParameters = p; }
  getDraftParameters() { return this.draftParameters; }
  setDraftParameters(d: Record<string, any[]>) { this.draftParameters = d; }
  getActiveParameters() { return this.activeParameters; }
  setActiveParameters(a: Record<string, any[]>) { this.activeParameters = a; }
  getDeptConfigStatus() { return this.departmentConfigStatus; }
  setDeptConfigStatus(s: Record<string, string>) { this.departmentConfigStatus = s; }

  // ─── Feedback Responses ──────────────────────────────────────────
  getFeedbackResponses() { return this.feedbackResponses; }
  setFeedbackResponses(r: any[]) { this.feedbackResponses = r; }

  // ─── Self Reflections ────────────────────────────────────────────
  getSelfReflections() { return this.selfReflections; }
  setSelfReflections(r: any[]) { this.selfReflections = r; }

  // ─── Action Reports ──────────────────────────────────────────────
  getActionReports() { return this.actionReports; }
  setActionReports(r: any[]) { this.actionReports = r; }

  // ─── Review Checkins ─────────────────────────────────────────────
  getReviewCheckins() { return this.reviewCheckins; }
  setReviewCheckins(r: any[]) { this.reviewCheckins = r; }

  // ─── Audit Logs ──────────────────────────────────────────────────
  getAuditLogs() { return this.auditLogs; }

  appendAuditLog(entry: Omit<AuditLog, 'id' | 'timestamp'>) {
    this.auditLogs.unshift({
      id: `LOG${Date.now().toString(36).toUpperCase()}`,
      timestamp: new Date().toISOString(),
      ...entry,
    });
  }

  genId(prefix = 'ID') {
    return `${prefix}${Date.now().toString(36).toUpperCase()}`;
  }
}
