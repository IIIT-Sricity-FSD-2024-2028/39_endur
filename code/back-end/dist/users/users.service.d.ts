import { SeedService } from '../seed/seed.service';
import { DataStoreService } from '../seed/data-store.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
export declare class UsersService {
    private readonly seedService;
    private readonly store;
    constructor(seedService: SeedService, store: DataStoreService);
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
    findOneWithPassword(id: string): import("../seed/seed.service").User | undefined;
    create(dto: CreateUserDto): any;
    bulkCreate(users: CreateUserDto[], actorId?: string, actorName?: string): {
        success: any[];
        failed: {
            user: any;
            reason: string;
        }[];
        total: number;
    };
    update(id: string, dto: UpdateUserDto, actorId?: string, actorName?: string, actorRole?: string): {
        id: string;
        name: string;
        role: string;
        department?: string;
        enrolledCourses?: string[];
        thumbnail?: string;
    };
    remove(id: string, actorId?: string, actorName?: string): {
        message: string;
    };
    updateEnrollments(courseId: string, studentIds: string[]): void;
}
