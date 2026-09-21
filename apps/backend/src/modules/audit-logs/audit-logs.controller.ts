import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole, PATIENT_ROLES } from '@medivault/shared';
import { AuditLogsService } from './audit-logs.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PatientAccessGuard } from '../../common/guards/patient-access.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ParseUUIDPipe } from '../../common/pipes/parse-uuid.pipe';

@ApiTags('Audit Logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN)
  @ApiOperation({ summary: 'Get all audit logs (admin only)' })
  findAll(@Query() query: AuditLogQueryDto, @CurrentUser() user: any) {
    return this.auditLogsService.findAll(query, user);
  }

  @Get('security-events')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN)
  @ApiOperation({ summary: 'Get security events (admin only)' })
  getSecurityEvents(@Query() query: AuditLogQueryDto, @CurrentUser() user: any) {
    return this.auditLogsService.getSecurityEvents(query, user);
  }

  @Get('patient/:patientId')
  @UseGuards(PatientAccessGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ORG_ADMIN,
    UserRole.FACILITY_ADMIN,
    UserRole.DOCTOR,
    ...PATIENT_ROLES,
  )
  @ApiOperation({ summary: 'Get audit logs for a specific patient (own record for PATIENT role)' })
  findByPatient(@Param('patientId', ParseUUIDPipe) patientId: string, @CurrentUser() user: any) {
    return this.auditLogsService.findByPatient(patientId, user);
  }

  @Get('user/:userId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN)
  @ApiOperation({ summary: 'Get audit logs for a specific user (admin only)' })
  findByUser(@Param('userId', ParseUUIDPipe) userId: string, @CurrentUser() user: any) {
    return this.auditLogsService.findByUser(userId, user);
  }
}
