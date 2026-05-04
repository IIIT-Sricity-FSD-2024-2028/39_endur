import { DataStoreService } from '../seed/data-store.service';
import { SeedService } from '../seed/seed.service';
import { CreateDepartmentDto } from './dto/department.dto';
export declare class DepartmentsService {
    private readonly store;
    private readonly seedService;
    constructor(store: DataStoreService, seedService: SeedService);
    findAll(): any[];
    create(dto: CreateDepartmentDto, actorId?: string, actorName?: string): {
        id: string;
        name: string;
    };
    remove(id: string, actorId?: string, actorName?: string): {
        message: string;
    };
    bulkCreate(dtos: CreateDepartmentDto[], actorId?: string, actorName?: string): {
        message: string;
        added: any[];
    };
}
