import { DataStoreService } from '../seed/data-store.service';
import { SeedService } from '../seed/seed.service';
import { CreateCourseDto, UpdateCourseDto, EnrollStudentsDto } from './dto/course.dto';
export declare class CoursesService {
    private readonly store;
    private readonly seedService;
    constructor(store: DataStoreService, seedService: SeedService);
    findAll(department?: string, facultyId?: string): any[];
    findOne(id: string): any;
    create(dto: CreateCourseDto, actorId?: string, actorName?: string): {
        enrolled: number;
        thumbnail: string;
        id: string;
        name: string;
        facultyId: string;
        faculty?: string;
        department?: string;
        type?: string;
    };
    update(id: string, dto: UpdateCourseDto, actorId?: string, actorName?: string): any;
    remove(id: string, actorId?: string, actorName?: string): {
        message: string;
    };
    enroll(courseId: string, dto: EnrollStudentsDto, actorId?: string, actorName?: string): any;
    bulkCreate(coursesToImport: CreateCourseDto[], actorId?: string, actorName?: string): {
        success: any[];
        failed: {
            course: any;
            reason: string;
        }[];
        total: number;
    };
}
