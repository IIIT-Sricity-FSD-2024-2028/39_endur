import { Injectable, OnModuleInit } from '@nestjs/common';

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
export class DataStoreService implements OnModuleInit {
  // ─── In-Memory Stores ────────────────────────────────────────────
  private courses: any[] = [];
  private departments: any[] = [];
  private feedbackCycles: any[] = [];
  private evaluationParameters: any[] = [];
  private feedbackResponses: any[] = [];
  private auditLogs: AuditLog[] = [];
  private draftParameters: Record<string, any[]> = {};
  private activeParameters: Record<string, any[]> = {};
  private departmentConfigStatus: Record<string, string> = {};
  private departmentConfigNotes: Record<string, string> = {};
  private selfReflections: any[] = [];
  private actionReports: any[] = [];
  private reviewCheckins: any[] = [];
  private cycleState: any = { phase: 'PREPARATION' };
  private systemSettings: any = {};

  // ─── Lifecycle ───────────────────────────────────────────────────
  onModuleInit() {
    this._seedAll();
  }

  private _seedAll() {
    // ── Departments ────────────────────────────────────────────────
    this.departments = [];

    // ── Evaluation Parameters ──────────────────────────────────────
    this.evaluationParameters = [];
    this.activeParameters = {};
    this.departmentConfigStatus = {};

    // ── Courses (link faculty by ID) ───────────────────────────────
    this.courses = [];

    // ── Feedback Cycles ────────────────────────────────────────────
    this.feedbackCycles = [];

    // Active cycle state — currently in student feedback phase
    this.cycleState = {
      id: 'SETUP',
      cycleName: '',
      phase: 'PREPARATION',
      status: 'closed',
    };

    // ── Feedback Responses ─────────────────────────────────────────
    this.feedbackResponses = [];

    // ── Self-Reflections (for completed cycles only) ───────────────
    this.selfReflections = [];

    // ── Action Reports (for completed cycles — HOD reviewed) ───────
    this.actionReports = [];

    // ── System Settings ────────────────────────────────────────────
    this.systemSettings = {
      instName: 'IIIT Sricity',
      instCode: 'IIITS',
      acadYear: '2025–2026',
      semester: 'Odd Semester',
      domain: '@iiits.in',
      timezone: 'Asia/Kolkata (IST)',
      minResp: 5,
      scale: '1 – 5',
    };
  }

  // ─── Courses ─────────────────────────────────────────────────────
  getCourses() { return this.courses; }
  setCourses(c: any[]) { this.courses = c; }

  // ─── Departments ──────────────────────────────────────────────────
  getDepartments() { return this.departments; }
  setDepartments(d: any[]) { this.departments = d; }

  // ─── Feedback Cycles ─────────────────────────────────────────────
  getFeedbackCycles() { return this.feedbackCycles; }
  setFeedbackCycles(c: any[]) { this.feedbackCycles = c; }
  getCycleState() {
    const cycles = this.getFeedbackCycles();
    if (!cycles.length) return this.cycleState;

    const active = cycles.find(c => c.status === 'active');
    if (active) {
      const now = new Date();
      const studentDl = new Date(active.studentDeadline || active.endTimestamp || now);
      const phase = active.phase || (now < studentDl ? 'STUDENT_FEEDBACK' : 'FACULTY_REFLECTION');
      return { id: active.cycleId, cycleName: active.cycleName, phase, status: active.status };
    }

    const latest = [...cycles].sort((a, b) => new Date(b.startTimestamp).getTime() - new Date(a.startTimestamp).getTime())[0];
    return { 
      id: latest.cycleId, 
      cycleName: latest.cycleName, 
      phase: latest.phase || 'COMPLETED', 
      status: latest.status || 'closed' 
    };
  }
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
  getDeptConfigNotes() { return this.departmentConfigNotes; }
  setDeptConfigNotes(n: Record<string, string>) { this.departmentConfigNotes = n; }

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

  // ─── System Settings ─────────────────────────────────────────────
  getSystemSettings() { return this.systemSettings; }
  setSystemSettings(s: any) { this.systemSettings = { ...this.systemSettings, ...s }; }

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
