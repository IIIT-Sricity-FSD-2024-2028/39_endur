import { Injectable, UnauthorizedException } from '@nestjs/common';
import { SeedService } from '../seed/seed.service';

@Injectable()
export class AuthService {
  constructor(private readonly seedService: SeedService) {}

  login(id: string, password: string) {
    const user = this.seedService.getUsers().find(
      (u) => u.id === id && u.password === password,
    );
    if (!user) {
      throw new UnauthorizedException('Invalid ID or password');
    }
    // Return user without password
    const { password: _, ...safe } = user;
    return safe;
  }
}
