import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind classes safely, resolving conflicts with tailwind-merge.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a date as a human-readable string.
 */
export function formatDate(
  date: Date | string | null | undefined,
  format: 'short' | 'long' | 'relative' = 'short',
): string {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';

  if (format === 'relative') {
    const now = Date.now();
    const diff = now - d.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
  }

  if (format === 'long') {
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  }

  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Calculate age from a date of birth.
 */
export function calculateAge(dob: Date | string | null | undefined): string {
  if (!dob) return '—';
  const d = new Date(dob);
  if (isNaN(d.getTime())) return '—';
  const now = new Date();
  let years = now.getFullYear() - d.getFullYear();
  const months = now.getMonth() - d.getMonth();
  if (months < 0 || (months === 0 && now.getDate() < d.getDate())) {
    years--;
  }
  return `${years} yrs`;
}

/**
 * Get initials from a full name.
 */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/**
 * Truncate a string to a max length with ellipsis.
 */
export function truncate(str: string, max = 50): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + '…';
}

const CLINICAL_PREFIXES: Record<string, string> = {
  DOCTOR: 'Dr.',
  RADIOLOGIST: 'Dr.',
  PHARMACIST: 'Mr.',
  NURSE: 'Sr.',
  LAB_TECHNICIAN: 'Mr.',
};

/**
 * Render a staff member's display name with a role-appropriate title prefix,
 * e.g. "Dr. Anita Sharma". Avoids double-prefixing names that already carry one.
 */
export function formatStaffName(
  name: string | null | undefined,
  role?: string | null,
): string {
  const clean = (name ?? '').trim().replace(/\s+/g, ' ');
  if (!clean) return '—';

  const prefix = role ? CLINICAL_PREFIXES[role.toUpperCase()] : undefined;
  if (!prefix) return clean;
  return clean.toLowerCase().startsWith(`${prefix.toLowerCase()} `)
    ? clean
    : `${prefix} ${clean}`;
}

const BLOOD_GROUP_SYMBOL_TO_ENUM: Record<string, string> = {
  'A+': 'A_POSITIVE',
  'A-': 'A_NEGATIVE',
  'B+': 'B_POSITIVE',
  'B-': 'B_NEGATIVE',
  'AB+': 'AB_POSITIVE',
  'AB-': 'AB_NEGATIVE',
  'O+': 'O_POSITIVE',
  'O-': 'O_NEGATIVE',
};

/**
 * Render a stored blood group as its display symbol. The API returns the enum
 * ("A_POSITIVE") but older self-registered rows hold the symbol ("A-"), so
 * normalise both. Mirrors the backend blood-group.util.ts.
 */
export function formatBloodGroup(value: string | null | undefined): string {
  const key = (value ?? '').trim().toUpperCase();
  if (!key) return '—';
  if (BLOOD_GROUP_SYMBOL_TO_ENUM[key]) return key;
  const symbol = Object.entries(BLOOD_GROUP_SYMBOL_TO_ENUM).find(
    ([, enumValue]) => enumValue === key,
  )?.[0];
  return symbol ?? key;
}
