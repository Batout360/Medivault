'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Stethoscope, Plus, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LabeledSelect, SelectItem } from '@/components/ui/select';
import { PatientAddRecordHeader } from '@/components/patient-add-record-header';
import {
  useCreateDiagnosis,
  usePatientEncounters,
  queryKeys,
  type EncounterRecord,
} from '@/lib/hooks/use-api';
import { apiClient } from '@/lib/api/client';
import { formatDate } from '@/lib/utils';
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

const ENCOUNTER_TYPES = [
  'OUTPATIENT',
  'INPATIENT',
  'EMERGENCY',
  'TELEHEALTH',
  'HOME_VISIT',
  'DAY_SURGERY',
  'ICU',
  'OTHER',
] as const;

const CAN_WRITE_ROLES = new Set<string>([
  UserRole.SUPER_ADMIN,
  UserRole.ORG_ADMIN,
  UserRole.FACILITY_ADMIN,
  UserRole.DOCTOR,
]);

// ─── Validation ───────────────────────────────────────────────────────────────
const diagnosisSchema = z.object({
  medicalRecordId: z
    .string()
    .min(1, 'Select the encounter this diagnosis belongs to'),
  diagnosisCode: z.string().max(50).optional().or(z.literal('')),
  diagnosisName: z.string().min(2, 'Diagnosis name is required').max(200),
  diagnosisType: z.enum(DIAGNOSIS_TYPES, {
    required_error: 'Diagnosis type is required',
  }),
  severity: z.string().optional(),
  status: z.string().optional(),
  notes: z.string().max(2000).optional().or(z.literal('')),
});

type DiagnosisFormValues = z.infer<typeof diagnosisSchema>;

const encounterSchema = z.object({
  encounterType: z.enum(ENCOUNTER_TYPES, {
    required_error: 'Encounter type is required',
  }),
  encounterDate: z.string().min(1, 'Encounter date is required'),
  chiefComplaint: z.string().max(300).optional().or(z.literal('')),
});

type EncounterFormValues = z.infer<typeof encounterSchema>;

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

