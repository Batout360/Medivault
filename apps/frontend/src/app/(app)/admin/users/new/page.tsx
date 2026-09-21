'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  User,
  Mail,
  Lock,
  Phone,
  ChevronLeft,
  ShieldCheck,
  Building2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  LabeledSelect,
  SelectItem,
} from '@/components/ui/select';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/lib/stores/auth.store';
import { UserRole, UserRoleLabels } from '@medivault/shared';
import type { ApiError } from '@/lib/api/client';

// ─── Zod validation schema ────────────────────────────────────────────────────
// Mirrors the backend CreateUserDto constraints exactly, so validation
// feedback is immediate without a round-trip.
const createUserSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(50),
  lastName: z.string().min(1, 'Last name is required').max(50),
  email: z.string().email('Enter a valid email address'),
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be 30 characters or fewer')
    .regex(/^[a-z0-9._-]+$/i, 'Username may only contain letters, numbers, dots, dashes, and underscores'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  role: z.nativeEnum(UserRole, { required_error: 'Role is required' }),
  phone: z
    .string()
    .regex(/^\+?[\d\s\-(). ]{7,20}$/, 'Enter a valid phone number')
    .optional()
    .or(z.literal('')),
  organizationId: z
    .string()
    .uuid('Must be a valid UUID')
    .optional()
    .or(z.literal('')),
  facilityId: z
    .string()
    .uuid('Must be a valid UUID')
    .optional()
    .or(z.literal('')),
  hospital: z.string().max(120).optional().or(z.literal('')),
});

type CreateUserFormValues = z.infer<typeof createUserSchema>;

// ─── Roles available for creation, ordered by privilege ──────────────────────
// SUPER_ADMIN can create any role; ORG_ADMIN cannot escalate to SUPER_ADMIN
// (that restriction is enforced by the backend too).
const STAFF_ROLES: UserRole[] = [
  UserRole.ORG_ADMIN,
  UserRole.FACILITY_ADMIN,
  UserRole.DOCTOR,
  UserRole.NURSE,
  UserRole.PHARMACIST,
  UserRole.LAB_TECHNICIAN,
  UserRole.RADIOLOGIST,
  UserRole.RECEPTIONIST,
  UserRole.BILLING_STAFF,
  UserRole.USER,
  UserRole.AUDITOR,
];

