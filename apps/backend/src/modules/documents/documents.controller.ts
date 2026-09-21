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
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { UserRole, PATIENT_ROLES } from '@medivault/shared';

import { DocumentsService } from './documents.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { DocumentQueryDto } from './dto/document-query.dto';
import { DownloadDocumentQueryDto } from './dto/download-document-query.dto';
import { FacilityDocumentQueryDto } from './dto/facility-document-query.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { ArchiveDocumentDto } from './dto/archive-document.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PatientAccessGuard } from '../../common/guards/patient-access.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AccessTokenPayload } from '../../auth/auth.service';

const ADMIN_ROLES = [UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN];

@ApiTags('Documents')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  private ctx(req: Request) {
    return {
      ip: (req.headers['x-forwarded-for'] as string) ?? req.socket.remoteAddress ?? 'unknown',
      userAgent: req.headers['user-agent'] ?? 'unknown',
      requestId: (req.headers['x-request-id'] as string) ?? '',
    };
  }

  // POST /patients/:patientId/documents — upload a file
  @Post('patients/:patientId/documents')
  @UseGuards(PatientAccessGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN, UserRole.DOCTOR)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a document for a patient (doctors/admins only)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        documentType: { type: 'string', description: 'Clinical category (e.g. LAB_REPORT)' },
        title: { type: 'string', description: 'Human-readable record title' },
        documentDate: { type: 'string', description: 'ISO 8601 date of the document' },
        description: { type: 'string' },
        sourceHospital: { type: 'string', description: 'Originating hospital/facility name' },
        facilityId: { type: 'string', description: 'Facility UUID the record belongs to' },
        notes: { type: 'string', description: 'Free-text clinical notes' },
        tags: { type: 'string' },
      },
    },
  })
  async uploadDocument(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadDocumentDto,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ) {
    return this.documentsService.uploadDocument(
      patientId,
      file,
      dto,
      user.sub,
      user.organizationId ?? '',
      user.facilityId,
      this.ctx(req),
    );
  }

  // GET /patients/:patientId/documents — list documents (filter/search)
  @Get('patients/:patientId/documents')
  @UseGuards(PatientAccessGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ORG_ADMIN,
    UserRole.FACILITY_ADMIN,
    UserRole.DOCTOR,
    UserRole.NURSE,
    ...PATIENT_ROLES,
  )
  @ApiOperation({
    summary: 'List documents for a patient (searchable/filterable)',
    description:
      'Valid filters: q (free-text), type, facility, uploadedBy, from, to, sortBy, order.',
  })
  async getDocuments(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Query() query: DocumentQueryDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.documentsService.getDocuments(
      patientId,
      user.organizationId ?? '',
      {
        id: user.sub,
        role: user.role,
        organizationId: user.organizationId ?? '',
      },
      query,
    );
  }

  // GET /patients/:patientId/documents/uploaders — distinct uploaders
  @Get('patients/:patientId/documents/uploaders')
  @UseGuards(PatientAccessGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ORG_ADMIN,
    UserRole.FACILITY_ADMIN,
    UserRole.DOCTOR,
    UserRole.NURSE,
    ...PATIENT_ROLES,
  )
  @ApiOperation({
    summary: 'List distinct doctors/staff who uploaded documents for this patient',
  })
  async getUploaders(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.documentsService.getUploaders(patientId, user.organizationId ?? '');
  }

  // GET /facility/documents — facility-wide document management dashboard
  @Get('facility/documents')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({
    summary: 'List documents across patients (facility-admin dashboard)',
    description:
      'Facility admins are scoped to their JWT facility. Org/super admins scope to their ' +
      'organization and may optionally narrow with facilityId. Filters: patient, patientId, q, ' +
      'type, uploadedBy, facilityId, from, to, status, sortBy, order.',
  })
  async getFacilityDocuments(
    @Query() query: FacilityDocumentQueryDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.documentsService.getFacilityDocuments(
      {
        id: user.sub,
        role: user.role,
        organizationId: user.organizationId,
        facilityId: user.facilityId,
      },
      query,
    );
  }

  // GET /facility/documents/uploaders — distinct uploaders for the doctor filter
  @Get('facility/documents/uploaders')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Distinct uploaders for the facility document dashboard' })
  async getFacilityUploaders(@CurrentUser() user: AccessTokenPayload) {
    return this.documentsService.getFacilityUploaders({
      id: user.sub,
      role: user.role,
      organizationId: user.organizationId,
      facilityId: user.facilityId,
    });
  }

  // GET /patients/:patientId/documents/:documentId — document metadata
  @Get('patients/:patientId/documents/:documentId')
  @UseGuards(PatientAccessGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ORG_ADMIN,
    UserRole.FACILITY_ADMIN,
    UserRole.DOCTOR,
    UserRole.NURSE,
    ...PATIENT_ROLES,
  )
  @ApiOperation({ summary: 'Get document metadata' })
  async getDocument(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.documentsService.getDocumentById(documentId, patientId, user.organizationId ?? '', {
      id: user.sub,
      role: user.role,
      organizationId: user.organizationId ?? '',
    });
  }

  // GET /patients/:patientId/documents/:documentId/download-url — signed URL
  @Get('patients/:patientId/documents/:documentId/download-url')
  @UseGuards(PatientAccessGuard)
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ORG_ADMIN,
    UserRole.FACILITY_ADMIN,
    UserRole.DOCTOR,
    UserRole.NURSE,
    ...PATIENT_ROLES,
  )
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Get a signed URL to view/download a document' })
  async getDownloadUrl(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Query() query: DownloadDocumentQueryDto,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ) {
    return this.documentsService.getDownloadUrl(
      documentId,
      patientId,
      user.organizationId ?? '',
      { id: user.sub, role: user.role, organizationId: user.organizationId ?? '' },
      this.ctx(req),
      query.mode,
    );
  }

  // DELETE /patients/:patientId/documents/:documentId — soft delete
  @Delete('patients/:patientId/documents/:documentId')
  @UseGuards(PatientAccessGuard)
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN, UserRole.DOCTOR)
  @ApiOperation({ summary: 'Soft-delete a document' })
  async deleteDocument(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ) {
    return this.documentsService.deleteDocument(
      documentId,
      patientId,
      user.organizationId ?? '',
      user.sub,
      this.ctx(req),
    );
  }

  // PATCH /patients/:patientId/documents/:documentId — update metadata
  @Patch('patients/:patientId/documents/:documentId')
  @UseGuards(PatientAccessGuard)
  @Roles(...ADMIN_ROLES, UserRole.DOCTOR)
  @ApiOperation({
    summary: 'Update document metadata (category, title, description, notes)',
  })
  async updateDocument(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() dto: UpdateDocumentDto,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ) {
    return this.documentsService.updateDocument(documentId, patientId, dto, user, this.ctx(req));
  }

  // POST /patients/:patientId/documents/:documentId/archive — archive/restore
  @Post('patients/:patientId/documents/:documentId/archive')
  @UseGuards(PatientAccessGuard)
  @HttpCode(HttpStatus.OK)
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Archive or restore a document (admin only)' })
  async archiveDocument(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() dto: ArchiveDocumentDto,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
  ) {
    return this.documentsService.archiveDocument(documentId, patientId, dto, user, this.ctx(req));
  }

  // GET /patients/:patientId/documents/:documentId/history — audit trail
  @Get('patients/:patientId/documents/:documentId/history')
  @UseGuards(PatientAccessGuard)
  @Roles(...ADMIN_ROLES, UserRole.DOCTOR, UserRole.NURSE, ...PATIENT_ROLES)
  @ApiOperation({ summary: 'Audit history for a single document' })
  async getDocumentHistory(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.documentsService.getDocumentHistory(documentId, patientId, {
      id: user.sub,
      role: user.role,
      organizationId: user.organizationId,
      facilityId: user.facilityId,
    });
  }

  // GET /documents/download/:token — serve file via signed token
  @Get('documents/download/:token')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({ summary: 'Download a document using a signed token' })
  async downloadByToken(
    @Param('token') token: string,
    @CurrentUser() user: AccessTokenPayload,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { buffer, mimeType, originalName, disposition } =
      await this.documentsService.downloadByToken(
        token,
        {
          id: user.sub,
          role: user.role,
          organizationId: user.organizationId ?? null,
        },
        this.ctx(req),
      );

    // Sanitize the filename: strip path separators and control characters,
    // then RFC 5987-encode for safe use in Content-Disposition.
    const safeBase = originalName
      .replace(/[/\\]/g, '_') // no path separators
      .replace(/[^\w.\-() ]/g, '_') // only safe chars
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 200); // cap length

    // Use RFC 5987 encoding (filename*) to safely handle any remaining characters
    const encodedName = encodeURIComponent(safeBase);
    const dispositionLine =
      disposition === 'inline'
        ? `inline; filename="${safeBase}"; filename*=UTF-8''${encodedName}`
        : `attachment; filename="${safeBase}"; filename*=UTF-8''${encodedName}`;

    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': dispositionLine,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    });

    return new StreamableFile(buffer);
  }
}
