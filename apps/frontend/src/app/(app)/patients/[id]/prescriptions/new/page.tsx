'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Pill, CalendarClock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LabeledSelect, SelectItem } from '@/components/ui/select';
import { PatientAddRecordHeader } from '@/components/patient-add-record-header';
import {
  useCreatePrescription,
  usePatientEncounters,
  type EncounterRecord,
} from '@/lib/hooks/use-api';
import { formatDate } from '@/lib/utils';
import { useAuthStore } from '@/lib/stores/auth.store';
import { UserRole } from '@medivault/shared';

// ─── Enums ────────────────────────────────────────────────────────────────────
const PRESCRIPTION_ROUTES = [
  'ORAL',
  'INTRAVENOUS',
  'INTRAMUSCULAR',
  'SUBCUTANEOUS',
  'TOPICAL',
  'INHALATION',
  'SUBLINGUAL',
  'RECTAL',
  'OPHTHALMIC',
  'OTIC',
  'NASAL',
  'TRANSDERMAL',
  'OTHER',
] as const;

const CAN_WRITE_ROLES = new Set<string>([
  UserRole.SUPER_ADMIN,
  UserRole.ORG_ADMIN,
  UserRole.FACILITY_ADMIN,
  UserRole.DOCTOR,
]);

// ─── Validation ───────────────────────────────────────────────────────────────
const prescriptionSchema = z.object({
  medicationName: z.string().min(2, 'Medication name is required').max(200),
  genericName: z.string().max(200).optional().or(z.literal('')),
  dosage: z.string().min(1, 'Dosage is required').max(50),
  frequency: z.string().min(1, 'Frequency is required').max(100),
  route: z.enum(PRESCRIPTION_ROUTES, { required_error: 'Route is required' }),
  duration: z.string().max(100).optional().or(z.literal('')),
  quantity: z.string().max(50).optional().or(z.literal('')),
  refills: z.union([z.literal(''), z.coerce.number().int().min(0)]).optional(),
  instructions: z.string().max(1000).optional().or(z.literal('')),
  expiresAt: z.string().optional().or(z.literal('')),
  medicalRecordId: z.string().optional().or(z.literal('')),
});

type PrescriptionFormValues = z.infer<typeof prescriptionSchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isErrorLike(err: unknown): err is { message: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as { message?: unknown }).message === 'string'
  );
}

function encounterLabel(enc: EncounterRecord): string {
  const type = (enc.data?.encounterType ?? 'Encounter').toLowerCase();
  const date = formatDate(enc.data?.encounterDate, 'short');
  const complaint = enc.data?.chiefComplaint;
  return [date, type, complaint].filter(Boolean).join(' · ');
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function NewPrescriptionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const canWrite = user?.role ? CAN_WRITE_ROLES.has(user.role) : false;
  const { data: encountersData } = usePatientEncounters(id);
  const createPrescription = useCreatePrescription(id);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PrescriptionFormValues>({
    resolver: zodResolver(prescriptionSchema),
    defaultValues: {
      medicationName: '',
      genericName: '',
      dosage: '',
      frequency: '',
      duration: '',
      quantity: '',
      instructions: '',
      expiresAt: '',
      medicalRecordId: '',
    },
  });

  const encounters = encountersData?.data ?? [];

  const onSubmit = async (values: PrescriptionFormValues) => {
    const refills =
      typeof values.refills === 'number' ? values.refills : undefined;
    try {
      await createPrescription.mutateAsync({
        medicalRecordId: values.medicalRecordId || undefined,
        medicationName: values.medicationName,
        genericName: values.genericName || undefined,
        dosage: values.dosage,
        frequency: values.frequency,
        route: values.route,
        duration: values.duration || undefined,
        quantity: values.quantity || undefined,
        refills,
        instructions: values.instructions || undefined,
        expiresAt: values.expiresAt
          ? new Date(`${values.expiresAt}T23:59:59`).toISOString()
          : undefined,
      });
      toast.success('Prescription added successfully.');
      router.push(`/patients/${id}`);
    } catch (err: unknown) {
      toast.error(
        isErrorLike(err) ? err.message : 'Failed to add the prescription.',
      );
    }
  };

  return (
    <div className="space-y-6">
      <PatientAddRecordHeader
        patientId={id}
        title="Add Prescription"
        icon={Pill}
      />

      {!canWrite ? (
        <p className="text-sm text-muted-foreground">
          You do not have permission to add prescriptions. Contact a doctor or
          an administrator.
        </p>
      ) : (
        <form
          onSubmit={(e) => void handleSubmit(onSubmit)(e)}
          className="space-y-6"
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Pill className="h-4 w-4 text-muted-foreground" />
                Medication
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Medication Name"
                  placeholder="e.g. Amoxicillin"
                  required
                  error={errors.medicationName?.message}
                  {...register('medicationName')}
                />
                <Input
                  label="Generic Name"
                  placeholder="Optional drug name"
                  hint="Optional"
                  error={errors.genericName?.message}
                  {...register('genericName')}
                />
                <Input
                  label="Dosage"
                  placeholder="e.g. 500 mg"
                  required
                  error={errors.dosage?.message}
                  {...register('dosage')}
                />
                <Input
                  label="Frequency"
                  placeholder="e.g. twice daily"
                  required
                  error={errors.frequency?.message}
                  {...register('frequency')}
                />
                <Controller
                  name="route"
                  control={control}
                  render={({ field }) => (
                    <LabeledSelect
                      label="Route"
                      required
                      placeholder="Select route…"
                      value={field.value ?? ''}
                      onValueChange={field.onChange}
                      error={errors.route?.message}
                    >
                      {PRESCRIPTION_ROUTES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r === 'OTHER'
                            ? 'Other'
                            : r.charAt(0) + r.slice(1).toLowerCase()}
                        </SelectItem>
                      ))}
                    </LabeledSelect>
                  )}
                />
                <Input
                  label="Duration"
                  placeholder="e.g. 7 days"
                  hint="Optional"
                  error={errors.duration?.message}
                  {...register('duration')}
                />
                <Input
                  label="Quantity"
                  placeholder="e.g. 14 tablets"
                  hint="Optional"
                  error={errors.quantity?.message}
                  {...register('quantity')}
                />
                <Input
                  label="Refills"
                  type="number"
                  min={0}
                  step={1}
                  placeholder="0"
                  hint="Optional"
                  error={errors.refills?.message}
                  {...register('refills')}
                />
                <Input
                  label="Expires"
                  type="date"
                  hint="Optional"
                  error={errors.expiresAt?.message}
                  {...register('expiresAt')}
                />
              </div>
              <Textarea
                label="Instructions"
                placeholder="How the patient should take this medication…"
                hint="Optional"
                error={errors.instructions?.message}
                {...register('instructions')}
              />
            </CardContent>
          </Card>

          {encounters.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-muted-foreground" />
                  Link to Encounter
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Controller
                  name="medicalRecordId"
                  control={control}
                  render={({ field }) => (
                    <LabeledSelect
                      label="Encounter"
                      placeholder="Not linked…"
                      value={field.value ?? ''}
                      onValueChange={field.onChange}
                      hint="Optionally link this prescription to a visit / encounter."
                    >
                      {encounters.map((enc) => (
                        <SelectItem key={enc._id} value={enc._id}>
                          {encounterLabel(enc)}
                        </SelectItem>
                      ))}
                    </LabeledSelect>
                  )}
                />
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push(`/patients/${id}`)}
            >
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting}>
              Save Prescription
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
