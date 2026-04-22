import { DataStoreService } from '../seed/data-store.service';
import { CreateEvalParamDto } from './dto/eval-param.dto';
export declare class EvaluationParametersService {
    private readonly store;
    constructor(store: DataStoreService);
    findAll(department?: string): any[];
    getDeptStatus(): Record<string, string>;
    getDraftsByDept(department: string): any[];
    private ensurePreparationPhase;
    create(dto: CreateEvalParamDto, actorId?: string, actorName?: string, actorRole?: string): {
        message: string;
        success?: undefined;
        failed?: undefined;
        total?: undefined;
    } | {
        success: any[];
        failed: {
            param: any;
            reason: string;
        }[];
        total: any;
        message?: undefined;
    };
}
