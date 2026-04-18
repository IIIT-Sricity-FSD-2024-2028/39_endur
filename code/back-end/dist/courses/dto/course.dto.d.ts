export declare class CreateCourseDto {
    id: string;
    name: string;
    facultyId: string;
    faculty?: string;
    department?: string;
    type?: string;
    enrolled?: number;
    thumbnail?: string;
}
export declare class UpdateCourseDto {
    name?: string;
    facultyId?: string;
    faculty?: string;
    department?: string;
    thumbnail?: string;
}
export declare class EnrollStudentsDto {
    studentIds: string[];
    autoDept?: boolean;
}
export declare class BulkImportCoursesDto {
    courses: CreateCourseDto[];
}
