/**
 * Blood groups are stored inconsistently: staff-created patients go through
 * CreatePatientDto and land as the enum ("A_POSITIVE"), while self-registered
 * patients store the raw symbol ("A-"). Both spellings denote the same group,
 * so filters match on the full alias set and writes normalise to the enum form.
 */
export const BLOOD_GROUP_SYMBOL_TO_ENUM: Record<string, string> = {
  'A+': 'A_POSITIVE',
  'A-': 'A_NEGATIVE',
  'B+': 'B_POSITIVE',
  'B-': 'B_NEGATIVE',
  'AB+': 'AB_POSITIVE',
  'AB-': 'AB_NEGATIVE',
  'O+': 'O_POSITIVE',
  'O-': 'O_NEGATIVE',
};

const BLOOD_GROUP_ENUM_TO_SYMBOL: Record<string, string> = Object.entries(
  BLOOD_GROUP_SYMBOL_TO_ENUM,
).reduce<Record<string, string>>((acc, [symbol, enumValue]) => {
  acc[enumValue] = symbol;
  return acc;
}, {});

/** Every accepted spelling for a blood group, enum form first. */
const BLOOD_GROUP_ALIASES: Record<string, string[]> = Object.entries(
  BLOOD_GROUP_SYMBOL_TO_ENUM,
).reduce<Record<string, string[]>>((acc, [symbol, enumValue]) => {
  acc[symbol] = [enumValue, symbol];
  acc[enumValue] = [enumValue, symbol];
  return acc;
}, {});

/** All values the blood-group filter accepts (symbol and enum spellings). */
export const BLOOD_GROUP_FILTER_VALUES = Object.keys(BLOOD_GROUP_ALIASES);

/** The display symbols offered by filter UIs. */
export const BLOOD_GROUP_SYMBOLS = Object.keys(BLOOD_GROUP_SYMBOL_TO_ENUM);

/** Resolve any accepted spelling to the alias list used for matching. */
export function bloodGroupAliases(value: string): string[] | undefined {
  return BLOOD_GROUP_ALIASES[value.trim().toUpperCase()];
}

/** Normalise any accepted spelling to the canonical enum stored in Mongo. */
export function normalizeBloodGroup(value: string | null | undefined): string | null {
  if (!value) return null;
  const key = value.trim().toUpperCase();
  if (key === 'UNKNOWN') return 'UNKNOWN';
  return BLOOD_GROUP_SYMBOL_TO_ENUM[key] ?? null;
}

/** Canonical display symbol ("A-") for any stored spelling. */
export function bloodGroupToSymbol(value: string | null | undefined): string | null {
  if (!value) return null;
  const key = value.trim().toUpperCase();
  return BLOOD_GROUP_ENUM_TO_SYMBOL[key] ?? key;
}
