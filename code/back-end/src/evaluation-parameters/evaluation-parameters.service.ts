import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DataStoreService } from '../seed/data-store.service';
import { CreateEvalParamDto, UpdateEvalParamDto } from './dto/eval-param.dto';

@Injectable()
export class EvaluationParametersService {
  constructor(private readonly store: DataStoreService) {}

  findAll(department?: string) {
    const drafts = this.store.getDraftParameters();
    const statuses = this.store.getDeptConfigStatus();

    let flat: any[] = [];
    Object.entries(drafts).forEach(([dept, params]) => {
      params.forEach((p) => {
        flat.push({ ...p, department: dept, configStatus: statuses[dept] || 'DRAFT' });
      });
    });

    if (department) flat = flat.filter((p) => p.department === department);
    return flat;
  }

  getDeptStatus() {
    return this.store.getDeptConfigStatus();
  }

  getDraftsByDept(department: string) {
    const drafts = this.store.getDraftParameters();
    return drafts[department] || [];
  }

  create(dto: CreateEvalParamDto, actorId?: string, actorName?: string, actorRole?: string) {
    const drafts = this.store.getDraftParameters();
    if (!drafts[dto.department]) drafts[dto.department] = [];

    const entry = {
      id: this.store.genId('EP'),
      name: dto.name,
      description: dto.description || '',
      category: dto.category || '',
      weight: dto.weight,
      type: dto.type || 'rating',
    };

    drafts[dto.department].unshift(entry);
    this.store.setDraftParameters(drafts);

    this.store.appendAuditLog({
      actor: actorId || 'SU001',
      actorName: actorName || 'Super User',
      actorRole: actorRole || 'superuser',
      action: 'CREATE',
      module: 'Evaluation Parameters',
      target: `${dto.department} — ${dto.name}`,
      details: `New evaluation parameter created for ${dto.department}.`,
    });

    return { ...entry, department: dto.department };
  }

  update(id: string, department: string, dto: UpdateEvalParamDto, actorId?: string, actorName?: string) {
    const drafts = this.store.getDraftParameters();
    if (!drafts[department]) throw new NotFoundException(`No parameters found for ${department}`);
    const idx = drafts[department].findIndex((p) => p.id === id);
    if (idx === -1) throw new NotFoundException(`Parameter ${id} not found`);

    drafts[department][idx] = { ...drafts[department][idx], ...dto };
    this.store.setDraftParameters(drafts);

    this.store.appendAuditLog({
      actor: actorId || 'SU001',
      actorName: actorName || 'Super User',
      actorRole: 'superuser',
      action: 'UPDATE',
      module: 'Evaluation Parameters',
      target: `${department} — ${drafts[department][idx].name}`,
      details: 'Parameter updated.',
    });

    return { ...drafts[department][idx], department };
  }

  remove(id: string, department: string, actorId?: string, actorName?: string) {
    const drafts = this.store.getDraftParameters();
    if (!drafts[department]) throw new NotFoundException(`No parameters found for ${department}`);
    const param = drafts[department].find((p) => p.id === id);
    if (!param) throw new NotFoundException(`Parameter ${id} not found`);

    drafts[department] = drafts[department].filter((p) => p.id !== id);
    this.store.setDraftParameters(drafts);

    this.store.appendAuditLog({
      actor: actorId || 'SU001',
      actorName: actorName || 'Super User',
      actorRole: 'superuser',
      action: 'DELETE',
      module: 'Evaluation Parameters',
      target: `${department} — ${param.name}`,
      details: 'Parameter deleted.',
    });
    return { message: `Parameter ${id} deleted` };
  }

  approve(department: string, actorId?: string, actorName?: string) {
    const drafts = this.store.getDraftParameters();
    const deptParams = drafts[department] || [];

    const totalWeight = deptParams.reduce((sum, p) => sum + (p.weight || 0), 0);
    if (totalWeight !== 100) {
      throw new BadRequestException(
        `Cannot approve ${department}. Total weight is ${totalWeight}% but must be 100%.`,
      );
    }

    const active = this.store.getActiveParameters();
    active[department] = deptParams;
    this.store.setActiveParameters(active);

    const statuses = this.store.getDeptConfigStatus();
    statuses[department] = 'APPROVED';
    this.store.setDeptConfigStatus(statuses);

    this.store.appendAuditLog({
      actor: actorId || 'SU001',
      actorName: actorName || 'Super User',
      actorRole: 'superuser',
      action: 'APPROVE',
      module: 'Evaluation Parameters',
      target: `${department} Configuration`,
      details: `Department evaluation parameters approved.`,
    });

    return { message: `${department} parameters approved`, params: deptParams };
  }

  submit(department: string, actorId?: string, actorName?: string) {
    const statuses = this.store.getDeptConfigStatus();
    statuses[department] = 'SUBMITTED';
    this.store.setDeptConfigStatus(statuses);

    this.store.appendAuditLog({
      actor: actorId || 'SU001',
      actorName: actorName || 'HOD',
      actorRole: 'hod',
      action: 'SUBMIT',
      module: 'Evaluation Parameters',
      target: `${department} Configuration`,
      details: `Department evaluation parameters submitted for approval.`,
    });
    return { message: `${department} parameters submitted for approval` };
  }
}
