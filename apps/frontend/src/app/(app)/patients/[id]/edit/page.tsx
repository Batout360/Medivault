'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronLeft, User, Phone, Mail, MapPin, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/lib/stores/auth.store';
import { UserRole } from '@medivault/shared';

// ─── Roles allowed to edit patient demographics ───────────────────────────────
const CAN_EDIT_ROLES = new Set<string>([
  UserRole.SUPER_ADMIN,
  UserRole.ORG_ADMIN,
  UserRole.FACILITY_ADMIN,
  UserRole.RECEPTIONIST,
]);

// ─── Patient detail shape (subset of GET /patients/:id) ──────────────────────
interface EditPatientRecord {
  _id: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  dateOfBirth: string;
  gender: string;
  bloodGroup?: string | null;
  phoneNumber?: string;
  email?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  address?: Record<string, unknown> | null;
}

// ─── Options ──────────────────────────────────────────────────────────────────
const GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const;

const BLOOD_GROUP_OPTIONS = [
  { symbol: 'A+', value: 'A_POSITIVE' },
  { symbol: 'A-', value: 'A_NEGATIVE' },
  { symbol: 'B+', value: 'B_POSITIVE' },
  { symbol: 'B-', value: 'B_NEGATIVE' },
  { symbol: 'AB+', value: 'AB_POSITIVE' },
  { symbol: 'AB-', value: 'AB_NEGATIVE' },
  { symbol: 'O+', value: 'O_POSITIVE' },
  { symbol: 'O-', value: 'O_NEGATIVE' },
  { symbol: 'Unknown', value: 'UNKNOWN' },
];

/** Reverse map: stored display symbol -> DTO enum value */
const BLOOD_SYMBOL_TO_ENUM: Record<string, string> = Object.fromEntries(
  BLOOD_GROUP_OPTIONS.map(({ symbol, value }) => [symbol.toUpperCase(), value]),
);

// ─── Validation ───────────────────────────────────────────────────────────────
const editSchema = z.object({
  firstName: z
    .string()
    .min(2, 'First name must be at least 2 characters')
    .max(100),
  lastName: z
    .string()
    .min(2, 'Last name must be at least 2 characters')
    .max(100),
  middleName: z.string().max(100).optional().or(z.literal('')),
  dateOfBirth: z.string().min(1, 'Date of birth is required'),
  gender: z.enum(GENDERS, { required_error: 'Gender is required' }),
  bloodGroup: z.string().optional().or(z.literal('')),
  phoneNumber: z
    .string()
    .min(10, 'Enter a valid phone number')
    .regex(/^\+?[\d\s\-()]{10,15}$/, 'Enter a valid phone number'),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  addressLine1: z.string().max(250).optional().or(z.literal('')),
  city: z.string().max(100).optional().or(z.literal('')),
  state: z.string().max(100).optional().or(z.literal('')),
  pincode: z.string().max(10).optional().or(z.literal('')),
});

type EditFormValues = z.infer<typeof editSchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isErrorLike(err: unknown): err is { message: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as { message?: unknown }).message === 'string'
  );
}

function toE164(raw: string): string {
  const digits = raw.replace(/[\s\-()]/g, '');
  return digits.startsWith('+') ? digits : `+${digits}`;
}

/** Stored enum or symbol -> display symbol used in the select */
function bloodGroupToSymbol(value: string | null | undefined): string {
  if (!value) return '';
  const upper = value.toUpperCase();
  if (upper === 'UNKNOWN') return 'Unknown';
  const match = BLOOD_GROUP_OPTIONS.find(
    (o) => o.value.toUpperCase() === upper,
  );
  return match?.symbol ?? value;
}