// ─── Not authorized state ─────────────────────────────────────────────────────
function NotAuthorized() {
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <Stethoscope className="h-12 w-12 text-muted-foreground/30" />
      <p className="text-base font-medium">
        You do not have permission to add diagnoses.
      </p>
      <p className="text-sm text-muted-foreground">
        Only doctors and administrators with clinical write access can record
        diagnoses.
      </p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function NewDiagnosisPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const canWrite = user?.role ? CAN_WRITE_ROLES.has(user.role) : false;

  const {
    data: encountersData,
    refetch: refetchEncounters,
    isLoading: encountersLoading,
  } = usePatientEncounters(id);
  const createDiagnosis = useCreateDiagnosis(id);

  const [showEncounterForm, setShowEncounterForm] = React.useState(false);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DiagnosisFormValues>({
    resolver: zodResolver(diagnosisSchema),
    defaultValues: {
      diagnosisCode: '',
      diagnosisName: '',
      notes: '',
    },
  });

  const encounterForm = useForm<EncounterFormValues>({
    resolver: zodResolver(encounterSchema),
    defaultValues: { chiefComplaint: '' },
  });

  if (!canWrite) {
    return (
      <div className="space-y-6">
        <PatientAddRecordHeader
          patientId={id}
          title="Add Diagnosis"
          icon={Stethoscope}
        />
        <Card>
          <CardContent className="p-6">
            <NotAuthorized />
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleCreateEncounter = async (values: EncounterFormValues) => {
    try {
      const payload = {
        encounterType: values.encounterType,
        encounterDate: new Date(
          `${values.encounterDate}T09:00:00`,
        ).toISOString(),
        chiefComplaint: values.chiefComplaint || undefined,
      };
      await apiClient.post<EncounterRecord>(
        `/patients/${id}/encounters`,
        payload,
      );
      await refetchEncounters();
      void queryClient.invalidateQueries({
        queryKey: queryKeys.patientEncounters(id),
      });
      setShowEncounterForm(false);
      encounterForm.reset();
      toast.success(
        'Encounter recorded. Select it above and finish the diagnosis.',
      );
    } catch (err: unknown) {
      toast.error(
        isErrorLike(err) ? err.message : 'Failed to record the encounter.',
      );
    }
  };

  const onSubmit = async (values: DiagnosisFormValues) => {
    try {
      await createDiagnosis.mutateAsync({
        medicalRecordId: values.medicalRecordId,
        diagnosisCode: values.diagnosisCode || undefined,
        diagnosisName: values.diagnosisName,
        diagnosisType: values.diagnosisType,
        severity: values.severity || undefined,
        status: values.status || undefined,
        notes: values.notes || undefined,
      });
      toast.success('Diagnosis added successfully.');
      router.push(`/patients/${id}`);
    } catch (err: unknown) {
      toast.error(
        isErrorLike(err) ? err.message : 'Failed to add the diagnosis.',
      );
    }
  };

  const encounters = encountersData?.data ?? [];

  return (
    <div className="space-y-6">
      <PatientAddRecordHeader
        patientId={id}
        title="Add Diagnosis"
        icon={Stethoscope}
      />

      <form
        onSubmit={(e) => void handleSubmit(onSubmit)(e)}
        className="space-y-6"
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
              Encounter
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {encountersLoading ? (
              <p className="text-sm text-muted-foreground">
                Loading encounters…
              </p>
            ) : encounters.length === 0 ? (
              <div className="flex flex-col items-start gap-3 rounded-lg border border-border bg-muted/30 p-4">
                <p className="text-sm text-muted-foreground">
                  A diagnosis must be attached to an encounter. No encounters
                  exist yet for this patient.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setShowEncounterForm((v) => !v)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {showEncounterForm
                    ? 'Hide Encounter Form'
                    : 'Record an Encounter'}
                </Button>
              </div>
            ) : (
              <Controller
                name="medicalRecordId"
                control={control}
                render={({ field }) => (
                  <LabeledSelect
                    label="Encounter"
                    required
                    placeholder="Select encounter…"
                    value={field.value ?? ''}
                    onValueChange={field.onChange}
                    error={errors.medicalRecordId?.message}
                    hint="The diagnosis is attached to this visit / encounter."
                  >
                    {encounters.map((enc) => (
                      <SelectItem key={enc._id} value={enc._id}>
                        {encounterLabel(enc)}
                      </SelectItem>
                    ))}
                  </LabeledSelect>
                )}
              />
            )}

            {encounters.length > 0 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setShowEncounterForm((v) => !v)}
              >
                <Plus className="h-3.5 w-3.5" />
                {showEncounterForm
                  ? 'Hide Encounter Form'
                  : 'Record a New Encounter'}
              </Button>
            )}

            {showEncounterForm && (
              <div className="rounded-lg border border-border p-4 space-y-4">
                <p className="text-sm font-medium">New Encounter</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Controller
                    name="encounterType"
                    control={encounterForm.control}
                    render={({ field }) => (
                      <LabeledSelect
                        label="Encounter Type"
                        required
                        placeholder="Select type…"
                        value={field.value ?? ''}
                        onValueChange={field.onChange}
                        error={
                          encounterForm.formState.errors.encounterType?.message
                        }
                      >
                        {ENCOUNTER_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type.replace(/_/g, ' ')}
                          </SelectItem>
                        ))}
                      </LabeledSelect>
                    )}
                  />
                  <Input
                    label="Encounter Date"
                    type="date"
                    required
                    max={new Date().toISOString().split('T')[0]}
                    error={
                      encounterForm.formState.errors.encounterDate?.message
                    }
                    {...encounterForm.register('encounterDate')}
                  />
                </div>
                <Textarea
                  label="Chief Complaint"
                  placeholder="Reason for the visit…"
                  hint="Optional"
                  {...encounterForm.register('chiefComplaint')}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setShowEncounterForm(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    loading={
                      encounterForm.formState.isSubmitting ||
                      encounterForm.formState.isValidating
                    }
                    onClick={() =>
                      void encounterForm.handleSubmit(handleCreateEncounter)()
                    }
                  >
                    Save Encounter
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

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
                    required
                    placeholder="Select type…"
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
            onClick={() => router.push(`/patients/${id}`)}
          >
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting}>
            Save Diagnosis
          </Button>
        </div>
      </form>
    </div>
  );
}