// ─── Create User Page ─────────────────────────────────────────────────────────
export default function CreateUserPage() {
  const router = useRouter();
  const currentUser = useAuthStore((s) => s.user);
  const isSuperAdmin = currentUser?.role === UserRole.SUPER_ADMIN;

  const [showPassword, setShowPassword] = React.useState(false);

  const availableRoles = isSuperAdmin
    ? [UserRole.SUPER_ADMIN, ...STAFF_ROLES]
    : currentUser?.role === UserRole.ORG_ADMIN
      ? STAFF_ROLES.filter((r) => r !== UserRole.ORG_ADMIN)
      : STAFF_ROLES.filter(
          (r) =>
            r !== UserRole.ORG_ADMIN &&
            r !== UserRole.FACILITY_ADMIN &&
            r !== UserRole.SUPER_ADMIN,
        );

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      username: '',
      password: '',
      role: undefined,
      phone: '',
      organizationId: '',
      facilityId: '',
      hospital: '',
    },
  });

  // POST /users — all fields come from the form; nothing is hardcoded
  const createUserMutation = useMutation({
    mutationFn: async (data: CreateUserFormValues) => {
      const payload: Record<string, string | undefined> = {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email.toLowerCase().trim(),
        username: data.username.toLowerCase().trim(),
        password: data.password,
        role: data.role,
      };
      // Only include optional fields when the user actually provided a value
      if (data.phone?.trim()) payload.phone = data.phone.trim();
      if (data.organizationId?.trim()) payload.organizationId = data.organizationId.trim();
      if (data.facilityId?.trim()) payload.facilityId = data.facilityId.trim();
      if (data.hospital?.trim()) payload.hospital = data.hospital.trim();

      const res = await apiClient.post<{ firstName: string; lastName: string }>(
        '/users',
        payload,
      );
      return res.data;
    },
    onSuccess: (created) => {
      toast.success(`User ${created.firstName} ${created.lastName} created successfully`);
      router.push('/admin');
    },
    onError: (err: unknown) => {
      const apiErr = err as ApiError;
      if (apiErr?.statusCode === 409) {
        // Duplicate email / username — surface on the specific field
        const msg = apiErr.message ?? '';
        if (msg.toLowerCase().includes('email')) {
          setError('email', { message: 'This email address is already registered' });
        } else if (msg.toLowerCase().includes('username')) {
          setError('username', { message: 'This username is already taken' });
        } else {
          toast.error(msg || 'A user with those details already exists');
        }
      } else if (apiErr?.statusCode === 403) {
        toast.error('You do not have permission to create users with that role');
      } else {
        toast.error(apiErr?.message ?? 'Failed to create user. Please try again.');
      }
    },
  });

  const onSubmit = (data: CreateUserFormValues) => {
    createUserMutation.mutate(data);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* ─── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
          className="-ml-2"
          aria-label="Go back"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
      </div>

      <div>
        <h1 className="text-xl font-bold">Create New User</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Add a new staff member to the system. They will be able to log in immediately.
        </p>
      </div>

      <form
          onSubmit={(e) => void handleSubmit(onSubmit)(e)}
          noValidate
        >
        <div className="space-y-4">

          {/* ─── Identity ────────────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4" />
                Personal Information
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="First Name"
                placeholder="Sarah"
                required
                leftIcon={<User className="h-3.5 w-3.5" />}
                error={errors.firstName?.message}
                {...register('firstName')}
              />
              <Input
                label="Last Name"
                placeholder="Smith"
                required
                leftIcon={<User className="h-3.5 w-3.5" />}
                error={errors.lastName?.message}
                {...register('lastName')}
              />
            </CardContent>
          </Card>

          {/* ─── Account Credentials ─────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Account Credentials
              </CardTitle>
              <CardDescription>
                The user will log in with their email and password. No default password is set — you
                choose a strong initial password and the user can change it after logging in.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Email Address"
                  type="email"
                  placeholder="dr.smith@hospital.example.com"
                  required
                  autoComplete="off"
                  leftIcon={<Mail className="h-3.5 w-3.5" />}
                  error={errors.email?.message}
                  {...register('email')}
                />
                <Input
                  label="Username"
                  placeholder="drsmith"
                  required
                  autoComplete="off"
                  leftIcon={<User className="h-3.5 w-3.5" />}
                  hint="Letters, numbers, dots, dashes, underscores"
                  error={errors.username?.message}
                  {...register('username')}
                />
              </div>

              <Input
                label="Initial Password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Min. 8 chars — uppercase, lowercase, number"
                required
                autoComplete="new-password"
                leftIcon={<Lock className="h-3.5 w-3.5" />}
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="cursor-pointer"
                  >
                    {showPassword ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </button>
                }
                hint="Must contain uppercase, lowercase, and a number"
                error={errors.password?.message}
                {...register('password')}
              />
            </CardContent>
          </Card>

          {/* ─── Role & Access ────────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" />
                Role & Access
              </CardTitle>
              <CardDescription>
                The role determines what this user can see and do in the system.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Controller
                name="role"
                control={control}
                render={({ field }) => (
                  <LabeledSelect
                    label="Role"
                    required
                    placeholder="Select a role…"
                    value={field.value ?? ''}
                    onValueChange={field.onChange}
                    error={errors.role?.message}
                  >
                    {availableRoles.map((role) => (
                      <SelectItem key={role} value={role}>
                        {UserRoleLabels[role]}
                      </SelectItem>
                    ))}
                  </LabeledSelect>
                )}
              />

              {/* Facility-scoped assignment — visible to SUPER_ADMIN */}
              {isSuperAdmin && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Organization ID"
                    placeholder="UUID (optional)"
                    hint="Leave blank to inherit your organization"
                    error={errors.organizationId?.message}
                    {...register('organizationId')}
                  />
                  <Input
                    label="Facility ID"
                    placeholder="UUID (optional)"
                    hint="Leave blank if not facility-specific"
                    error={errors.facilityId?.message}
                    {...register('facilityId')}
                  />
                </div>
              )}

              {/* Hospital / clinic where the staff member works */}
              {[
                UserRole.DOCTOR,
                UserRole.NURSE,
                UserRole.PHARMACIST,
                UserRole.LAB_TECHNICIAN,
                UserRole.RADIOLOGIST,
                UserRole.RECEPTIONIST,
                UserRole.BILLING_STAFF,
                UserRole.AUDITOR,
              ].includes(watch('role')) && (
                <Input
                  label="Hospital / Clinic"
                  placeholder="City General Hospital"
                  leftIcon={<Building2 className="h-3.5 w-3.5" />}
                  hint="Documents they upload will be linked to this hospital"
                  error={errors.hospital?.message}
                  {...register('hospital')}
                />
              )}
            </CardContent>
          </Card>

          {/* ─── Contact (optional) ──────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Contact <span className="text-xs font-normal text-muted-foreground ml-1">(optional)</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                label="Phone Number"
                type="tel"
                placeholder="+91 98765 43210"
                leftIcon={<Phone className="h-3.5 w-3.5" />}
                error={errors.phone?.message}
                {...register('phone')}
              />
            </CardContent>
          </Card>

          {/* ─── Submit ──────────────────────────────────────────────── */}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={isSubmitting || createUserMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || createUserMutation.isPending}
            >
              {createUserMutation.isPending ? 'Creating…' : 'Create User'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