// ─── Not authorized state ─────────────────────────────────────────────────────
function NotAuthorized() {
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <User className="h-12 w-12 text-muted-foreground/30" />
      <p className="text-base font-medium">
        You do not have permission to edit patients.
      </p>
      <p className="text-sm text-muted-foreground">
        Only administrators and reception staff can update patient demographics.
      </p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function EditPatientPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const canEdit = user?.role ? CAN_EDIT_ROLES.has(user.role) : false;

  const { data: patient, isLoading: patientLoading } = useQuery({
    queryKey: ['patient', id],
    queryFn: async () => {
      const res = await apiClient.get<EditPatientRecord>(`/patients/${id}`);
      return res.data;
    },
    enabled: !!id && canEdit,
  });

  const {
    register,
    control,
    reset,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    mode: 'onBlur',
  });

  React.useEffect(() => {
    if (!patient) return;
    const address = patient.address ?? {};
    reset({
      firstName: patient.firstName ?? '',
      lastName: patient.lastName ?? '',
      middleName: patient.middleName ?? '',
      dateOfBirth: patient.dateOfBirth
        ? String(patient.dateOfBirth).slice(0, 10)
        : '',
      gender:
        (patient.gender ?? '').toUpperCase() === 'MALE'
          ? 'MALE'
          : (patient.gender ?? '').toUpperCase() === 'FEMALE'
            ? 'FEMALE'
            : 'OTHER',
      bloodGroup: bloodGroupToSymbol(patient.bloodGroup),
      phoneNumber: patient.phoneNumber ?? '',
      email: patient.email ?? '',
      addressLine1: (address.line1 as string) ?? '',
      city: (address.city as string) ?? patient.city ?? '',
      state: (address.state as string) ?? patient.state ?? '',
      pincode: (address.postalCode as string) ?? patient.pincode ?? '',
    });
  }, [patient, reset]);

  const save = async (values: EditFormValues) => {
    const addressLine1 = values.addressLine1 ?? '';
    const city = values.city ?? '';
    const state = values.state ?? '';
    const pincode = values.pincode ?? '';
    const address = {
      line1: addressLine1.trim() || 'N/A',
      city: city.trim() || 'N/A',
      state: state.trim() || 'N/A',
      country: (patient?.address?.country as string) ?? 'India',
      ...(pincode.trim() ? { postalCode: pincode.trim() } : {}),
    };
    await apiClient.patch(`/patients/${id}`, {
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      ...(values.middleName?.trim()
        ? { middleName: values.middleName.trim() }
        : {}),
      dateOfBirth: values.dateOfBirth,
      gender: values.gender,
      ...(values.bloodGroup
        ? { bloodGroup: BLOOD_SYMBOL_TO_ENUM[values.bloodGroup] ?? 'UNKNOWN' }
        : {}),
      phone: toE164(values.phoneNumber),
      ...(values.email?.trim() ? { email: values.email.trim() } : {}),
      address,
    });
  };

  const onSubmit = async (values: EditFormValues) => {
    try {
      await save(values);
      toast.success('Patient details updated.');
      void queryClient.invalidateQueries({ queryKey: ['patient', id] });
      void queryClient.invalidateQueries({ queryKey: ['patients'] });
      router.push(`/patients/${id}`);
    } catch (err: unknown) {
      toast.error(isErrorLike(err) ? err.message : 'Failed to update patient.');
    }
  };

  if (!canEdit) return <NotAuthorized />;

  const fullName = patient
    ? `${patient.firstName} ${patient.lastName}`
    : 'Patient';

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push(`/patients/${id}`)}
          aria-label="Back to patient"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Edit Patient</h1>
          <p className="text-sm text-muted-foreground">
            {patientLoading
              ? 'Loading patient…'
              : `Updating demographics for ${fullName}`}
          </p>
        </div>
      </div>

      {patientLoading && !patient ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Loading patient…
          </CardContent>
        </Card>
      ) : !patient ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Patient record not found.
          </CardContent>
        </Card>
      ) : (
        <form
          onSubmit={(e) => void handleSubmit(onSubmit)(e)}
          className="space-y-6"
        >
          {/* Personal Information */}
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-start gap-3 mb-2">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h2 className="text-base font-semibold">
                    Personal Information
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Basic identifying information for this patient.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="First Name"
                  placeholder="Meera"
                  required
                  error={errors.firstName?.message}
                  {...register('firstName')}
                />
                <Input
                  label="Last Name"
                  placeholder="Iyer"
                  required
                  error={errors.lastName?.message}
                  {...register('lastName')}
                />
                <Input
                  label="Middle Name"
                  placeholder="Optional"
                  error={errors.middleName?.message}
                  {...register('middleName')}
                />
                <Input
                  label="Date of Birth"
                  type="date"
                  required
                  max={new Date().toISOString().split('T')[0]}
                  error={errors.dateOfBirth?.message}
                  {...register('dateOfBirth')}
                />
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">
                    Gender <span className="text-destructive">*</span>
                  </label>
                  <Controller
                    name="gender"
                    control={control}
                    render={({ field }) => (
                      <Select
                        value={field.value ?? ''}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger error={!!errors.gender}>
                          <SelectValue placeholder="Select gender…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MALE">Male</SelectItem>
                          <SelectItem value="FEMALE">Female</SelectItem>
                          <SelectItem value="OTHER">
                            Other / Prefer not to say
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {errors.gender && (
                    <p role="alert" className="text-xs text-destructive">
                      {errors.gender.message}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Blood Group</label>
                  <Controller
                    name="bloodGroup"
                    control={control}
                    render={({ field }) => (
                      <Select
                        value={field.value ?? ''}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select blood group…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Unknown">Unknown</SelectItem>
                          {BLOOD_GROUP_OPTIONS.filter(
                            (o) => o.symbol !== 'Unknown',
                          ).map((o) => (
                            <SelectItem key={o.symbol} value={o.symbol}>
                              {o.symbol}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Contact Information */}
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-start gap-3 mb-2">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Phone className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h2 className="text-base font-semibold">
                    Contact Information
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    How can this patient be reached?
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Phone Number"
                  type="tel"
                  placeholder="+91 98765 43210"
                  required
                  leftIcon={<Phone className="h-3.5 w-3.5" />}
                  error={errors.phoneNumber?.message}
                  {...register('phoneNumber')}
                />
                <Input
                  label="Email Address"
                  type="email"
                  placeholder="user@example.com"
                  leftIcon={<Mail className="h-3.5 w-3.5" />}
                  error={errors.email?.message}
                  {...register('email')}
                />
                <div className="sm:col-span-2">
                  <Input
                    label="Address"
                    placeholder="Street address, apartment, suite, etc."
                    leftIcon={<MapPin className="h-3.5 w-3.5" />}
                    error={errors.addressLine1?.message}
                    {...register('addressLine1')}
                  />
                </div>
                <Input
                  label="City"
                  placeholder="Bengaluru"
                  error={errors.city?.message}
                  {...register('city')}
                />
                <Input
                  label="State"
                  placeholder="Karnataka"
                  error={errors.state?.message}
                  {...register('state')}
                />
                <Input
                  label="Pincode"
                  placeholder="560001"
                  error={errors.pincode?.message}
                  {...register('pincode')}
                />
              </div>
            </CardContent>
          </Card>

          {/* Footer */}
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push(`/patients/${id}`)}
            >
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting}>
              <Save className="h-4 w-4" />
              Save Changes
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
