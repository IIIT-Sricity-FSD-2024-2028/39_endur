export interface User {
    id: string;
    password: string;
    name: string;
    role: string;
    department?: string;
    enrolledCourses?: string[];
    thumbnail?: string;
}
export declare class SeedService {
    private users;
    onModuleInit(): void;
    getUsers(): User[];
    setUsers(users: User[]): void;
}
