/**
 * Medivault — MongoDB Demo Seed Script (Development)
 *
 * Seeds a realistic demo dataset:
 *   • One organization ("City General Hospital") with two facilities
 *     (Main Campus + North Wing) so facility scoping can be demonstrated.
 *   • Users for every role — super admin, org admin, 2 facility admins,
 *     2 doctors, nurse, receptionist, lab technician, pharmacist, and
 *     5 patients (each linked to a matching patient record).
 *   • Patient records with blood group, allergies (incl. a critical one),
 *     emergency contacts and active conditions.
 *
 * Safe to run multiple times — uses upsert logic keyed on email.
 *
 * Run:
 *   cd apps/backend
 *   npm run mongo:seed
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';

const DATABASE_URL = process.env.DATABASE_URL ?? 'mongodb://localhost:27017/medivault';

// ─── Argon2 options (must match AuthService) ─────────────────────────────────
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
  hashLength: 32,
} as argon2.HashOptions;

// ─── Test password (all accounts) ────────────────────────────────────────────
const PASSWORD = 'Medivault@Dev2024!';

// ─── Tenant structure ────────────────────────────────────────────────────────
// There is no Organization/Facility collection — these UUIDs are referenced by
// users, patients and documents. Human-readable values make debugging easier.
const ORG_CITY_GENERAL = 'b4c2a1f0-1111-4a5e-9d3c-0aa1bb2cc3dd';
const FACILITY_MAIN = 'c9a1d0e2-2222-4a6e-8d7c-1f2a3b4c5d6e';
const FACILITY_NORTH = 'd8b2e1f3-3333-4b7f-9e8d-2a3b4c5d6e7f';

// ─── Demo users ──────────────────────────────────────────────────────────────
// `facility` is the facilityId the account is scoped to (null = org-wide).
// Patient accounts must match a seeded patient record by email + org.
const DEMO_USERS = [
  {
    email: 'superadmin@medivault.dev',
    username: 'superadmin',
    firstName: 'System',
    lastName: 'Administrator',
    role: 'SUPER_ADMIN',
    facility: null,
  },
  {
    email: 'admin@citygeneral.dev',
    username: 'admin_citygeneral',
    firstName: 'Ananya',
    lastName: 'Mehta',
    role: 'ORG_ADMIN',
    facility: null,
  },
  {
    email: 'facility.admin.main@citygeneral.dev',
    username: 'facadmin_main',
    firstName: 'Robert',
    lastName: 'D\'Souza',
    role: 'FACILITY_ADMIN',
    facility: FACILITY_MAIN,
  },
  {
    email: 'facility.admin.north@citygeneral.dev',
    username: 'facadmin_north',
    firstName: 'Sarah',
    lastName: 'Williams',
    role: 'FACILITY_ADMIN',
    facility: FACILITY_NORTH,
  },
  {
    email: 'dr.sharma@citygeneral.dev',
    username: 'dr_sharma',
    firstName: 'Rajesh',
    lastName: 'Sharma',
    role: 'DOCTOR',
    facility: FACILITY_MAIN,
  },
  {
    email: 'dr.verma@citygeneral.dev',
    username: 'dr_verma',
    firstName: 'Neha',
    lastName: 'Verma',
    role: 'DOCTOR',
    facility: FACILITY_NORTH,
  },
  {
    email: 'nurse.priya@citygeneral.dev',
    username: 'nurse_priya',
    firstName: 'Priya',
    lastName: 'Nair',
    role: 'NURSE',
    facility: FACILITY_MAIN,
  },
  {
    email: 'reception@citygeneral.dev',
    username: 'receptionist',
    firstName: 'Farah',
    lastName: 'Khan',
    role: 'RECEPTIONIST',
    facility: FACILITY_MAIN,
  },
  {
    email: 'lab.tech@citygeneral.dev',
    username: 'lab_tech',
    firstName: 'Sunil',
    lastName: 'Patil',
    role: 'LAB_TECHNICIAN',
    facility: FACILITY_MAIN,
  },
  {
    email: 'pharmacist@citygeneral.dev',
    username: 'pharmacist',
    firstName: 'Alok',
    lastName: 'Gupta',
    role: 'PHARMACIST',
    facility: FACILITY_MAIN,
  },
  {
    email: 'patient.meera@citygeneral.dev',
    username: 'patient_meera',
    firstName: 'Meera',
    lastName: 'Iyer',
    role: 'PATIENT',
    facility: FACILITY_MAIN,
  },
  {
    email: 'patient.vikram@citygeneral.dev',
    username: 'patient_vikram',
    firstName: 'Vikram',
    lastName: 'Singh',
    role: 'PATIENT',
    facility: FACILITY_MAIN,
  },
  {
    email: 'patient.anita@citygeneral.dev',
    username: 'patient_anita',
    firstName: 'Anita',
    lastName: 'Desai',
    role: 'PATIENT',
    facility: FACILITY_MAIN,
  },
  {
    email: 'patient.ravi@citygeneral.dev',
    username: 'patient_ravi',
    firstName: 'Ravi',
    lastName: 'Kumar',
    role: 'PATIENT',
    facility: FACILITY_NORTH,
  },
  {
    email: 'patient.deepak@citygeneral.dev',
    username: 'patient_deepak',
    firstName: 'Deepak',
    lastName: 'Rao',
    role: 'PATIENT',
    facility: FACILITY_NORTH,
  },
];

// ─── Demo patient records (linked to PATIENT accounts by email) ──────────────
interface DemoPatientInput {
  email: string;
  firstName: string;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  bloodGroup: string;
  phoneNumber: string;
  city: string;
  state: string;
  pincode: string;
  profileId: string;
  mrn: string;
  facilityId: string;
  biometricEnrolled: boolean;
  allergies: Array<{
    allergen: string;
    allergyType: string;
    severity: string;
    reaction: string;
  }>;
  conditions: Array<{ conditionName: string; conditionCode: string; notes: string }>;
  emergencyContacts: Array<{ name: string; relationship: string; phone: string; email: string | null }>;
}

const DEMO_PATIENTS: DemoPatientInput[] = [
  {
    email: 'patient.meera@citygeneral.dev',
    firstName: 'Meera',
    lastName: 'Iyer',
    gender: 'female',
    dateOfBirth: '1992-03-14',
    bloodGroup: 'A+',
    phoneNumber: '+91 98450 11223',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560001',
    profileId: 'CGME7R42',
    mrn: 'MRN-2026-3A2F9C',
    facilityId: FACILITY_MAIN,
    biometricEnrolled: true,
    allergies: [
      { allergen: 'Penicillin', allergyType: 'drug', severity: 'HIGH', reaction: 'Hives, swelling' },
      { allergen: 'Peanuts', allergyType: 'food', severity: 'SEVERE', reaction: 'Anaphylaxis' },
    ],
    conditions: [
      { conditionName: 'Asthma', conditionCode: 'J45', notes: 'Exercise-induced, uses inhaler' },
    ],
    emergencyContacts: [
      { name: 'Rahul Iyer', relationship: 'Husband', phone: '+91 98450 55667', email: null },
    ],
  },
  {
    email: 'patient.vikram@citygeneral.dev',
    firstName: 'Vikram',
    lastName: 'Singh',
    gender: 'male',
    dateOfBirth: '1985-07-02',
    bloodGroup: 'O+',
    phoneNumber: '+91 98765 00998',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560034',
    profileId: 'CGVI4K19',
    mrn: 'MRN-2026-7C1E4B',
    facilityId: FACILITY_MAIN,
    biometricEnrolled: false,
    allergies: [
      { allergen: 'Sulfa drugs', allergyType: 'drug', severity: 'MODERATE', reaction: 'Rash' },
    ],
    conditions: [
      { conditionName: 'Hypertension', conditionCode: 'I10', notes: 'On amlodipine 5mg' },
    ],
    emergencyContacts: [
      { name: 'Kavita Singh', relationship: 'Wife', phone: '+91 98765 44556', email: null },
    ],
  },
  {
    email: 'patient.anita@citygeneral.dev',
    firstName: 'Anita',
    lastName: 'Desai',
    gender: 'female',
    dateOfBirth: '1978-11-23',
    bloodGroup: 'B+',
    phoneNumber: '+91 99887 12340',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560095',
    profileId: 'CGAN9T63',
    mrn: 'MRN-2026-5B8D2F',
    facilityId: FACILITY_MAIN,
    biometricEnrolled: false,
    allergies: [],
    conditions: [
      { conditionName: 'Type 2 Diabetes', conditionCode: 'E11', notes: 'Controlled with metformin' },
    ],
    emergencyContacts: [
      { name: 'Leela Desai', relationship: 'Sister', phone: '+91 99887 77889', email: null },
    ],
  },
  {
    email: 'patient.ravi@citygeneral.dev',
    firstName: 'Ravi',
    lastName: 'Kumar',
    gender: 'male',
    dateOfBirth: '1995-01-30',
    bloodGroup: 'AB-',
    phoneNumber: '+91 97654 22110',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560043',
    profileId: 'CGRA2X57',
    mrn: 'MRN-2026-9D4A3C',
    facilityId: FACILITY_NORTH,
    biometricEnrolled: true,
    allergies: [{ allergen: 'Latex', allergyType: 'environment', severity: 'MILD', reaction: 'Contact rash' }],
    conditions: [],
    emergencyContacts: [
      { name: 'Sanjay Kumar', relationship: 'Brother', phone: '+91 97654 66442', email: null },
    ],
  },
  {
    email: 'patient.deepak@citygeneral.dev',
    firstName: 'Deepak',
    lastName: 'Rao',
    gender: 'male',
    dateOfBirth: '1980-05-09',
    bloodGroup: 'O-',
    phoneNumber: '+91 96543 88776',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560066',
    profileId: 'CGDE8W31',
    mrn: 'MRN-2026-2E6B9A',
    facilityId: FACILITY_NORTH,
    biometricEnrolled: true,
    allergies: [
      { allergen: 'Iodine contrast', allergyType: 'drug', severity: 'CRITICAL', reaction: 'Hypotension, bronchospasm' },
    ],
    conditions: [
      { conditionName: 'Ischemic heart disease', conditionCode: 'I25', notes: 'Post-CABG, on statin' },
    ],
    emergencyContacts: [
      { name: 'Sita Rao', relationship: 'Mother', phone: '+91 96543 33554', email: null },
    ],
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function upsertUser(db: any, u: (typeof DEMO_USERS)[number], orgId: string, passwordHash: string, now: Date) {
  const usersCollection = db.collection('users');
  const existing = await usersCollection.findOne({ email: u.email });

  const updates: Record<string, any> = {
    $set: {
      passwordHash,
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.role,
      organizationId: u.role === 'SUPER_ADMIN' ? null : orgId,
      facilityId: u.facility,
      isActive: true,
      isEmailVerified: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
      updatedAt: now,
    },
  };

  if (existing) {
    await usersCollection.updateOne({ email: u.email }, updates);
    return existing._id;
  }

  const _id = randomUUID();
  await usersCollection.insertOne({
    _id,
    email: u.email,
    username: u.username,
    passwordHash,
    firstName: u.firstName,
    lastName: u.lastName,
    phone: null,
    role: u.role,
    organizationId: u.role === 'SUPER_ADMIN' ? null : orgId,
    facilityId: u.facility,
    isActive: true,
    isEmailVerified: true,
    mfaEnabled: false,
    mfaSecret: null,
    mfaBackupCodes: '[]',
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    passwordChangedAt: null,
    emailVerificationTokenHash: null,
    emailVerificationTokenExpiresAt: null,
    resetTokenHash: null,
    resetTokenExpiresAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
  return _id;
}

async function upsertPatient(db: any, p: DemoPatientInput, orgId: string, registeredById: string, now: Date) {
  const patientsCollection = db.collection('patients');
  const existing = await patientsCollection.findOne({ email: p.email, organizationId: orgId, deletedAt: null });

  const allergies = p.allergies.map((a) => ({
    id: randomUUID(),
    allergen: a.allergen,
    allergyType: a.allergyType,
    severity: a.severity,
    reaction: a.reaction,
    notes: null,
    isActive: true,
    createdAt: now,
  }));

  const conditions = p.conditions.map((c) => ({
    id: randomUUID(),
    conditionName: c.conditionName,
    conditionCode: c.conditionCode,
    status: 'ACTIVE',
    diagnosedAt: now,
    notes: c.notes,
    createdAt: now,
  }));

  const emergencyContacts = p.emergencyContacts.map((ec) => ({
    id: randomUUID(),
    name: ec.name,
    relationship: ec.relationship,
    phone: ec.phone,
    email: ec.email,
    isActive: true,
    createdAt: now,
  }));

  const demographic = {
    firstName: p.firstName,
    lastName: p.lastName,
    gender: p.gender,
    dateOfBirth: new Date(p.dateOfBirth),
    bloodGroup: p.bloodGroup,
    phoneNumber: p.phoneNumber,
    city: p.city,
    state: p.state,
    pincode: p.pincode,
    facilityId: p.facilityId,
    biometricEnrolled: p.biometricEnrolled,
    allergies,
    conditions,
    emergencyContacts,
    isActive: true,
    updatedAt: now,
  };

  if (existing) {
    await patientsCollection.updateOne({ _id: existing._id }, { $set: demographic });
    return existing._id;
  }

  const _id = randomUUID();
  await patientsCollection.insertOne({
    _id,
    mrn: p.mrn,
    profileId: p.profileId,
    ...demographic,
    address: null,
    middleName: null,
    email: p.email,
    organizationId: orgId,
    registeredById,
    registeredAt: now,
    createdAt: now,
    deletedAt: null,
  });
  return _id;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Connecting to MongoDB…');
  await mongoose.connect(DATABASE_URL);
  console.log('✅ Connected\n');

  const db = mongoose.connection.db!;
  const passwordHash = await argon2.hash(PASSWORD, ARGON2_OPTIONS);
  const now = new Date();

  // 1. Create / update users, collecting the ORG_ADMIN id for patient registration.
  let registeredById = null;
  for (const u of DEMO_USERS) {
    const id = await upsertUser(db, u, ORG_CITY_GENERAL, passwordHash, now);
    if (u.role === 'ORG_ADMIN') registeredById = id;
    console.log(`  ${u.role.padEnd(14)} ${u.email}`);
  }

  // 2. Create / update matching patient records for the PATIENT accounts.
  const patientEmails = new Set(DEMO_USERS.filter((u) => u.role === 'PATIENT').map((u) => u.email));
  for (const p of DEMO_PATIENTS) {
    const id = await upsertPatient(db, p, ORG_CITY_GENERAL, registeredById ?? null, now);
    console.log(`  PATIENT record  ${p.email} → ${p.mrn} (${p.profileId})`);
  }

  // 3. Sanity check: patient-account ↔ record linkage intact.
  const unmatched = DEMO_PATIENTS.filter((p) => !patientEmails.has(p.email));
  if (unmatched.length) {
    throw new Error(`Patient records without a matching PATIENT account: ${unmatched.map((p) => p.email).join(', ')}`);
  }

  console.log(`\n✅ Demo seed complete — ${DEMO_USERS.length} users, ${DEMO_PATIENTS.length} patient records\n`);
  console.log('═══════════════════════════════════════════════════════');
  console.log('  DEMO CREDENTIALS  (DEVELOPMENT ONLY)');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Password (all accounts): ${PASSWORD}`);
  console.log('───────────────────────────────────────────────────────');
  console.log('  ROLE            EMAIL');
  console.log('───────────────────────────────────────────────────────');
  for (const u of DEMO_USERS) {
    console.log(`  ${u.role.padEnd(14)} ${u.email}`);
  }
  console.log('───────────────────────────────────────────────────────');
  console.log('  Facilities:  MAIN = City General (Main Campus)');
  console.log('               NORTH = City General (North Wing)');
  console.log('  Facility admins are scoped to their own facility only.');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  ⚠  Change all passwords before any real deployment!');
  console.log('═══════════════════════════════════════════════════════\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => mongoose.disconnect());