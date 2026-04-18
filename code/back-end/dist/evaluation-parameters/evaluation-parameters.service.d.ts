import { DataStoreService } from '../seed/data-store.service';
import { CreateEvalParamDto, UpdateEvalParamDto } from './dto/eval-param.dto';
export declare class EvaluationParametersService {
    private readonly store;
    constructor(store: DataStoreService);
    findAll(department?: string): any[];
    getDeptStatus(): Record<string, string>;
    getDraftsByDept(department: string): any[];
    create(dto: CreateEvalParamDto, actorId?: string, actorName?: string, actorRole?: string): {
        department: string;
        id: string;
        name: string;
        description: string;
        category: string;
        weight: number;
        type: string;
    };
    update(id: string, department: string, dto: UpdateEvalParamDto, actorId?: string, actorName?: string): any;
    remove(id: string, department: string, actorId?: string, actorName?: string): {
        message: string;
    };
    approve(department: string, actorId?: string, actorName?: string): {
        message: string;
        params: any[];
    };
    submit(department: string, actorId?: string, actorName?: string): {
        message: string;
    };
}
