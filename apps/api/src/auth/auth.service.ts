import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PublicUser, toPublic, UsersService } from '../users/users.service';
import { SessionService } from './session.service';

// Compared against when the email is unknown, so timing does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly session: SessionService,
  ) {}

  async login(email: string, password: string): Promise<{ token: string; user: PublicUser }> {
    const user = await this.users.findByEmail(email);
    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    // Unknown email, no password yet (invite not accepted) and wrong password all look the same.
    if (!user || !user.passwordHash || !ok) throw new UnauthorizedException('Invalid email or password');
    // Only someone who proved the password is told why they are blocked.
    if (!user.active) throw new ForbiddenException('This account is deactivated. Ask an admin to turn it back on.');
    await this.users.markLogin(user.id);
    return { token: await this.session.sign(user), user: toPublic(user) };
  }

  /**
   * Replace the password and end every other session. A wrong current password is a 400, not a 401,
   * so the browser does not mistake it for an expired session and sign the person out.
   */
  async changePassword(userId: string, current: string, next: string): Promise<{ token: string }> {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (!user.passwordHash || !(await bcrypt.compare(current, user.passwordHash))) {
      throw new BadRequestException('Current password is incorrect');
    }
    if (current === next) throw new BadRequestException('Choose a password different from the current one');
    const updated = await this.users.changePassword(userId, await this.users.hash(next));
    return { token: await this.session.sign(updated) };
  }
}
