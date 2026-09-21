'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Activity } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PatientAddRecordHeader } from '@/components/patient-add-record-header';
import { useCreateVitals } from '@/lib/hooks/use-api';
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
const optionalNumber = z.string().optional().or(z.literal(''));

const vitalSchema = z.object({
  recordedAt: z.string().min(1, 'Recorded date/time is required'),
  bloodPressureSystolic: optionalNumber,
  bloodPressureDiastolic: optionalNumber,
  heartRate: optionalNumber,
  temperature: optionalNumber,
  respiratoryRate: optionalNumber,
  oxygenSaturation: optionalNumber,
  weight: optionalNumber,
  height: optionalNumber,
  glucose: optionalNumber,
  notes: z.string().max(2000).optional().or(z.literal('')),
});

type VitalFormValues = z.infer<typeof vitalSchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isErrorLike(err: unknown): err is { message: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as { message?: unknown }).message === 'string'
  );
}

function toNum(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function NewVitalsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const canWrite = user?.role ? CAN_WRITE_ROLES.has(user.role) : false;
  const createVitals = useCreateVitals(id);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<VitalFormValues>({
    resolver: zodResolver(vitalSchema),
    defaultValues: {
      recordedAt: '',
      bloodPressureSystolic: '',
      bloodPressureDiastolic: '',
      heartRate: '',
      temperature: '',
      respiratoryRate: '',
      oxygenSaturation: '',
      weight: '',
      height: '',
      glucose: '',
      notes: '',
    },
  });

  const nowLocal = new Date();
  const defaultRecordedAt = new Date(
    nowLocal.getTime() - nowLocal.getTimezoneOffset() * 60000,
  )
    .toISOString()
    .slice(0, 16);
  const [recordedAt, setRecordedAt] = React.useState(defaultRecordedAt);

  const onSubmit = async (values: VitalFormValues) => {
    try {
      await createVitals.mutateAsync({
        recordedAt: new Date(`${recordedAt}`).toISOString(),
        bloodPressureSystolic: toNum(values.bloodPressureSystolic),
        bloodPressureDiastolic: toNum(values.bloodPressureDiastolic),
        heartRate: toNum(values.heartRate),
        temperature: toNum(values.temperature),
        respiratoryRate: toNum(values.respiratoryRate),
        oxygenSaturation: toNum(values.oxygenSaturation),
        weight: toNum(values.weight),
        height: toNum(values.height),
        glucose: toNum(values.glucose),
        notes: values.notes || undefined,
      });
      toast.success('Vitals recorded successfully.');
      router.push(`/patients/${id}`);
    } catch (err: unknown) {
      toast.error(isErrorLike(err) ? err.message : 'Failed to record vitals.');
    }
  };

  return (
    <div className="space-y-6">
      <PatientAddRecordHeader
        patientId={id}
        title="Record Vitals"
        icon={Activity}
      />

      {!canWrite ? (
        <p className="text-sm text-muted-foreground">
          You do not have permission to record vitals. Contact a doctor or an
          administrator.
        </p>
      ) : (
        <form
          onSubmit={(e) => void handleSubmit(onSubmit)(e)}
          className="space-y-6"
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Observations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                label="Recorded Date & Time"
                type="datetime-local"
                required
                value={recordedAt}
                onChange={(e) => setRecordedAt(e.target.value)}
                hint="Leave as is to use the current time."
              />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Input
                  label="Blood Pressure — Systolic"
                  type="number"
                  min={0}
                  placeholder="e.g. 120"
                  hint="mmHg"
                  error={errors.bloodPressureSystolic?.message}
                  {...register('bloodPressureSystolic')}
                />
                <Input
                  label="Blood Pressure — Diastolic"
                  type="number"
                  min={0}
                  placeholder="e.g. 80"
                  hint="mmHg"
                  error={errors.bloodPressureDiastolic?.message}
                  {...register('bloodPressureDiastolic')}
                />
                <div className="hidden sm:block" />
                <Input
                  label="Heart Rate"
                  type="number"
                  min={0}
                  placeholder="e.g. 72"
                  hint="bpm"
                  error={errors.heartRate?.message}
                  {...register('heartRate')}
                />
                <Input
                  label="Temperature"
                  type="number"
                  min={0}
                  step="0.1"
                  placeholder="e.g. 37.0"
                  hint="°C"
                  error={errors.temperature?.message}
                  {...register('temperature')}
                />
                <Input
                  label="Respiratory Rate"
                  type="number"
                  min={0}
                  placeholder="e.g. 16"
                  hint="breaths/min"
                  error={errors.respiratoryRate?.message}
                  {...register('respiratoryRate')}
                />
                <Input
                  label="Oxygen Saturation"
                  type="number"
                  min={0}
                  max={100}
                  placeholder="e.g. 98"
                  hint="SpO₂ %"
                  error={errors.oxygenSaturation?.message}
                  {...register('oxygenSaturation')}
                />
                <Input
                  label="Weight"
                  type="number"
                  min={0}
                  step="0.1"
                  placeholder="e.g. 70"
                  hint="kg"
                  error={errors.weight?.message}
                  {...register('weight')}
                />
                <Input
                  label="Height"
                  type="number"
                  min={0}
                  step="0.1"
                  placeholder="e.g. 170"
                  hint="cm"
                  error={errors.height?.message}
                  {...register('height')}
                />
                <Input
                  label="Blood Glucose"
                  type="number"
                  min={0}
                  step="0.1"
                  placeholder="e.g. 95"
                  hint="mg/dL"
                  error={errors.glucose?.message}
                  {...register('glucose')}
                />
              </div>
              <Textarea
                label="Notes"
                placeholder="Additional observations…"
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
              Save Vitals
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
