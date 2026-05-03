import { EvaluationParametersService } from './evaluation-parameters.service';
import { CreateEvalParamDto, UpdateEvalParamDto, BulkImportEvalParamsDto } from './dto/eval-param.dto';
export declare class EvaluationParametersController {
    private readonly svc;
    constructor(svc: EvaluationParametersService);
    findAll(dept?: string): any[];
    getDeptStatus(): Record<string, string>;
    getDraftsByDept(dept: string): any[];
    getDeptNotes(): Record<string, string>;
    create(dto: CreateEvalParamDto, req: any): {
        department: string;
        id: string;
        name: string;
        description: string;
        category: string;
        weight: number;
        type: string;
    };
    update(id: string, dept: string, dto: UpdateEvalParamDto, req: any): any;
    remove(id: string, dept: string, req: any): {
        message: string;
    };
    revert(dept: string, req: any): {
        message: string;
        status: string;
    };
    approve(dept: string, req: any): {
        message: string;
        params: any[];
    };
    submit(dept: string, req: any): {
        message: string;
    };
    reject(dept: string, note: string, req: any): {
        message: string;
    };
    bulkImport(dto: BulkImportEvalParamsDto, req: any): {
        success: any[];
        failed: {
            param: any;
            reason: string;
        }[];
        total: number;
    };
}
