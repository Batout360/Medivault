import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Request } from 'express';
import { Patient, PatientDocument } from '../../modules/patients/schemas/patient.schema';
import { PATIENT_ROLES } from '@medivault/shared';

@Injectable()
export class PatientAccessGuard implements CanActivate {
  constructor(@InjectModel(Patient.name) private readonly patientModel: Model<PatientDocument>) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as any).user;

    if (!user) {
      throw new ForbiddenException('Access denied.');
    }

    const patientId = request.params?.patientId || request.params?.id;

    // If no patient ID in route, guard is N/A — let the service handle it
    if (!patientId) {
      return true;
    }

    // Load patient to verify org/facility
    const patient = await this.patientModel
      .findOne({ _id: patientId, deletedAt: null })
      .lean()
      .exec();

    if (!patient) {
      throw new NotFoundException('Patient not found.');
    }

    const role = user.role;

    // SUPER_ADMIN: full access
    if (role === 'SUPER_ADMIN') return true;

    // Must be in the same organization
    if (user.organizationId !== patient.organizationId) {
      throw new ForbiddenException('Access denied to this patient record.');
    }

    // ADMIN / ORG_ADMIN: org-wide access
    if (['ADMIN', 'ORG_ADMIN'].includes(role)) return true;

    // Clinical staff + FACILITY_ADMIN: facility-scoped. Admins are pinned to
    // their own facility the same way doctors/nurses are — a facility admin must
    // never automatically see patients from other facilities.
    if (
      [
        'FACILITY_ADMIN',
        'DOCTOR',
        'NURSE',
        'RECEPTIONIST',
        'LAB_TECHNICIAN',
        'RADIOLOGIST',
        'PHARMACIST',
        'BILLING_STAFF',
      ].includes(role)
    ) {
      if (user.facilityId && user.facilityId !== patient.facilityId) {
        throw new ForbiddenException('You do not have access to patients outside your facility.');
      }
      return true;
    }

    // USER / PATIENT roles: can only access their own record
    if (PATIENT_ROLES.includes(role as (typeof PATIENT_ROLES)[number])) {
      const ownRecord = await this.patientModel
        .findOne({
          email: user.email,
          organizationId: user.organizationId,
          deletedAt: null,
        })
        .lean()
        .exec();

      if (!ownRecord || String(ownRecord._id) !== patientId) {
        throw new ForbiddenException('You may only access your own records.');
      }
      return true;
    }

    throw new ForbiddenException('Access denied.');
  }
}
