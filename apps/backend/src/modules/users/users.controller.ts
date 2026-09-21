import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';

import { UserRole } from '@medivault/shared';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto, UpdateProfileDto } from './dto/update-user.dto';
import { AdminResetPasswordDto } from './dto/admin-reset-password.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AccessTokenPayload } from '../../auth/auth.service';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  private getRequestContext(req: Request) {
    return {
      ip: (req.headers['x-forwarded-for'] as string) ?? req.socket.remoteAddress ?? 'unknown',
      userAgent: req.headers['user-agent'] ?? 'unknown',
      requestId: (req.headers['x-request-id'] as string) ?? '',
    };
  }

  // GET /users — list all users (admins only)
  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN)
  @ApiOperation({ summary: 'List users (admin only)' })
  async findAll(@Query() query: UserQueryDto, @CurrentUser() user: AccessTokenPayload) {
    return this.usersService.findAll(query, {
      id: user.sub,
      role: user.role,
      organizationId: user.organizationId,
    });
  }

  // GET /users/me/profile — own profile
  @Get('me/profile')
  @ApiOperation({ summary: 'Get own profile' })
  async getMyProfile(@CurrentUser() user: AccessTokenPayload) {
    return this.usersService.getProfile(user.sub);
  }

  // PATCH /users/me/profile — update own profile
  @Patch('me/profile')
  @ApiOperation({ summary: 'Update own profile' })
  async updateMyProfile(@CurrentUser() user: AccessTokenPayload, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.sub, dto);
  }

  // GET /users/:id — get a user
  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN)
  @ApiOperation({ summary: 'Get user by ID' })
  async findById(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AccessTokenPayload) {
    return this.usersService.findById(id, {
      id: user.sub,
      role: user.role,
      organizationId: user.organizationId,
    });
  }

  // POST /users — create user
  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN)
  @ApiOperation({ summary: 'Create a new user' })
  async create(
    @Body() dto: CreateUserDto,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ) {
    return this.usersService.create(
      dto,
      {
        id: user.sub,
        role: user.role,
        organizationId: user.organizationId,
        facilityId: user.facilityId ?? null,
      },
      this.getRequestContext(req),
    );
  }

  // PATCH /users/:id — update user
  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN)
  @ApiOperation({ summary: 'Update a user' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ) {
    return this.usersService.update(
      id,
      dto,
      {
        id: user.sub,
        role: user.role,
        organizationId: user.organizationId,
        facilityId: user.facilityId ?? null,
      },
      this.getRequestContext(req),
    );
  }

  // DELETE /users/:id — deactivate user
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN)
  @ApiOperation({ summary: 'Deactivate a user (soft delete)' })
  async deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ) {
    return this.usersService.deactivate(
      id,
      {
        id: user.sub,
        role: user.role,
        organizationId: user.organizationId,
      },
      this.getRequestContext(req),
    );
  }

  // POST /users/:id/reset-password — admin sets a new password for a user
  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN)
  @ApiOperation({
    summary: 'Set a new password for a user (admin only)',
    description: 'Resets the user password and signs out all of their active sessions.',
  })
  async resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminResetPasswordDto,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ) {
    return this.usersService.adminResetPassword(
      id,
      dto.newPassword,
      {
        id: user.sub,
        role: user.role,
        organizationId: user.organizationId,
      },
      this.getRequestContext(req),
    );
  }
}
