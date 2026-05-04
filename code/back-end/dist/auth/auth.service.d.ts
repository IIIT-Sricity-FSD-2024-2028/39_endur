import { SeedService } from '../seed/seed.service';
export declare class AuthService {
    private readonly seedService;
    constructor(seedService: SeedService);
    login(id: string, password: string): {
        id: string;
        name: string;
        role: string;
        department?: string;
        enrolledCourses?: string[];
        thumbnail?: string;
    };
}
