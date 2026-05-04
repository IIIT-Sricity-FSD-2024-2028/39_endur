export declare class CreateEvalParamDto {
    name: string;
    description?: string;
    category?: string;
    weight: number;
    type?: string;
    department: string;
}
export declare class UpdateEvalParamDto {
    name?: string;
    description?: string;
    category?: string;
    weight?: number;
    status?: string;
}
export declare class BulkImportEvalParamsDto {
    params: CreateEvalParamDto[];
}
