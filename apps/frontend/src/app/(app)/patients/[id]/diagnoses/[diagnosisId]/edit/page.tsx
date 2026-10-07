'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Stethoscope } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LabeledSelect, SelectItem } from '@/components/ui/select';
import { SkeletonCard } from '@/components/ui/skeleton';
import { PatientAddRecordHeader } from '@/components/patient-add-record-header';
import { queryKeys, useUpdateDiagnosis } from '@/lib/hooks/use-api';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/lib/stores/auth.store';
import { UserRole } from '@medivault/shared';

// ─── Enums ────────────────────────────────────────────────────────────────────
const DIAGNOSIS_TYPES = [
  'PRIMARY',
  'SECONDARY',
  'DIFFERENTIAL',
  'PROVISIONAL',
  'FINAL',
  'COMORBIDITY',
] as const;

const DIAGNOSIS_STATUSES = [
  'ACTIVE',
  'RESOLVED',
  'CHRONIC',
  'INACTIVE',
  'RECURRENCE',
] as const;

const SEVERITIES = ['MILD', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

const CAN_WRITE_ROLES = new Set<string>([
  UserRole.SUPER_ADMIN,
  UserRole.ORG_ADMIN,
  UserRole.FACILITY_ADMIN,
  UserRole.DOCTOR,
]);

// ─── Validation ───────────────────────────────────────────────────────────────
const diagnosisSchema = z.object({
  diagnosisName: z.string().min(2, 'Diagnosis name is required').max(200),
  diagnosisCode: z.string().max(50).optional().or(z.literal('')),
  diagnosisType: z.string().optional().or(z.literal('')),
  severity: z.string().optional().or(z.literal('')),
  status: z.string().optional().or(z.literal('')),
  diagnosedAt: z.string().optional().or(z.literal('')),
  notes: z.string().max(2000).optional().or(z.literal('')),
});

type DiagnosisFormValues = z.infer<typeof diagnosisSchema>;

/**
 * Diagnosis as stored by the API: the shared medical-record envelope with the
 * clinical fields under `data`.
 */
interface DiagnosisDoc {
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

// ─── Diagnosis details form ───────────────────────────────────────────────────
/**
 * Editable diagnosis fields, seeded from the stored record.
 *
 * Mounted only once the diagnosis has loaded, so `defaultValues` is a one-shot
 * seed rather than a value kept in sync on every refetch. Changes are sent as
 * a PATCH — the API applies only the keys present in the body.
 */
function DiagnosisFieldsForm({
  patientId,
  diagnosisId,
  data,
}: {
  patientId: string;
  diagnosisId: string;
  data: Record<string, unknown>;
}) {
  const router = useRouter();
  const updateDiagnosis = useUpdateDiagnosis(patientId);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DiagnosisFormValues>({
    resolver: zodResolver(diagnosisSchema),
    defaultValues: {
      diagnosisName: str(data.diagnosisName),
      diagnosisCode: str(data.diagnosisCode),
      diagnosisType: str(data.diagnosisType),
      severity: str(data.severity),
      status: str(data.status),
      diagnosedAt: toDateInput(data.diagnosedAt),
      notes: str(data.notes),
    },
  });

  const onSubmit = async (values: DiagnosisFormValues) => {
    try {
      await updateDiagnosis.mutateAsync({
        id: diagnosisId,
        data: {
          diagnosisName: values.diagnosisName,
          diagnosisCode: values.diagnosisCode,
          diagnosisType: values.diagnosisType,
          severity: values.severity,
          status: values.status,
          notes: values.notes,
          ...(values.diagnosedAt
            ? {
                diagnosedAt: new Date(
                  `${values.diagnosedAt}T00:00:00`,
                ).toISOString(),
              }
            : {}),
        },
      });
      toast.success('Diagnosis updated.');
      router.push(`/patients/${patientId}`);
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Failed to update the diagnosis.'));
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Stethoscope className="h-4 w-4 text-muted-foreground" />
            Diagnosis Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Input
                label="Diagnosis Name"
                placeholder="e.g. Type 2 diabetes mellitus"
                required
                error={errors.diagnosisName?.message}
                {...register('diagnosisName')}
              />
            </div>
            <Controller
              name="diagnosisType"
              control={control}
              render={({ field }) => (
                <LabeledSelect
                  label="Diagnosis Type"
                  placeholder="Select type"
                  value={field.value ?? ''}
                  onValueChange={field.onChange}
                  error={errors.diagnosisType?.message}
                >
                  {DIAGNOSIS_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </LabeledSelect>
              )}
            />
            <Input
              label="Diagnosis Code (ICD-10 / SNOMED)"
              placeholder="e.g. E11.9"
              hint="Optional"
              error={errors.diagnosisCode?.message}
              {...register('diagnosisCode')}
            />
            <Controller
              name="severity"
              control={control}
              render={({ field }) => (
                <LabeledSelect
                  label="Severity"
                  placeholder="Not specified…"
                  value={field.value ?? ''}
                  onValueChange={field.onChange}
                  error={errors.severity?.message}
                >
                  {SEVERITIES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </LabeledSelect>
              )}
            />
            <Controller
              name="status"
              control={control}
              render={({ field }) => (
                <LabeledSelect
                  label="Status"
                  required
                  placeholder="Active…"
                  value={field.value ?? ''}
                  onValueChange={field.onChange}
                  error={errors.status?.message}
                >
                  {DIAGNOSIS_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </LabeledSelect>
              )}
            />
            <Input
              label="Diagnosed On"
              type="date"
              max={new Date().toISOString().split('T')[0]}
              hint="Optional"
              error={errors.diagnosedAt?.message}
              {...register('diagnosedAt')}
            />
          </div>
          <Textarea
            label="Notes"
            placeholder="Clinical notes, context, etc."
            hint="Optional"
            error={errors.notes?.message}
            {...register('notes')}
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
export default function EditDiagnosisPage() {
  const { id, diagnosisId } = useParams<{ id: string; diagnosisId: string }>();
  const user = useAuthStore((s) => s.user);

  const canWrite = user?.role ? CAN_WRITE_ROLES.has(user.role) : false;

  const { data: diagnosis, isLoading } = useQuery({
    // The key nests the id under the patient's list: React Query caches by key
    // alone, so reusing the bare list key would overwrite the array every other
    // page reads with this single record (and break its `.map()`).
    queryKey: queryKeys.patientDiagnosis(id, diagnosisId),
    queryFn: async () => {
      const res = await apiClient.get<DiagnosisDoc[]>(
        `/patients/${id}/diagnoses`,
      );
      return (res.data ?? []).find((dx) => dx._id === diagnosisId) ?? null;
    },
    enabled: !!diagnosisId,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (!diagnosis) {
    return (
      <div className="space-y-6">
        <PatientAddRecordHeader
          patientId={id}
          title="Edit Diagnosis"
          icon={Stethoscope}
        />
        <p className="text-sm text-muted-foreground">
          This diagnosis no longer exists.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PatientAddRecordHeader
        patientId={id}
        title="Edit Diagnosis"
        icon={Stethoscope}
      />

      {!canWrite ? (
        <p className="text-sm text-muted-foreground">
          You do not have permission to change diagnoses. Contact a doctor or
          an administrator.
        </p>
      ) : (
        <DiagnosisFieldsForm
          patientId={id}
          diagnosisId={diagnosisId}
          data={diagnosis.data ?? {}}
        />
      )}
    </div>
  );
}
