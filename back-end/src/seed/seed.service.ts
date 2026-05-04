import { Injectable } from '@nestjs/common';

export interface User {
  id: string;
  password: string;
  name: string;
  role: string;
  department?: string;
  enrolledCourses?: string[];
  thumbnail?: string;
}

@Injectable()
export class SeedService {
  private users: User[] = [];

  onModuleInit() {
    // Only the superuser is hardcoded — all other users must be created via the app
    this.users = [
      {
        id: 'SU001',
        password: 'password123',
        name: 'SuperUser',
        role: 'superuser',
        department: 'System',
      },
    ];
  }

  getUsers(): User[] {
    return this.users;
  }

  setUsers(users: User[]) {
    this.users = users;
  }
}
