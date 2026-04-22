import { EvaluationParametersService } from './evaluation-parameters.service';
import { CreateEvalParamDto, UpdateEvalParamDto, BulkImportEvalParamsDto } from './dto/eval-param.dto';
export declare class EvaluationParametersController {
    private readonly svc;
    constructor(svc: EvaluationParametersService);
    findAll(dept?: string): any[];
    getDeptStatus(): Record<string, string>;
    getDraftsByDept(dept: string): any[];
    create(dto: CreateEvalParamDto, req: any): {
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
    update(id: string, dept: string, dto: UpdateEvalParamDto, req: any): any;
    remove(id: string, dept: string, req: any): any;
    revert(dept: string, req: any): any;
    approve(dept: string, req: any): any;
    submit(dept: string, req: any): any;
    reject(dept: string, note: string, req: any): any;
    bulkImport(dto: BulkImportEvalParamsDto, req: any): any;
}
