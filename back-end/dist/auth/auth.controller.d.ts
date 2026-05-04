import { AuthService } from './auth.service';
import { LoginDto } from './login.dto';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    login(dto: LoginDto): {
        id: string;
        name: string;
        role: string;
        department?: string;
        enrolledCourses?: string[];
        thumbnail?: string;
    };
}
