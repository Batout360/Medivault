'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FlaskConical, CalendarClock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LabeledSelect, SelectItem } from '@/components/ui/select';
import { PatientAddRecordHeader } from '@/components/patient-add-record-header';
import {
  useCreateLabReport,
  usePatientEncounters,
  type EncounterRecord,
} from '@/lib/hooks/use-api';
import { formatDate } from '@/lib/utils';
import { useAuthStore } from '@/lib/stores/auth.store';
import { UserRole } from '@medivault/shared';

// ─── Roles ────────────────────────────────────────────────────────────────────
const CAN_WRITE_ROLES = new Set<string>([
  UserRole.SUPER_ADMIN,
  UserRole.ORG_ADMIN,
  UserRole.FACILITY_ADMIN,
  UserRole.DOCTOR,
]);

// ─── Validation ───────────────────────────────────────────────────────────────
const labSchema = z.object({
  testName: z.string().min(2, 'Test name is required').max(200),
  testCode: z.string().max(50).optional().or(z.literal('')),
  normalRange: z.string().max(100).optional().or(z.literal('')),
  unit: z.string().max(50).optional().or(z.literal('')),
  interpretation: z.string().max(500).optional().or(z.literal('')),
  labName: z.string().max(200).optional().or(z.literal('')),
  reportDate: z.string().optional().or(z.literal('')),
  notes: z.string().max(2000).optional().or(z.literal('')),
  medicalRecordId: z.string().optional().or(z.literal('')),
});

type LabFormValues = z.infer<typeof labSchema>;

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
export default function NewLabReportPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const canWrite = user?.role ? CAN_WRITE_ROLES.has(user.role) : false;
  const { data: encountersData } = usePatientEncounters(id);
  const createLabReport = useCreateLabReport(id);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LabFormValues>({
    resolver: zodResolver(labSchema),
    defaultValues: {
      testName: '',
      testCode: '',
      normalRange: '',
      unit: '',
      interpretation: '',
      labName: '',
      reportDate: '',
      notes: '',
      medicalRecordId: '',
    },
  });

  const encounters = encountersData?.data ?? [];

  const onSubmit = async (values: LabFormValues) => {
    try {
      await createLabReport.mutateAsync({
        medicalRecordId: values.medicalRecordId || undefined,
        testName: values.testName,
        testCode: values.testCode || undefined,
        normalRange: values.normalRange || undefined,
        unit: values.unit || undefined,
        interpretation: values.interpretation || undefined,
        labName: values.labName || undefined,
        reportDate: values.reportDate
          ? new Date(`${values.reportDate}T23:59:59`).toISOString()
          : undefined,
        notes: values.notes || undefined,
      });
      toast.success('Lab report added successfully.');
      router.push(`/patients/${id}`);
    } catch (err: unknown) {
      toast.error(
        isErrorLike(err) ? err.message : 'Failed to add the lab report.',
      );
    }
  };

  return (
    <div className="space-y-6">
      <PatientAddRecordHeader
        patientId={id}
        title="Add Lab Report"
        icon={FlaskConical}
      />

      {!canWrite ? (
        <p className="text-sm text-muted-foreground">
          You do not have permission to add lab reports. Contact a doctor or an
          administrator.
        </p>
      ) : (
        <form
          onSubmit={(e) => void handleSubmit(onSubmit)(e)}
          className="space-y-6"
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-muted-foreground" />
                Test Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Test Name"
                  placeholder="e.g. Complete Blood Count (CBC)"
                  required
                  error={errors.testName?.message}
                  {...register('testName')}
                />
                <Input
                  label="Test Code"
                  placeholder="e.g. LOINC 58410-2"
                  hint="Optional"
                  error={errors.testCode?.message}
                  {...register('testCode')}
                />
                <Input
                  label="Normal Range"
                  placeholder="e.g. 4.0–11.0 ×10³/µL"
                  hint="Optional"
                  error={errors.normalRange?.message}
                  {...register('normalRange')}
                />
                <Input
                  label="Unit"
                  placeholder="e.g. g/dL"
                  hint="Optional"
                  error={errors.unit?.message}
                  {...register('unit')}
                />
                <Input
                  label="Lab Name"
                  placeholder="e.g. Central Pathology Lab"
                  hint="Optional"
                  error={errors.labName?.message}
                  {...register('labName')}
                />
                <Input
                  label="Report Date"
                  type="date"
                  max={new Date().toISOString().split('T')[0]}
                  hint="Optional"
                  error={errors.reportDate?.message}
                  {...register('reportDate')}
                />
              </div>
              <Textarea
                label="Interpretation"
                placeholder="Reference text / clinical interpretation…"
                hint="Optional"
                error={errors.interpretation?.message}
                {...register('interpretation')}
              />
              <Textarea
                label="Notes"
                placeholder="Additional remarks…"
                hint="Optional"
                error={errors.notes?.message}
                {...register('notes')}
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
                      hint="Optionally link this report to a visit / encounter."
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
              Save Lab Report
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
