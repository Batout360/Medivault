import { Reflector } from '@nestjs/core';
import { UserRole } from '@medivault/shared';
import { BiometricController } from './biometric.controller';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator';

const ALLOWED_ENROLL_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ORG_ADMIN,
  UserRole.FACILITY_ADMIN,
  UserRole.DOCTOR,
  UserRole.NURSE,
  UserRole.RECEPTIONIST,
];

const reflector = new Reflector();

describe('BiometricController routes & permissions', () => {
  let controller: BiometricController;

  beforeEach(() => {
    controller = new BiometricController({} as never);
  });

  it('is mounted at BOTH /biometrics and /biometric (alias)', () => {
    const path = Reflect.getMetadata('path', BiometricController);
    expect(path).toEqual(['biometrics', 'biometric']);
  });

  it('triggers on identified /biometric/identify endpoint', () => {
    expect(Reflect.getMetadata('path', BiometricController.prototype.identify)).toBe('identify');
    expect(Reflect.getMetadata('path', BiometricController.prototype.enroll)).toBe('enroll');
  });

  it('permits clinical roles to enroll fingerprints', () => {
    for (const route of ['enroll', 'identify', 'verify']) {
      const roles = reflector.getAllAndOverride(ROLES_KEY, [
        (controller as unknown as Record<string, () => void>)[route as string],
        BiometricController,
      ]) as UserRole[];
      expect(roles).toEqual(expect.arrayContaining(ALLOWED_ENROLL_ROLES));
    }
  });

  it('restricts template revocation to administrators', () => {
    const roles = reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      (controller as unknown as Record<string, () => void>).revokeTemplate,
      BiometricController,
    ]);
    expect(roles).toEqual(
      expect.arrayContaining([UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.FACILITY_ADMIN]),
    );
    expect(roles).not.toContain(UserRole.DOCTOR);
  });

  it('restricts template listing to administrators', () => {
    const roles = reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      (controller as unknown as Record<string, () => void>).listTemplates,
      BiometricController,
    ]);
    expect(roles).not.toContain(UserRole.NURSE);
  });

  it('exposes a public health check', () => {
    const isPublic = Reflect.getMetadata('isPublic', BiometricController.prototype.health);
    expect(isPublic).toBe(true);
  });
});
