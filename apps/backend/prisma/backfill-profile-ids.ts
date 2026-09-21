/**
 * Medivault — Backfill 8-character Profile IDs (Dev/Prod utility)
 *
 * Every patient must have a `profileId` — an 8-character code (unique within the
 * organization) that doctors/admins use to look up a profile without exposing the
 * internal UUID. This script assigns codes to any existing patients that don't
 * have one yet.
 *
 * Run:
 *   cd apps/backend
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/backfill-profile-ids.ts
 */

import mongoose from 'mongoose';

const DATABASE_URL = process.env.DATABASE_URL ?? 'mongodb://localhost:27017/medivault';

// No ambiguous characters (no I/O/0/1) so codes are easy to read aloud.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    const byte = require('crypto').randomBytes(1)[0];
    code += ALPHABET[byte % ALPHABET.length];
  }
  return code;
}

async function main() {
  console.log('Connecting to MongoDB…');
  await mongoose.connect(DATABASE_URL);
  console.log('Connected\n');

  const db = mongoose.connection.db!;
  const patients = db.collection('patients');

  const missing = await patients
    .find({ $or: [{ profileId: { $exists: false } }, { profileId: null }] })
    .project({ profileId: 1 })
    .toArray();

  console.log(`${missing.length} patient(s) missing a profile ID.\n`);

  let assigned = 0;
  let skipped = 0;

  for (const patient of missing) {
    const organizationId = patient.organizationId ?? null;
    let attempts = 0;
    let code: string | null = null;

    while (!code && attempts < 10) {
      const candidate = generateCode();
      attempts++;
      const existing = await patients.findOne({ organizationId, profileId: candidate });
      if (!existing) code = candidate;
    }

    if (!code) {
      console.log(`  ⚠  Skipped : ${patient._id} (could not generate unique code)`);
      skipped++;
      continue;
    }

    await patients.updateOne({ _id: patient._id }, { $set: { profileId: code } });
    assigned++;
    if (assigned % 50 === 0) console.log(`  ✓  ${assigned} assigned…`);
  }

  console.log(`\nDone — ${assigned} assigned, ${skipped} skipped.`);
}

main()
  .catch((e) => {
    console.error('Backfill failed:', e);
    process.exit(1);
  })
  .finally(() => mongoose.disconnect());