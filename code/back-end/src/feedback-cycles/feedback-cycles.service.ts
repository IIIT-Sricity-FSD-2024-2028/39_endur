import { Injectable, NotFoundException } from '@nestjs/common';
import { DataStoreService } from '../seed/data-store.service';
import {
  CreateFeedbackCycleDto,
  UpdateFeedbackCycleDto,
  UpdateCycleStatusDto,
} from './dto/feedback-cycle.dto';

@Injectable()
export class FeedbackCyclesService {
  constructor(private readonly store: DataStoreService) {}

  generateDefaultParameters() {
    const depts = this.store.getDepartments();
    const map: Record<string, any[]> = {};
    const defaultParams = [
      { id: 'delivery', name: 'Course Delivery & Clarity', weight: 25 },
      { id: 'relevance', name: 'Course Relevance', weight: 25 },
      { id: 'support', name: 'Faculty Support & Availability', weight: 25 },
      { id: 'assessment', name: 'Fairness of Assessments', weight: 25 },
    ];
    for (const d of depts) {
      map[d.id] = [...defaultParams];
    }
    // Also include an Unassigned fallback
    map['Unassigned'] = [...defaultParams];
    return map;
  }

  findAll() {
    return this.store.getFeedbackCycles();
  }

  findActive() {
    const cycles = this.store.getFeedbackCycles();
    return cycles.filter((c) => c.status === 'active');
  }

  findOne(id: string) {
    const cycle = this.store.getFeedbackCycles().find((c) => c.cycleId === id);
    if (!cycle) throw new NotFoundException(`Cycle ${id} not found`);
    return cycle;
  }

  getCycleState() {
    return this.store.getCycleState();
  }


  create(dto: CreateFeedbackCycleDto, actorId?: string, actorName?: string) {
    const cycles = this.store.getFeedbackCycles();
    const activeParams = this.store.getActiveParameters();
    const depts = this.store.getDepartments();
    const finalParams: Record<string, any[]> = {};
    
    // Predicatable IDs for institutional defaults to ensure student form & backend match
    const defaultParams = [
      { id: 'delivery',   name: 'Course Delivery & Clarity',     weight: 25 },
      { id: 'relevance',  name: 'Course Relevance',               weight: 25 },
      { id: 'support',    name: 'Faculty Support & Availability', weight: 25 },
      { id: 'assessment', name: 'Fairness of Assessments',        weight: 25 },
    ];

    for (const d of depts) {
      // Priority 1: Keyed by Name (e.g., 'Computer Science')
      if (activeParams[d.name]) {
        finalParams[d.name] = JSON.parse(JSON.stringify(activeParams[d.name]));
      } 
      // Priority 2: Keyed by ID (e.g., 'CS')
      else if (activeParams[d.id]) {
        finalParams[d.name] = JSON.parse(JSON.stringify(activeParams[d.id]));
      }
      // Fallback: Keyed by department name with defaults
      else {
        finalParams[d.name] = [...defaultParams];
      }
    }
    // Also include 'Unassigned' fallback
    finalParams['Unassigned'] = [...defaultParams];

    const entry = {
      cycleId: this.store.genId('CYCLE'),
      ...dto,
      status: 'active',
      phase: 'PREPARATION',
      departmentParameters: finalParams
    };
    cycles.unshift(entry);
    this.store.setFeedbackCycles(cycles);

    this.store.appendAuditLog({
      actor: actorId || 'SU001',
      actorName: actorName || 'Super User',
      actorRole: actorId ? 'admin' : 'superuser',
      action: 'CREATE',
      module: 'Feedback Cycles',
      target: `${entry.cycleId} — ${dto.cycleName}`,
      details: 'New feedback cycle created.',
    });
    return entry;
  }

  update(id: string, dto: UpdateFeedbackCycleDto, actorId?: string, actorName?: string) {
    const cycles = this.store.getFeedbackCycles();
    const idx = cycles.findIndex((c) => c.cycleId === id);
    if (idx === -1) throw new NotFoundException(`Cycle ${id} not found`);
    cycles[idx] = { ...cycles[idx], ...dto };
    this.store.setFeedbackCycles(cycles);

    this.store.appendAuditLog({
      actor: actorId || 'SU001',
      actorName: actorName || 'Super User',
      actorRole: 'admin',
      action: 'UPDATE',
      module: 'Feedback Cycles',
      target: `${id} — ${cycles[idx].cycleName}`,
      details: 'Cycle details updated.',
    });
    return cycles[idx];
  }

