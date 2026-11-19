import { BadRequestException, Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { AuthUser, CurrentUser, MinRole } from '../common/decorators';
import { Role } from '../common/roles';
import { CreateUserDto, ResetPasswordDto, UpdateUserDto } from './users.dto';
import { UsersService } from './users.service';

@Controller('users')
@MinRole(Role.Admin)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list() {
    return this.users.list();
  }

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() me: AuthUser) {
    // Prevent an admin from locking themselves (or the last admin) out.
    if (id === me.id && ((dto.role && dto.role !== Role.Admin) || dto.active === false)) {
      throw new BadRequestException('You cannot demote or deactivate your own account');
    }
    return this.users.update(id, dto);
  }

  @Post(':id/password')
  @HttpCode(204)
  async resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto) {
    await this.users.setPassword(id, dto.password);
  }
}
