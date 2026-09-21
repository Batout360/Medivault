import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { UserRole, PATIENT_ROLES } from '@medivault/shared';

import { MedicalProfileService } from './medical-profile.service';
import { GenerateQrDto } from './dto/generate-qr.dto';
import { UpdateVisibilityDto } from './dto/update-visibility.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PatientAccessGuard } from '../../common/guards/patient-access.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Public } from '../../auth/decorators/public.decorator';
import { AccessTokenPayload } from '../../auth/auth.service';
import { ParseUUIDPipe } from '../../common/pipes/parse-uuid.pipe';

@ApiTags('Medical Profile')
@Controller('medical-profile')
export class MedicalProfileController {
  constructor(private readonly medicalProfileService: MedicalProfileService) {}

  private ctx(req: Request) {
    return {
      ip:
        (req.headers['x-forwarded-for'] as string) ??
        req.socket.remoteAddress ??
        req.ip ??
        'unknown',
      userAgent: req.headers['user-agent'] ?? 'unknown',
      requestId: (req.headers['x-request-id'] as string) ?? '',
    };
  }

  // ── Full medical profile card (authenticated + authorized) ─────────────────

  @Get('patients/:patientId')
  @UseGuards(JwtAuthGuard, RolesGuard, PatientAccessGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ORG_ADMIN,
    UserRole.FACILITY_ADMIN,
    UserRole.DOCTOR,
    UserRole.NURSE,
    UserRole.RECEPTIONIST,
    ...PATIENT_ROLES,
  )
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get a patient medical profile card (authorized viewers only)',
  })
  getCard(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ) {
    return this.medicalProfileService.getCard(
      patientId,
      user.organizationId ?? null,
      user,
      this.ctx(req),
    );
  }

  // ── QR status ──────────────────────────────────────────────────────────────

  @Get('patients/:patientId/qr/status')
  @UseGuards(JwtAuthGuard, RolesGuard, PatientAccessGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ORG_ADMIN,
    UserRole.FACILITY_ADMIN,
    UserRole.DOCTOR,
    UserRole.NURSE,
    UserRole.RECEPTIONIST,
    ...PATIENT_ROLES,
  )
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get QR status, scan count and lifecycle dates' })
  getQrStatus(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ) {
    return this.medicalProfileService.getQrStatus(
      patientId,
      user.organizationId ?? null,
      user,
      this.ctx(req),
    );
  }

  // ── Generate / regenerate QR ───────────────────────────────────────────────

  @Post('patients/:patientId/qr')
  @UseGuards(JwtAuthGuard, RolesGuard, PatientAccessGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ORG_ADMIN,
    UserRole.FACILITY_ADMIN,
    UserRole.DOCTOR,
    ...PATIENT_ROLES,
  )
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Generate (or regenerate) a medical profile QR code',
  })
  generateQr(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: GenerateQrDto,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ) {
    return this.medicalProfileService.generateQr(
      patientId,
      user.organizationId ?? null,
      user,
      dto.baseUrl,
      this.ctx(req),
    );
  }

  // ── Revoke QR ──────────────────────────────────────────────────────────────

  @Post('patients/:patientId/qr/revoke')
  @UseGuards(JwtAuthGuard, RolesGuard, PatientAccessGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ORG_ADMIN,
    UserRole.FACILITY_ADMIN,
    UserRole.DOCTOR,
    ...PATIENT_ROLES,
  )
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Revoke an active medical profile QR code' })
  revokeQr(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ) {
    return this.medicalProfileService.revokeQr(
      patientId,
      user.organizationId ?? null,
      user,
      this.ctx(req),
    );
  }

  // ── QR PNG download ────────────────────────────────────────────────────────

  @Get('patients/:patientId/qr.png')
  @UseGuards(JwtAuthGuard, RolesGuard, PatientAccessGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ORG_ADMIN,
    UserRole.FACILITY_ADMIN,
    UserRole.DOCTOR,
    UserRole.NURSE,
    UserRole.RECEPTIONIST,
    ...PATIENT_ROLES,
  )
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Download the active QR code as a PNG image' })
  async getQrPng(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { buffer, mimeType, fileName } = await this.medicalProfileService.getQrPng(
      patientId,
      user.organizationId ?? null,
      user,
    );

    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    });

    return new StreamableFile(buffer);
  }

  // ── Public verification (scan tracking, no PHI leaked) ─────────────────────

  @Get('verify/:code')
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Public QR verification endpoint (tracks scans, never returns PHI)',
    description:
      'Resolves a QR scan code, records the scan for audit, and returns only a ' +
      'validity status plus a safe initials hint. No medical data is ever exposed ' +
      'to an unauthenticated caller.',
  })
  verifyScan(@Param('code') code: string, @Req() req: Request) {
    return this.medicalProfileService.verifyScan(code, this.ctx(req));
  }

  // ── Authorized details behind a scanned QR (verification page) ─────────────

  @Get('verify/:code/details')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ORG_ADMIN,
    UserRole.FACILITY_ADMIN,
    UserRole.DOCTOR,
    UserRole.NURSE,
    UserRole.RECEPTIONIST,
    ...PATIENT_ROLES,
  )
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get the medical profile card for an authorized QR-scanner (authenticated)',
  })
  verifyAndGetCard(
    @Param('code') code: string,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ) {
    return this.medicalProfileService.verifyAndGetCard(code, user, this.ctx(req));
  }

  // ── Update visibility settings ─────────────────────────────────────────────

  @Patch('patients/:patientId/visibility')
  @UseGuards(JwtAuthGuard, RolesGuard, PatientAccessGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN, ...PATIENT_ROLES)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update public profile visibility settings' })
  updateVisibility(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: UpdateVisibilityDto,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ) {
    return this.medicalProfileService.updateVisibility(
      patientId,
      user.organizationId ?? null,
      user,
      dto,
      this.ctx(req),
    );
  }

  // ── Public profile (QR scan — visibility-filtered, no auth required) ────────

  @Get('public/:code')
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Get public visibility-filtered profile from QR code (no auth, respects patient privacy settings)',
  })
  getPublicProfile(@Param('code') code: string, @Req() req: Request) {
    return this.medicalProfileService.getPublicProfile(code, this.ctx(req));
  }

  // ── Emergency profile (no auth — only shows patient-enabled emergency info) ─

  @Get('emergency/:code')
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Emergency profile view — critical info only, respects visibility settings',
  })
  getEmergencyProfile(@Param('code') code: string, @Req() req: Request) {
    return this.medicalProfileService.getEmergencyProfile(code, this.ctx(req));
  }
}