  updateStatus(id: string, dto: UpdateCycleStatusDto, actorId?: string, actorName?: string) {
    const cycles = this.store.getFeedbackCycles();
    const idx = cycles.findIndex((c) => c.cycleId === id);
    if (idx === -1) throw new NotFoundException(`Cycle ${id} not found`);

    if (dto.phase === 'STUDENT_FEEDBACK' && cycles[idx].phase === 'PREPARATION') {
      const activeParams = this.store.getActiveParameters();
      const depts = this.store.getDepartments();
      const finalParams: Record<string, any[]> = {};
      const defaultParams = [
        { id: 'delivery',   name: 'Course Delivery & Clarity',     weight: 25 },
        { id: 'relevance',  name: 'Course Relevance',               weight: 25 },
        { id: 'support',    name: 'Faculty Support & Availability', weight: 25 },
        { id: 'assessment', name: 'Fairness of Assessments',        weight: 25 },
      ];
      for (const d of depts) {
        if (activeParams[d.name]) {
          finalParams[d.name] = JSON.parse(JSON.stringify(activeParams[d.name]));
        } else if (activeParams[d.id]) {
          finalParams[d.name] = JSON.parse(JSON.stringify(activeParams[d.id]));
        } else {
          finalParams[d.name] = [...defaultParams];
        }
      }
      finalParams['Unassigned'] = [...defaultParams];
      cycles[idx].departmentParameters = finalParams;
    }

    cycles[idx].status = dto.status;
    if (dto.phase) cycles[idx].phase = dto.phase;
    this.store.setFeedbackCycles(cycles);

    // Also update global cycle state if activating
    if (dto.status === 'active' && dto.phase) {
      this.store.setCycleState({ id, phase: dto.phase, ...cycles[idx] });
    } else if (dto.status === 'closed') {
      const state = this.store.getCycleState();
      if (state?.id === id) {
        this.store.setCycleState({ ...state, status: 'closed', phase: 'COMPLETED' });
      }
    }

    this.store.appendAuditLog({
      actor: actorId || 'SU001',
      actorName: actorName || 'Super User',
      actorRole: 'admin',
      action: 'UPDATE',
      module: 'Feedback Cycles',
      target: `${id} — ${cycles[idx].cycleName}`,
      details: `Cycle status changed to '${dto.status}'.`,
    });
    return cycles[idx];
  }

  remove(id: string, actorId?: string, actorName?: string) {
    const cycles = this.store.getFeedbackCycles();
    const cycle = cycles.find((c) => c.cycleId === id);
    if (!cycle) throw new NotFoundException(`Cycle ${id} not found`);
    this.store.setFeedbackCycles(cycles.filter((c) => c.cycleId !== id));

    this.store.appendAuditLog({ actor: actorId || 'SU001', actorName: actorName || 'Super User', actorRole: 'admin', action: 'DELETE', module: 'Feedback Cycles', target: `${id} — ${cycle.cycleName}`, details: 'Cycle permanently deleted.' });
    return { message: `Cycle ${id} deleted` };
  }

  bulkCreate(cyclesToImport: CreateFeedbackCycleDto[], actorId?: string, actorName?: string) {
    const cycles = this.store.getFeedbackCycles();
    const responsesStore = this.store.getFeedbackResponses();
    const success: any[] = [];
    const failed: Array<{ cycle: any; reason: string }> = [];

    // Close any currently active cycles first
    cycles.forEach(c => { if (c.status === 'active') c.status = 'closed'; });

    for (const dto of cyclesToImport) {
      const cycleId = this.store.genId('CYCLE');
      
      let params: any = null;
      try { params = dto.parametersJson ? JSON.parse(dto.parametersJson) : null; } catch (e) {}
      if (!params || typeof params !== 'object') {
         params = this.generateDefaultParameters();
      }

      const entry = { cycleId, ...dto, status: 'closed', phase: 'COMPLETED', departmentParameters: params };
      delete entry.responses; // don't store raw responses in cycle object
      delete entry.parametersJson;
      
      cycles.unshift(entry);
      success.push(entry);

      if (dto.responses && Array.isArray(dto.responses)) {
        dto.responses.forEach(r => {
          let enrichedRatings: any[] = [];
          const course = this.store.getCourses().find(c => c.id === r.courseId);
          const department = course ? course.department : 'Unassigned';
          const activeParamsForCycle = params[department] || params['Unassigned'] || [];

          if (Array.isArray(r.ratings)) {
            // New format: ratings is an array of {paramId, score, comment}
            enrichedRatings = r.ratings.map(rt => {
              const pDef = activeParamsForCycle.find(p => p.id === rt.paramId);
              let score = Number(rt.score);
              if (score > 5) score = score / 20; // Normalize percentage to 1-5 scale
              return {
                paramId: rt.paramId,
                paramName: pDef ? pDef.name : rt.paramId,
                weight: pDef ? pDef.weight : 25,
                score: score,
                comment: rt.comment ?? ''
              };
            });
          } else {
            // Legacy format: ratings is an object or ratingsJson exists
            let rawRatings: any = {};
            try {
              rawRatings = r.ratingsJson ? JSON.parse(r.ratingsJson) : r.ratings || {};
            } catch (e) {}

            Object.entries(rawRatings).forEach(([key, val]) => {
              if (val === undefined || val === null || val === '') return;
              let score = Number(val);
              if (isNaN(score)) return;

              const pDef = activeParamsForCycle.find(p => p.id === key);
              if (score > 5) score = score / 20;

              enrichedRatings.push({
                paramId: key,
                paramName: pDef ? pDef.name : key,
                weight: pDef ? pDef.weight : 25,
                score: score,
                comment: r.openEndedComment || r.comments || ''
              });
            });
          }

          if (enrichedRatings.length === 0) return; // Skip empty responses

          responsesStore.push({
            responseId: this.store.genId('RESP'),
            cycleId: cycleId,
            studentId: r.studentId || `ANON-${this.store.genId('')}`,
            courseId: r.courseId,
            facultyId: r.facultyId,
            studentDepartment: department,
            ratings: enrichedRatings,
            submittedAt: r.submittedAt || new Date().toISOString()
          });
        });
      }
    }
    this.store.setFeedbackCycles(cycles);
    this.store.setFeedbackResponses(responsesStore);
    
    if (success.length > 0) {
      this.store.appendAuditLog({ actor: actorId || 'SU001', actorName: actorName || 'Super User', actorRole: 'superuser', action: 'BULK_CREATE', module: 'Feedback Cycles', target: `${success.length} cycles`, details: `Bulk import: ${success.length} historical cycles imported.` });
    }
    return { success, failed, total: cyclesToImport.length };
  }
}
