import { Injectable, NotFoundException } from '@nestjs/common';
import { DataStoreService } from '../seed/data-store.service';
import { SubmitSelfReflectionDto, SubmitActionReportDto, ReviewCheckinDto, TriggerActionReportDto } from './dto/faculty-report.dto';

@Injectable()
export class FacultyReportsService {
  constructor(private readonly store: DataStoreService) {}

  findAllReflections(cycleId?: string, courseId?: string, facultyId?: string) {
    let refs = this.store.getSelfReflections();
    if (cycleId) refs = refs.filter(r => r.cycleId === cycleId);
    if (courseId) refs = refs.filter(r => r.courseId === courseId);
    if (facultyId) refs = refs.filter(r => r.facultyId === facultyId);
    return refs;
  }

  submitReflection(dto: SubmitSelfReflectionDto, actorId?: string, actorName?: string) {
    const refs = this.store.getSelfReflections();
    const existingIdx = refs.findIndex(r => r.facultyId === dto.facultyId && r.courseId === dto.courseId && r.cycleId === dto.cycleId);
    const entry = { reflectionId: `REFL_${Date.now()}`, ...dto, submissionDate: new Date().toISOString() };
    if (existingIdx > -1) { entry.reflectionId = refs[existingIdx].reflectionId; refs[existingIdx] = entry; }
    else refs.push(entry);
    this.store.setSelfReflections(refs);
    this.store.appendAuditLog({ actor: actorId || dto.facultyId, actorName: actorName || 'Faculty', actorRole: 'faculty', action: existingIdx > -1 ? 'UPDATE' : 'CREATE', module: 'Self Reflections', target: `${dto.courseId} (Cycle: ${dto.cycleId})`, details: 'Self-reflection submitted.' });
    return entry;
  }

  findAllActionReports(cycleId?: string, courseId?: string, facultyId?: string) {
    let reports = this.store.getActionReports();
    if (cycleId) reports = reports.filter(r => r.cycleId === cycleId);
    if (courseId) reports = reports.filter(r => r.courseId === courseId);
    if (facultyId) reports = reports.filter(r => r.facultyId === facultyId);
    return reports;
  }

  submitActionReport(dto: SubmitActionReportDto, actorId?: string, actorName?: string) {
    const reports = this.store.getActionReports();
    const existingIdx = reports.findIndex(r => r.facultyId === dto.facultyId && r.courseId === dto.courseId && r.cycleId === dto.cycleId);
    const entry: any = { reportId: `ACT_${Date.now()}`, ...dto, status: 'SUBMITTED', hodNotes: '', hodOutcomes: '', submissionDate: new Date().toISOString() };
    if (existingIdx > -1) {
      entry.reportId = reports[existingIdx].reportId;
      entry.hodNotes = reports[existingIdx].hodNotes;
      entry.hodOutcomes = reports[existingIdx].hodOutcomes;
      reports[existingIdx] = entry;
    } else reports.push(entry);
    this.store.setActionReports(reports);
    this.store.appendAuditLog({ actor: actorId || dto.facultyId, actorName: actorName || 'Faculty', actorRole: 'faculty', action: existingIdx > -1 ? 'UPDATE' : 'CREATE', module: 'Action Reports', target: `${dto.courseId} (Cycle: ${dto.cycleId})`, details: 'Action report submitted.' });
    return entry;
  }

  markActionRequired(dto: TriggerActionReportDto, actorId?: string, actorName?: string) {
    const reports = this.store.getActionReports();
    const existing = reports.find(r => r.facultyId === dto.facultyId && r.courseId === dto.courseId && r.cycleId === dto.cycleId);
    
    if (existing) {
      return existing; // Already exists or marked
    }

    const entry = {
      reportId: `ACT_${Date.now()}`,
      ...dto,
      status: 'REQUIRED',
      rootCause: '',
      plannedStrategies: '',
      timeline: '',
      hodNotes: '',
      hodOutcomes: '',
      submissionDate: null,
    };

    reports.push(entry);
    this.store.setActionReports(reports);

    this.store.appendAuditLog({
      actor: actorId || 'HOD',
      actorName: actorName || 'HOD',
      actorRole: 'hod',
      action: 'TRIGGER',
      module: 'Action Reports',
      target: `${dto.courseId} (Faculty: ${dto.facultyId})`,
      details: 'Action report explicitly required by HOD.',
    });

    return entry;
  }

  reviewCheckin(reportId: string, dto: ReviewCheckinDto, actorId?: string, actorName?: string) {
    const reports = this.store.getActionReports();
    const idx = reports.findIndex(r => r.reportId === reportId);
    if (idx === -1) throw new NotFoundException(`Action Report ${reportId} not found`);
    if (dto.hodNotes !== undefined) reports[idx].hodNotes = dto.hodNotes;
    if (dto.hodOutcomes !== undefined) reports[idx].hodOutcomes = dto.hodOutcomes;
    reports[idx].status = dto.status;
    this.store.setActionReports(reports);
    this.store.appendAuditLog({ actor: actorId || 'HOD', actorName: actorName || 'HOD User', actorRole: 'hod', action: 'UPDATE', module: 'Review Check-ins', target: `${reports[idx].courseId} (Faculty: ${reports[idx].facultyId})`, details: `Check-in status updated to ${dto.status}.` });
    return reports[idx];
  }
}
