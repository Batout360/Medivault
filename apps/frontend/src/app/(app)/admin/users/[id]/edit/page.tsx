'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  User,
  Mail,
  Phone,
  ChevronLeft,
  ShieldCheck,
  Building2,
  KeyRound,
  Lock,
} from 'lucide-react';
import { toast } from 'sonner';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SkeletonCard } from '@/components/ui/skeleton';
import {
  LabeledSelect,
  SelectItem,
} from '@/components/ui/select';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/lib/stores/auth.store';
import { UserRole, UserRoleLabels } from '@medivault/shared';
import type { ApiError } from '@/lib/api/client';

// ─── Zod validation schema ────────────────────────────────────────────────────
const editUserSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(50),
  lastName: z.string().min(1, 'Last name is required').max(50),
  email: z.string().email('Enter a valid email address'),
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be 30 characters or fewer')
    .regex(/^[a-z0-9._-]+$/i, 'Username may only contain letters, numbers, dots, dashes, and underscores'),
  phone: z
    .string()
    .regex(/^\+?[\d\s\-(). ]{7,20}$/, 'Enter a valid phone number')
    .optional()
    .or(z.literal('')),
  role: z.nativeEnum(UserRole, { required_error: 'Role is required' }),
  facilityId: z
    .string()
    .uuid('Must be a valid UUID')
    .optional()
    .or(z.literal('')),
  hospital: z.string().max(120).optional().or(z.literal('')),
  isActive: z.boolean(),
});

type EditUserFormValues = z.infer<typeof editUserSchema>;

// ─── Roles assignable by an admin, by privilege ───────────────────────────────
const ROLES_FOR_ORG_ADMIN: UserRole[] = [
  UserRole.FACILITY_ADMIN,
  UserRole.DOCTOR,
  UserRole.NURSE,
  UserRole.PHARMACIST,
  UserRole.LAB_TECHNICIAN,
  UserRole.RADIOLOGIST,
  UserRole.RECEPTIONIST,
  UserRole.BILLING_STAFF,
  UserRole.USER,
  UserRole.PATIENT,
  UserRole.AUDITOR,
];

const HOSPITAL_ROLES: UserRole[] = [
  UserRole.DOCTOR,
  UserRole.NURSE,
  UserRole.PHARMACIST,
  UserRole.LAB_TECHNICIAN,
  UserRole.RADIOLOGIST,
  UserRole.RECEPTIONIST,
  UserRole.BILLING_STAFF,
  UserRole.AUDITOR,
];

