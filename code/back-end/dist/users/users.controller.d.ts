import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { BulkImportDto } from './dto/bulk-import.dto';
export declare class UsersController {
    private readonly usersService;
    constructor(usersService: UsersService);
    findAll(role?: string, department?: string): {
        id: string;
        name: string;
        role: string;
        department?: string;
        enrolledCourses?: string[];
        thumbnail?: string;
    }[];
    findOne(id: string): {
        id: string;
        name: string;
        role: string;
        department?: string;
        enrolledCourses?: string[];
        thumbnail?: string;
    };
    create(dto: CreateUserDto): any;
    bulkImport(dto: BulkImportDto, req: any): {
        success: any[];
        failed: {
            user: any;
            reason: string;
        }[];
        total: number;
    };
    update(id: string, dto: UpdateUserDto, req: any): {
        id: string;
        name: string;
        role: string;
        department?: string;
        enrolledCourses?: string[];
        thumbnail?: string;
    };
    remove(id: string, req: any): {
        message: string;
    };
}
