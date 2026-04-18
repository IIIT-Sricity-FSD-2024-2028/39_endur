import { DepartmentsService } from './departments.service';
import { CreateDepartmentDto } from './dto/department.dto';
export declare class DepartmentsController {
    private readonly departmentsService;
    constructor(departmentsService: DepartmentsService);
    findAll(): any[];
    bulkCreate(dtos: CreateDepartmentDto[], role: string, userId: string): {
        message: string;
        added: any[];
    };
    create(dto: CreateDepartmentDto, role: string, userId: string): {
        id: string;
        name: string;
    };
    remove(id: string, role: string, userId: string): {
        message: string;
    };
}
