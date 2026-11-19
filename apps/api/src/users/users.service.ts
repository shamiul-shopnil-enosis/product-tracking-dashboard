import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { isValidObjectId, Model } from 'mongoose';
import { Role } from '../common/roles';
import { MIN_PASSWORD_LENGTH, CreateUserDto, UpdateUserDto } from './users.dto';
import { User, UserDocument } from './user.schema';

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
}

export function toPublic(u: UserDocument): PublicUser {
  return { id: u.id, name: u.name, email: u.email, role: u.role, active: u.active };
}

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectModel(User.name) private readonly model: Model<UserDocument>,
    private readonly config: ConfigService,
  ) {}

  /** Create the first admin from ADMIN_EMAIL / ADMIN_PASSWORD when no users exist. */
  async onModuleInit() {
    const email = this.config.get<string>('ADMIN_EMAIL');
    const password = this.config.get<string>('ADMIN_PASSWORD');
    if (!email || !password) return;
    if ((await this.model.estimatedDocumentCount()) > 0) return;
    if (password.length < MIN_PASSWORD_LENGTH) {
      this.logger.error(`ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters; admin not created`);
      return;
    }
    await this.create({
      name: this.config.get<string>('ADMIN_NAME', 'Admin'),
      email,
      password,
      role: Role.Admin,
    });
    this.logger.log(`Created first admin ${email.toLowerCase()}`);
  }

  hash(password: string) {
    return bcrypt.hash(password, 12);
  }

  findByEmail(email: string) {
    return this.model.findOne({ email: email.toLowerCase().trim() });
  }

  async findById(id: string) {
    if (!isValidObjectId(id)) return null;
    return this.model.findById(id);
  }

  async list() {
    const users = await this.model.find().sort({ createdAt: 1 });
    return users.map(toPublic);
  }

  async create(dto: CreateUserDto) {
    try {
      const user = await this.model.create({
        name: dto.name.trim(),
        email: dto.email,
        passwordHash: await this.hash(dto.password),
        role: dto.role,
      });
      return toPublic(user);
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        throw new ConflictException('A user with this email already exists');
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('User not found');
    if (dto.name !== undefined) user.name = dto.name.trim();
    if (dto.role !== undefined) user.role = dto.role;
    if (dto.active !== undefined) user.active = dto.active;
    await user.save();
    return toPublic(user);
  }

  async setPassword(id: string, password: string) {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('User not found');
    user.passwordHash = await this.hash(password);
    await user.save();
  }
}
