import { CoursesService } from './courses.service';
import { CreateCourseDto, UpdateCourseDto, EnrollStudentsDto, BulkImportCoursesDto } from './dto/course.dto';
export declare class CoursesController {
    private readonly svc;
    constructor(svc: CoursesService);
    findAll(dept?: string, fid?: string): any[];
    findOne(id: string): any;
    create(dto: CreateCourseDto, req: any): {
        enrolled: number;
        thumbnail: string;
        id: string;
        name: string;
        facultyIds: string[];
        facultyNames?: string[];
        department?: string;
        type?: string;
    };
    update(id: string, dto: UpdateCourseDto, req: any): any;
    remove(id: string, req: any): {
        message: string;
    };
    enroll(id: string, dto: EnrollStudentsDto, req: any): any;
    bulkImport(dto: BulkImportCoursesDto, req: any): {
        success: any[];
        failed: {
            course: any;
            reason: string;
        }[];
        total: number;
    };
}
