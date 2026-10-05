'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Pill, Ban, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LabeledSelect, SelectItem } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/modal';
import { SkeletonCard } from '@/components/ui/skeleton';
import { PatientAddRecordHeader } from '@/components/patient-add-record-header';
import {
  useEndPrescription,
  useReactivatePrescription,
  useUpdatePrescription,
} from '@/lib/hooks/use-api';
import { apiClient } from '@/lib/api/client';
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
});

type PrescriptionFormValues = z.output<typeof prescriptionSchema>;
type PrescriptionFormFields = z.input<typeof prescriptionSchema>;

/**
 * Prescription as stored by the API: the shared medical-record envelope with
 * the drug details under `data`.
 */
interface PrescriptionDoc {
  _id: string;
  createdAt?: string;
  data?: Record<string, unknown> | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
/** `YYYY-MM-DD` for a date input, empty when unset or unparseable. */
function toDateInput(value: unknown): string {
  if (typeof value !== 'string' || !value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

// ─── Drug details form ────────────────────────────────────────────────────────
/**
 * Editable prescription fields, seeded from the stored record.
 *
 * Mounted only once the prescription has loaded, so `defaultValues` is a
 * one-shot seed rather than a value that has to be kept in sync on every
 * refetch. Changes are sent as a PATCH — the API applies only the keys present
 * in the body.
 */
function PrescriptionFieldsForm({
  patientId,
  prescriptionId,
  data,
}: {
  patientId: string;
  prescriptionId: string;
  data: Record<string, unknown>;
}) {
  const router = useRouter();
  const updatePrescription = useUpdatePrescription(patientId);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PrescriptionFormFields, unknown, PrescriptionFormValues>({
    resolver: zodResolver(prescriptionSchema),
    defaultValues: {
      medicationName: str(data.medicationName),
      genericName: str(data.genericName),
      dosage: str(data.dosage),
      frequency: str(data.frequency),
      route: (str(data.route) || 'ORAL') as (typeof PRESCRIPTION_ROUTES)[number],
      duration: str(data.duration),
      quantity: str(data.quantity),
      refills: typeof data.refills === 'number' ? data.refills : undefined,
      instructions: str(data.instructions),
      expiresAt: toDateInput(data.expiresAt),
    },
  });

  const onSubmit = async (values: PrescriptionFormValues) => {
    const refills =
      typeof values.refills === 'number' ? values.refills : undefined;
    try {
      await updatePrescription.mutateAsync({
        id: prescriptionId,
        data: {
          medicationName: values.medicationName,
          genericName: values.genericName,
          dosage: values.dosage,
          frequency: values.frequency,
          route: values.route,
          duration: values.duration,
          quantity: values.quantity,
          refills,
          instructions: values.instructions,
          expiresAt: values.expiresAt
            ? new Date(`${values.expiresAt}T23:59:59`).toISOString()
            : null,
        },
      });
      toast.success('Prescription updated.');
      router.push(`/patients/${patientId}`);
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Failed to update the prescription.'));
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-6">
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

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(`/patients/${patientId}`)}
        >
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Save Changes
        </Button>
      </div>
    </form>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function EditPrescriptionPage() {
  const { id, prescriptionId } = useParams<{
    id: string;
    prescriptionId: string;
  }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const canWrite = user?.role ? CAN_WRITE_ROLES.has(user.role) : false;
  const endPrescription = useEndPrescription(id);
  const reactivatePrescription = useReactivatePrescription(id);

  const [confirmEnd, setConfirmEnd] = React.useState(false);
  const [endReason, setEndReason] = React.useState('');

  const { data: prescription, isLoading } = useQuery({
    queryKey: ['patient', id, 'prescriptions'],
    queryFn: async () => {
      const res = await apiClient.get<PrescriptionDoc[]>(
        `/patients/${id}/prescriptions`,
      );
      return (res.data ?? []).find((rx) => rx._id === prescriptionId) ?? null;
    },
    enabled: !!prescriptionId,
  });

  const data = prescription?.data ?? {};
  const isActive = data.isActive !== false;

  const onEnd = async () => {
    try {
      await endPrescription.mutateAsync({
        id: prescriptionId,
        reason: endReason.trim() || undefined,
      });
      toast.success('Prescription ended.');
      setConfirmEnd(false);
      setEndReason('');
      router.push(`/patients/${id}`);
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Failed to end the prescription.'));
    }
  };

  const onReactivate = async () => {
    try {
      await reactivatePrescription.mutateAsync(prescriptionId);
      toast.success('Prescription is active again.');
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Failed to reactivate the prescription.'));
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (!prescription) {
    return (
      <div className="space-y-6">
        <PatientAddRecordHeader
          patientId={id}
          title="Edit Prescription"
          icon={Pill}
        />
        <p className="text-sm text-muted-foreground">
          This prescription no longer exists.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PatientAddRecordHeader
        patientId={id}
        title="Edit Prescription"
        icon={Pill}
      />

      {!canWrite ? (
        <p className="text-sm text-muted-foreground">
          You do not have permission to change prescriptions. Contact a doctor
          or an administrator.
        </p>
      ) : (
        <>
          {/* Status banner — the two things a clinician can do beyond editing
              the drug details: end the course, or put it back on the list. */}
          <Card>
            <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {isActive ? 'Currently active' : 'Ended'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isActive
                    ? `Prescribed ${formatDate(
                        str(data.prescribedAt) || prescription.createdAt,
                        'short',
                      )}`
                    : `Ended ${formatDate(str(data.endedAt), 'short')}${
                        str(data.endReason) ? ` · ${str(data.endReason)}` : ''
                      }`}
                </p>
              </div>
              {isActive ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmEnd(true)}
                >
                  <Ban className="h-3.5 w-3.5" />
                  End Prescription
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  loading={reactivatePrescription.isPending}
                  onClick={() => void onReactivate()}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Make Active Again
                </Button>
              )}
            </CardContent>
          </Card>

          <PrescriptionFieldsForm
            patientId={id}
            prescriptionId={prescriptionId}
            data={data}
          />

          <Dialog open={confirmEnd} onOpenChange={setConfirmEnd}>
            <DialogContent size="sm">
              <DialogHeader>
                <DialogTitle>End this prescription?</DialogTitle>
                <DialogDescription>
                  {str(data.medicationName) || 'This prescription'} will be
                  removed from the patient&apos;s current medications but stay in
                  the record. You can make it active again at any time.
                </DialogDescription>
              </DialogHeader>
              <div className="px-6 pb-4">
                <Textarea
                  label="Reason"
                  placeholder="e.g. Course completed, patient improved"
                  hint="Optional"
                  value={endReason}
                  onChange={(e) => setEndReason(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={endPrescription.isPending}
                  onClick={() => setConfirmEnd(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  loading={endPrescription.isPending}
                  onClick={() => void onEnd()}
                >
                  End Prescription
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}