// ─── Edit User Page ───────────────────────────────────────────────────────────
export default function EditUserPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const userId = params?.id ?? '';
  const currentUser = useAuthStore((s) => s.user);

  const isSuperAdmin = currentUser?.role === UserRole.SUPER_ADMIN;
  const isOrgAdmin = currentUser?.role === UserRole.ORG_ADMIN;
  const isFacilityAdmin = currentUser?.role === UserRole.FACILITY_ADMIN;

  // Fetch the user to edit
  const { data: target, isPending } = useQuery({
    queryKey: ['admin', 'users', userId],
    queryFn: async () => {
      const res = await apiClient.get<EditUserFormValues & {
        email: string;
        username: string;
      }>(`/users/${userId}`);
      return res.data;
    },
    enabled: !!userId,
  });

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<EditUserFormValues>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      username: '',
      phone: '',
      role: undefined,
      facilityId: '',
      hospital: '',
      isActive: true,
    },
  });

  // Populate the form once the user data loads
  React.useEffect(() => {
    if (!target) return;
    setValue('firstName', target.firstName ?? '');
    setValue('lastName', target.lastName ?? '');
    setValue('email', target.email ?? '');
    setValue('username', target.username ?? '');
    setValue('phone', target.phone ?? '');
    setValue('role', target.role ?? (UserRole.USER as UserRole));
    setValue('facilityId', target.facilityId ?? '');
    setValue('hospital', target.hospital ?? '');
    setValue('isActive', Boolean(target.isActive));
  }, [target, setValue]);

  // A FACILITY_ADMIN may never assign/change admin roles
  const targetIsAdmin =
    target?.role === UserRole.SUPER_ADMIN ||
    target?.role === UserRole.ORG_ADMIN ||
    target?.role === UserRole.FACILITY_ADMIN;
  const canEditTarget =
    isSuperAdmin ||
    (currentUser &&
      !targetIsAdmin &&
      !(target?.role === UserRole.SUPER_ADMIN)) ||
    (isOrgAdmin && target?.role !== UserRole.SUPER_ADMIN) ||
    (isFacilityAdmin && !targetIsAdmin);
  const canChangeRole = isSuperAdmin || isOrgAdmin;

  const availableRoles = isSuperAdmin
    ? [UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, ...ROLES_FOR_ORG_ADMIN]
    : isOrgAdmin
      ? target?.role === UserRole.ORG_ADMIN
        ? [UserRole.ORG_ADMIN, ...ROLES_FOR_ORG_ADMIN]
        : ROLES_FOR_ORG_ADMIN
      : [];

  // PATCH /users/:id — edit user details
  const updateUserMutation = useMutation({
    mutationFn: async (data: EditUserFormValues) => {
      const payload: Record<string, string | boolean | undefined> = {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email.trim().toLowerCase(),
        username: data.username.trim().toLowerCase(),
        isActive: data.isActive,
      };
      if (data.phone?.trim()) payload.phone = data.phone.trim();
      if (data.hospital?.trim()) payload.hospital = data.hospital.trim();
      if (canChangeRole) payload.role = data.role;
      if ((isSuperAdmin || isOrgAdmin) && data.facilityId?.trim())
        payload.facilityId = data.facilityId.trim();

      const res = await apiClient.patch<{ firstName: string; lastName: string }>(
        `/users/${userId}`,
        payload,
      );
      return res.data;
    },
    onSuccess: (updated) => {
      toast.success(`User ${updated.firstName} ${updated.lastName} updated successfully`);
      router.push('/admin');
    },
    onError: (err: unknown) => {
      const apiErr = err as ApiError;
      if (apiErr?.statusCode === 409) {
        const msg = apiErr.message ?? '';
        if (msg.toLowerCase().includes('email')) {
          setError('email', { message: 'This email address is already registered' });
        } else if (msg.toLowerCase().includes('username')) {
          setError('username', { message: 'This username is already taken' });
        } else {
          toast.error(msg || 'A user with those details already exists');
        }
      } else {
        toast.error(apiErr?.message ?? 'Failed to update user. Please try again.');
      }
    },
  });

  const onSubmit = (data: EditUserFormValues) => {
    updateUserMutation.mutate(data);
  };

  // POST /users/:id/reset-password — admin sets a new password
  const [newPassword, setNewPassword] = React.useState('');
  const [passwordError, setPasswordError] = React.useState<string | null>(null);

  const resetPasswordMutation = useMutation({
    mutationFn: async (password: string) => {
      const res = await apiClient.post<{ message: string }>(
        `/users/${userId}/reset-password`,
        { newPassword: password },
      );
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data.message ?? 'Password reset successfully.');
      setNewPassword('');
      setPasswordError(null);
    },
    onError: (err: unknown) => {
      const apiErr = err as ApiError;
      toast.error(apiErr?.message ?? 'Failed to reset password.');
    },
  });

  const handleResetPassword = () => {
    const message =
      'Password must be 12–128 characters and include an uppercase letter, ' +
      'a lowercase letter, a digit, and a special character.';
    const valid =
      newPassword.length >= 12 &&
      newPassword.length <= 128 &&
      /[a-z]/.test(newPassword) &&
      /[A-Z]/.test(newPassword) &&
      /\d/.test(newPassword) &&
      /[^A-Za-z\d]/.test(newPassword);
    if (!valid) {
      setPasswordError(message);
      return;
    }
    setPasswordError(null);
    resetPasswordMutation.mutate(newPassword);
  };

  if (isPending) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <SkeletonCard />
      </div>
    );
  }

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
        <h1 className="text-xl font-bold">Edit User</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Update account details for {target?.email ?? 'this user'}.
        </p>
      </div>

      {!canEditTarget ? (
        <Card>
          <CardContent className="p-6 text-sm text-destructive">
            You do not have permission to modify this user. Only a super admin may
            edit other administrator accounts.
          </CardContent>
        </Card>
      ) : (
        <>
          <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate>
            <div className="space-y-4">
            {/* Identity */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Personal Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Email Address"
                  type="email"
                  placeholder="user@example.com"
                  required
                  leftIcon={<Mail className="h-3.5 w-3.5" />}
                  error={errors.email?.message}
                  hint="The address the user signs in with"
                  {...register('email')}
                />
                <Input
                  label="Username"
                  placeholder="drsmith"
                  required
                  leftIcon={<User className="h-3.5 w-3.5" />}
                  hint="Letters, numbers, dots, dashes, underscores"
                  error={errors.username?.message}
                  {...register('username')}
                />
              </div>

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

            {/* Role & Access */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" />
                  Role & Access
                </CardTitle>
                <CardDescription>
                  {canChangeRole
                    ? 'The role determines what this user can see and do.'
                    : 'Role cannot be changed by a facility admin.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Controller
                  name="role"
                  control={control}
                  disabled={!canChangeRole}
                  render={({ field }) => (
                    <LabeledSelect
                      label="Role"
                      required
                      placeholder="Select a role…"
                      value={field.value ?? ''}
                      onValueChange={field.onChange}
                      error={errors.role?.message}
                      disabled={!canChangeRole}
                    >
                      {availableRoles.map((role) => (
                        <SelectItem key={role} value={role}>
                          {UserRoleLabels[role]}
                        </SelectItem>
                      ))}
                    </LabeledSelect>
                  )}
                />

                <div className="flex items-center gap-2 text-sm">
                  <input
                    id="isActive"
                    type="checkbox"
                    className="h-4 w-4 rounded border-border"
                    {...register('isActive')}
                  />
                  <label htmlFor="isActive" className="text-muted-foreground">
                    Account is active
                  </label>
                  <Badge variant={watch('isActive') ? 'success' : 'gray'} dot className="ml-auto">
                    {watch('isActive') ? 'Active' : 'Inactive'}
                  </Badge>
                </div>

                {canChangeRole && (
                  <Input
                    label="Facility ID"
                    placeholder="UUID (optional)"
                    error={errors.facilityId?.message}
                    {...register('facilityId')}
                  />
                )}
              </CardContent>
            </Card>

            {/* Hospital / Clinic */}
            {HOSPITAL_ROLES.includes(watch('role') as UserRole) && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Workplace
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Input
                    label="Hospital / Clinic"
                    placeholder="City General Hospital"
                    leftIcon={<Building2 className="h-3.5 w-3.5" />}
                    hint="Documents this user uploads will be linked to this hospital"
                    error={errors.hospital?.message}
                    {...register('hospital')}
                  />
                </CardContent>
              </Card>
            )}

            {/* Submit */}
            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
                disabled={isSubmitting || updateUserMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || updateUserMutation.isPending}>
                {updateUserMutation.isPending ? 'Saving…' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </form>

          {/* Set a new password */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <KeyRound className="h-4 w-4" />
                Reset Password
              </CardTitle>
              <CardDescription>
                Set a new password for this user. All of their active sessions will
                be signed out.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                label="New Password"
                type="text"
                placeholder="Enter a new password"
                leftIcon={<Lock className="h-3.5 w-3.5" />}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                error={passwordError ?? undefined}
                hint="12–128 characters with upper, lower, digit and special character"
                autoComplete="new-password"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleResetPassword}
                loading={resetPasswordMutation.isPending}
                disabled={resetPasswordMutation.isPending}
              >
                <KeyRound className="h-3.5 w-3.5" />
                Reset Password
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}