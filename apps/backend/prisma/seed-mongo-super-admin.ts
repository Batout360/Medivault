/**
 * Medivault — MongoDB Super Admin Seed Script (Development / First-time Setup)
 *
 * Creates (or updates) ONLY the super admin account in MongoDB.
 * Safe to run against an empty database before the full seed.
 *
 * Run:
 *   cd apps/backend
 *   npm run mongo:seed:superadmin
 *
 * IMPORTANT: Change the password immediately in any non-development environment.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';

// ─── Credentials — CHANGE BEFORE ANY REAL DEPLOYMENT ─────────────────────────
const SUPER_ADMIN_EMAIL    = 'superadmin@medivault.dev';
const SUPER_ADMIN_USERNAME = 'superadmin';
const SUPER_ADMIN_PASSWORD = 'Medivault@Dev2024!';

// ─── Argon2 options (must match AuthService) ─────────────────────────────────
const ARGON2_OPTIONS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
  hashLength: 32,
};

async function main() {
  const databaseUrl =
    process.env.DATABASE_URL ?? 'mongodb://localhost:27017/medivault';

  console.log('🔐 Connecting to MongoDB…');
  await mongoose.connect(databaseUrl);
  console.log('✅ Connected\n');

  const db = mongoose.connection.db!;
  const usersCollection = db.collection('users');

  const passwordHash = await argon2.hash(SUPER_ADMIN_PASSWORD, ARGON2_OPTIONS);
  const now = new Date();

  const existing = await usersCollection.findOne({ email: SUPER_ADMIN_EMAIL });

  if (existing) {
    // Refresh password hash and ensure account is active
    await usersCollection.updateOne(
      { email: SUPER_ADMIN_EMAIL },
      {
        $set: {
          passwordHash,
          isActive: true,
          isEmailVerified: true,
          failedLoginAttempts: 0,
          lockedUntil: null,
          updatedAt: now,
        },
      },
    );
    console.log(`  ↻  Updated  : ${SUPER_ADMIN_EMAIL} (SUPER_ADMIN)`);
  } else {
    await usersCollection.insertOne({
      _id: randomUUID() as any,
      email: SUPER_ADMIN_EMAIL,
      username: SUPER_ADMIN_USERNAME,
      passwordHash,
      firstName: 'System',
      lastName: 'Administrator',
      phone: null,
      role: 'SUPER_ADMIN',
      organizationId: null,
      facilityId: null,
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
    console.log(`  ✚  Created  : ${SUPER_ADMIN_EMAIL} (SUPER_ADMIN)`);
  }

  console.log('\n✅ Super admin account ready\n');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  SUPER ADMIN CREDENTIALS  (DEVELOPMENT ONLY)');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Email    : ${SUPER_ADMIN_EMAIL}`);
  console.log(`  Username : ${SUPER_ADMIN_USERNAME}`);
  console.log(`  Password : ${SUPER_ADMIN_PASSWORD}`);
  console.log(`  Role     : SUPER_ADMIN`);
  console.log('═══════════════════════════════════════════════════════');
  console.log('  ⚠  Change this password before any real deployment!');
  console.log('═══════════════════════════════════════════════════════\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => mongoose.disconnect());