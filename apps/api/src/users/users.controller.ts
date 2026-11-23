import { BadRequestException, Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { AuthUser, CurrentUser, MinRole } from '../common/decorators';
import { Role } from '../common/roles';
import { InviteUserDto, UpdateUserDto } from './users.dto';
import { UsersService } from './users.service';

@Controller('users')
@MinRole(Role.Admin)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list() {
    return this.users.list();
  }

  /** Add a person. The response carries their one-time invite token, shown to the admin once. */
  @Post()
  invite(@Body() dto: InviteUserDto) {
    return this.users.invite(dto);
  }

  /** A fresh invite (not yet accepted) or password-reset link; replaces any earlier link. */
  @Post(':id/link')
  link(@Param('id') id: string) {
    return this.users.issueLink(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() me: AuthUser) {
    // Prevent an admin from locking themselves (or the last admin) out.
    if (id === me.id && ((dto.role && dto.role !== Role.Admin) || dto.active === false)) {
      throw new BadRequestException('You cannot demote or deactivate your own account');
    }
    return this.users.update(id, dto);
  }
}
