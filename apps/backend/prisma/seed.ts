/**
 * Medivault — Database Seed Script (Development Only)
 *
 * Creates:
 *   - 1 default organization + facility
 *   - One user per role (Super Admin, Org Admin, Doctor, Nurse, Receptionist)
 *   - 5 sample patients
 *   - Sample vitals, diagnoses, prescriptions for first patient
 *
 * Run:
 *   cd apps/backend
 *   npx prisma db seed
 *
 * IMPORTANT: Never run this against a production database.
 * All passwords use Argon2id hashing. Change credentials before any real deployment.
 */

import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// ─── Default test credentials (DEVELOPMENT ONLY) ──────────────────────────────
const TEST_PASSWORD = 'Medivault@Dev2024!';

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
}

async function main() {
  console.log('🌱 Seeding Medivault development database…\n');

  const hashedPassword = await hashPassword(TEST_PASSWORD);

  // ─── Organization ──────────────────────────────────────────────────────────
  const org = await prisma.organization.upsert({
    where: { licenseNumber: 'LIC-CGH-2024-001' },
    update: {},
    create: {
      name: 'City General Hospital',
      type: 'hospital',
      address: {
        street: '123 Hospital Road, Medical District',
        city: 'Mumbai',
        state: 'Maharashtra',
        country: 'India',
        pincode: '400001',
      },
      phone: '+91 22 1234 5678',
      email: 'admin@citygeneral.example.com',
      licenseNumber: 'LIC-CGH-2024-001',
      isActive: true,
    },
  });
  console.log(`✅ Organization: ${org.name} (${org.id})`);

  // ─── Facility ──────────────────────────────────────────────────────────────
  let facility = await prisma.facility.findFirst({
    where: { organizationId: org.id, name: 'Main Campus' },
  });
  if (!facility) {
    facility = await prisma.facility.create({
      data: {
        organizationId: org.id,
        name: 'Main Campus',
        type: 'general',
        address: {
          street: '123 Hospital Road',
          city: 'Mumbai',
          state: 'Maharashtra',
        },
        phone: '+91 22 1234 5678',
        email: 'maincampus@citygeneral.example.com',
        isActive: true,
      },
    });
  }
  console.log(`✅ Facility: ${facility.name} (${facility.id})`);

  // ─── Staff Users ───────────────────────────────────────────────────────────
  const staffUsers = [
    {
      email: 'superadmin@medivault.dev',
      username: 'superadmin',
      firstName: 'System',
      lastName: 'Administrator',
      role: 'SUPER_ADMIN' as const,
      orgId: null as string | null,
      facilityId: null as string | null,
    },
    {
      email: 'admin@citygeneral.dev',
      username: 'admin_cgh',
      firstName: 'Admin',
      lastName: 'User',
      role: 'ORG_ADMIN' as const,
      orgId: org.id,
      facilityId: facility.id,
    },
    {
      email: 'dr.sharma@citygeneral.dev',
      username: 'dr_sharma',
      firstName: 'Rajesh',
      lastName: 'Sharma',
      role: 'DOCTOR' as const,
      orgId: org.id,
      facilityId: facility.id,
    },
    {
      email: 'nurse.priya@citygeneral.dev',
      username: 'nurse_priya',
      firstName: 'Priya',
      lastName: 'Nair',
      role: 'NURSE' as const,
      orgId: org.id,
      facilityId: facility.id,
    },
    {
      email: 'reception@citygeneral.dev',
      username: 'receptionist_cgh',
      firstName: 'Meera',
      lastName: 'Patel',
      role: 'RECEPTIONIST' as const,
      orgId: org.id,
      facilityId: facility.id,
    },
  ];

  const createdUsers: Record<string, { id: string }> = {};
  for (const u of staffUsers) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        username: u.username,
        firstName: u.firstName,
        lastName: u.lastName,
        passwordHash: hashedPassword,
        role: u.role,
        organizationId: u.orgId ?? undefined,
        facilityId: u.facilityId ?? undefined,
        isActive: true,
        isEmailVerified: true,
      },
    });
    createdUsers[u.role] = { id: user.id };
    console.log(`✅ User [${u.role}]: ${u.email}`);
  }

  // Receptionist creates patients — we need their ID
  const registrarId =
    createdUsers['RECEPTIONIST']?.id ?? createdUsers['ORG_ADMIN']?.id ?? '';

  // ─── Sample Patients ───────────────────────────────────────────────────────
  const samplePatients = [
    {
      mrn: 'MV000001',
      firstName: 'Arjun',
      lastName: 'Kumar',
      dateOfBirth: new Date('1985-03-15'),
      gender: 'MALE' as const,
      bloodGroup: 'O_POSITIVE' as const,
      phone: '+91 98765 43210',
      email: 'arjun.kumar@example.com',
    },
    {
      mrn: 'MV000002',
      firstName: 'Sunita',
      lastName: 'Devi',
      dateOfBirth: new Date('1992-07-22'),
      gender: 'FEMALE' as const,
      bloodGroup: 'A_POSITIVE' as const,
      phone: '+91 87654 32109',
      email: 'sunita.devi@example.com',
    },
    {
      mrn: 'MV000003',
      firstName: 'Mohammed',
      lastName: 'Ali',
      dateOfBirth: new Date('1978-11-08'),
      gender: 'MALE' as const,
      bloodGroup: 'B_POSITIVE' as const,
      phone: '+91 76543 21098',
      email: undefined,
    },
    {
      mrn: 'MV000004',
      firstName: 'Kavitha',
      lastName: 'Krishnan',
      dateOfBirth: new Date('1965-04-30'),
      gender: 'FEMALE' as const,
      bloodGroup: 'AB_NEGATIVE' as const,
      phone: '+91 65432 10987',
      email: 'kavitha.k@example.com',
    },
    {
      mrn: 'MV000005',
      firstName: 'Ravi',
      lastName: 'Shankar',
      dateOfBirth: new Date('2000-01-01'),
      gender: 'MALE' as const,
      bloodGroup: 'O_NEGATIVE' as const,
      phone: '+91 54321 09876',
      email: undefined,
    },
  ];

  const createdPatientIds: string[] = [];
  for (const p of samplePatients) {
    const patient = await prisma.patient.upsert({
      where: { mrn: p.mrn },
      update: {},
      create: {
        mrn: p.mrn,
        firstName: p.firstName,
        lastName: p.lastName,
        dateOfBirth: p.dateOfBirth,
        gender: p.gender,
        bloodGroup: p.bloodGroup,
        phone: p.phone,
        email: p.email,
        organizationId: org.id,
        facilityId: facility.id,
        registeredById: registrarId,
        isActive: true,
      },
    });
    createdPatientIds.push(patient.id);
    console.log(`✅ Patient: ${p.firstName} ${p.lastName} (${p.mrn})`);
  }

  // ─── Sample medical records for first patient ──────────────────────────────
  const firstPatientId = createdPatientIds[0];
  const doctorId = createdUsers['DOCTOR']?.id;

  if (firstPatientId && doctorId) {
    // Sample vitals
    const existingVitals = await prisma.vital.count({ where: { patientId: firstPatientId } });
    if (existingVitals === 0) {
      await prisma.vital.createMany({
        data: [
          {
            patientId: firstPatientId,
            recordedById: doctorId,
            bloodPressureSystolic: 142,
            bloodPressureDiastolic: 88,
            heartRate: 78,
            temperature: 37.2,
            respiratoryRate: 16,
            oxygenSaturation: 97,
            weight: 82.5,
            height: 175,
            bmi: 26.9,
            recordedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
          {
            patientId: firstPatientId,
            recordedById: doctorId,
            bloodPressureSystolic: 138,
            bloodPressureDiastolic: 86,
            heartRate: 75,
            temperature: 36.8,
            respiratoryRate: 15,
            oxygenSaturation: 98,
            weight: 82.0,
            height: 175,
            bmi: 26.8,
            recordedAt: new Date(),
          },
        ],
      });
      console.log('✅ Vitals created for Arjun Kumar');
    }

    // Create a medical record (encounter) to attach diagnoses/prescriptions to
    let encounter = await prisma.medicalRecord.findFirst({
      where: { patientId: firstPatientId, doctorId },
    });
    if (!encounter) {
      encounter = await prisma.medicalRecord.create({
        data: {
          patientId: firstPatientId,
          doctorId,
          facilityId: facility.id,
          encounterType: 'OUTPATIENT',
          encounterDate: new Date('2024-01-15'),
          chiefComplaint: 'Routine follow-up for diabetes and hypertension',
          assessment: 'Type 2 diabetes poorly controlled; hypertension stage 1',
          plan: 'Continue current medications, repeat HbA1c in 3 months',
        },
      });
    }

    // Sample diagnoses
    const existingDx = await prisma.diagnosis.count({ where: { patientId: firstPatientId } });
    if (existingDx === 0) {
      await prisma.diagnosis.createMany({
        data: [
          {
            patientId: firstPatientId,
            medicalRecordId: encounter.id,
            diagnosisCode: 'E11',
            diagnosisName: 'Type 2 Diabetes Mellitus',
            diagnosisType: 'PRIMARY',
            severity: 'HIGH',
            status: 'CHRONIC',
            diagnosedAt: new Date('2020-06-15'),
          },
          {
            patientId: firstPatientId,
            medicalRecordId: encounter.id,
            diagnosisCode: 'I10',
            diagnosisName: 'Essential Hypertension',
            diagnosisType: 'SECONDARY',
            severity: 'MODERATE',
            status: 'CHRONIC',
            diagnosedAt: new Date('2021-03-20'),
          },
        ],
      });
      console.log('✅ Diagnoses created for Arjun Kumar');
    }

    // Sample prescriptions
    const existingRx = await prisma.prescription.count({ where: { patientId: firstPatientId } });
    if (existingRx === 0) {
      await prisma.prescription.createMany({
        data: [
          {
            patientId: firstPatientId,
            prescribedById: doctorId,
            medicalRecordId: encounter.id,
            medicationName: 'Metformin',
            genericName: 'Metformin Hydrochloride',
            dosage: '500mg',
            frequency: 'Twice daily',
            route: 'ORAL',
            instructions: 'Take with meals. Monitor blood glucose regularly.',
            duration: '90 days',
            refills: 2,
            isActive: true,
          },
          {
            patientId: firstPatientId,
            prescribedById: doctorId,
            medicalRecordId: encounter.id,
            medicationName: 'Amlodipine',
            genericName: 'Amlodipine Besylate',
            dosage: '5mg',
            frequency: 'Once daily',
            route: 'ORAL',
            instructions: 'Take in the morning.',
            duration: '90 days',
            refills: 2,
            isActive: true,
          },
        ],
      });
      console.log('✅ Prescriptions created for Arjun Kumar');
    }

    console.log('✅ Sample medical records created for Arjun Kumar');
  }

  console.log('\n🎉 Seeding complete!\n');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  TEST CREDENTIALS  (DEVELOPMENT ONLY — DO NOT REUSE)');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Password for all accounts:');
  console.log(`  ${TEST_PASSWORD}`);
  console.log('');
  console.log('  Accounts:');
  for (const u of staffUsers) {
    console.log(`  [${u.role.padEnd(14)}] ${u.email}`);
  }
  console.log('═══════════════════════════════════════════════════════');
  console.log('  ⚠  Change all passwords before any real deployment!');
  console.log('═══════════════════════════════════════════════════════\n');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
