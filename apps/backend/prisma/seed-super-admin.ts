/**
 * Medivault — Super Admin Seed Script (Development / First-time Setup)
 *
 * Creates (or updates) the super admin account only.
 * Safe to run against an empty database before the full seed.
 *
 * Run:
 *   cd apps/backend
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed-super-admin.ts
 *
 * IMPORTANT: Change the password immediately in any non-development environment.
 */

import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// ─── Credentials — CHANGE BEFORE ANY REAL DEPLOYMENT ─────────────────────────
const SUPER_ADMIN_EMAIL    = 'superadmin@medivault.dev';
const SUPER_ADMIN_USERNAME = 'superadmin';
const SUPER_ADMIN_PASSWORD = 'Medivault@Dev2024!';

async function main() {
  console.log('🔐 Seeding super admin account…\n');

  const passwordHash = await argon2.hash(SUPER_ADMIN_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
    hashLength: 32,
  });

  const user = await prisma.user.upsert({
    where: { email: SUPER_ADMIN_EMAIL },
    update: {
      // Refresh password hash and ensure account is active
      passwordHash,
      isActive: true,
      isEmailVerified: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
    create: {
      email: SUPER_ADMIN_EMAIL,
      username: SUPER_ADMIN_USERNAME,
      passwordHash,
      firstName: 'System',
      lastName: 'Administrator',
      role: 'SUPER_ADMIN',
      isActive: true,
      isEmailVerified: true,
      // Super admin is not scoped to any org or facility
      organizationId: null,
      facilityId: null,
    },
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  console.log('✅ Super admin account ready\n');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  SUPER ADMIN CREDENTIALS  (DEVELOPMENT ONLY)');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  ID       : ${user.id}`);
  console.log(`  Email    : ${user.email}`);
  console.log(`  Username : ${user.username}`);
  console.log(`  Password : ${SUPER_ADMIN_PASSWORD}`);
  console.log(`  Role     : ${user.role}`);
  console.log('═══════════════════════════════════════════════════════');
  console.log('  ⚠  Change this password before any real deployment!');
  console.log('═══════════════════════════════════════════════════════\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
