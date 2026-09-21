import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { UserRole } from '@medivault/shared';

import { BiometricService } from './biometric.service';
import { EnrollBiometricDto, IdentifyBiometricDto, VerifyBiometricDto } from './dto/biometric.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Public } from '../../auth/decorators/public.decorator';
import { AccessTokenPayload } from '../../auth/auth.service';

@ApiTags('Biometrics')
@Controller(['biometrics', 'biometric'])
export class BiometricController {
  constructor(private readonly biometricService: BiometricService) {}

  private getRequestContext(req: Request) {
    return {
      ip: (req.headers['x-forwarded-for'] as string) ?? req.socket.remoteAddress ?? 'unknown',
      userAgent: req.headers['user-agent'] ?? 'unknown',
      requestId: (req.headers['x-request-id'] as string) ?? '',
    };
  }

  @Post('enroll')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth('access-token')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ORG_ADMIN,
    UserRole.FACILITY_ADMIN,
    UserRole.DOCTOR,
    UserRole.NURSE,
    UserRole.RECEPTIONIST,
  )
  @ApiOperation({ summary: 'Enroll a biometric template for a patient' })
  async enroll(
    @Body() dto: EnrollBiometricDto,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ) {
    return this.biometricService.enroll(
      dto,
      user.sub,
      user.organizationId ?? '',
      this.getRequestContext(req),
    );
  }

  @Post('identify')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth('access-token')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ORG_ADMIN,
    UserRole.FACILITY_ADMIN,
    UserRole.DOCTOR,
    UserRole.NURSE,
    UserRole.RECEPTIONIST,
  )
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '1:N fingerprint identification — returns patient ID only on match',
  })
  async identify(@Body() dto: IdentifyBiometricDto, @Req() req: Request) {
    return this.biometricService.identify(dto, this.getRequestContext(req));
  }

  @Post('verify/:patientId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth('access-token')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ORG_ADMIN,
    UserRole.FACILITY_ADMIN,
    UserRole.DOCTOR,
    UserRole.NURSE,
    UserRole.RECEPTIONIST,
  )
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '1:1 verification — confirm fingerprint matches a specific patient',
  })
  async verify(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: VerifyBiometricDto,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ) {
    return this.biometricService.verify(
      patientId,
      dto,
      user.organizationId ?? '',
      this.getRequestContext(req),
    );
  }

  @Delete('templates/:templateId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth('access-token')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke (deactivate) a biometric template' })
  async revokeTemplate(
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ) {
    return this.biometricService.revokeTemplate(
      templateId,
      user.sub,
      user.organizationId ?? '',
      this.getRequestContext(req),
    );
  }

  @Get('templates/patient/:patientId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth('access-token')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN)
  @ApiOperation({ summary: 'List biometric template metadata for a patient' })
  async listTemplates(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.biometricService.listTemplates(patientId, user.organizationId ?? '');
  }

  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Check biometric provider health status' })
  async health() {
    return this.biometricService.healthCheck();
  }
}
