import {
  bloodGroupAliases,
  bloodGroupToSymbol,
  normalizeBloodGroup,
} from './blood-group.util';

describe('normalizeBloodGroup', () => {
  it('accepts the symbol spelling', () => {
    expect(normalizeBloodGroup('A+')).toBe('A_POSITIVE');
    expect(normalizeBloodGroup('ab-')).toBe('AB_NEGATIVE');
  });

  it('accepts the canonical enum spelling', () => {
    expect(normalizeBloodGroup('A_POSITIVE')).toBe('A_POSITIVE');
    expect(normalizeBloodGroup('O_NEGATIVE')).toBe('O_NEGATIVE');
  });

  it('accepts UNKNOWN and empty values', () => {
    expect(normalizeBloodGroup('UNKNOWN')).toBe('UNKNOWN');
    expect(normalizeBloodGroup('')).toBeNull();
    expect(normalizeBloodGroup(null)).toBeNull();
    expect(normalizeBloodGroup(undefined)).toBeNull();
  });

  it('rejects unrecognised values', () => {
    expect(normalizeBloodGroup('WEIRD')).toBeNull();
    expect(normalizeBloodGroup('A_POSITIVE-ish')).toBeNull();
  });
});

describe('bloodGroupAliases', () => {
  it('resolves both spellings for filtering', () => {
    expect(bloodGroupAliases('A_POSITIVE')).toEqual(['A_POSITIVE', 'A+']);
    expect(bloodGroupAliases('A+')).toEqual(['A_POSITIVE', 'A+']);
  });
});

describe('bloodGroupToSymbol', () => {
  it('renders the canonical display symbol', () => {
    expect(bloodGroupToSymbol('A_POSITIVE')).toBe('A+');
    expect(bloodGroupToSymbol('O-')).toBe('O-');
    expect(bloodGroupToSymbol(null)).toBeNull();
  });
});
