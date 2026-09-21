'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ClipboardList,
  Stethoscope,
  Pill,
  FlaskConical,
  Activity,
  Syringe,
  FileText,
  ShieldAlert,
  User,
  AlertCircle,
  Scissors,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SkeletonCard } from '@/components/ui/skeleton';
import { apiClient } from '@/lib/api/client';
import { formatDate, calculateAge } from '@/lib/utils';
import { useAuthStore } from '@/lib/stores/auth.store';
import { PATIENT_ROLES } from '@medivault/shared';
import { RecordAccessHistory } from '@/components/record-access-history';
import { FullMedicalRecords } from '@/components/full-medical-records';

// ─── Types (mirrors GET /patients/:id/medical-summary) ─────────────────────────
interface MyPatient {
  _id: string;
  profileId: string | null;
  mrn: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  bloodGroup: string | null;
  phoneNumber: string;
  email: string | null;
}

interface RecordSummary {
  patientId: string;
  isClinicalRole: boolean;
  patient: {
    profileId: string | null;
    mrn: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    gender: string;
    bloodGroup: string | null;
  };
  totals: {
    encounters: number;
    diagnoses: number;
    vitals: number;
    notes: number;
    prescriptions: number;
    labReports: number;
    imaging: number;
    vaccinations: number;
    procedures: number;
    documents: number;
  };
  activeDiagnoses: Array<{
    _id: string;
    diagnosisName: string;
    diagnosisCode: string | null;
    severity: string | null;
    status: string;
    diagnosedAt: string;
  }>;
  latestVital: {
    recordedAt: string;
    bloodPressureSystolic: number | null;
    bloodPressureDiastolic: number | null;
    heartRate: number | null;
    oxygenSaturation: number | null;
    temperature: number | null;
    respiratoryRate: number | null;
    weight: number | null;
    height: number | null;
    bmi: number | null;
  } | null;
  activePrescriptions: Array<{
    _id: string;
    medicationName: string;
    dosage: string;
    frequency: string;
    route: string | null;
    prescribedAt: string;
    expiresAt: string | null;
  }>;
  recentLabReports: Array<{
    _id: string;
    testName: string;
    status: string;
    reportDate: string | null;
    interpretation: string | null;
  }>;
  recentVaccinations: Array<{
    _id: string;
    vaccineName: string;
    dose: string | null;
    administeredAt: string;
  }>;
  recentProcedures: Array<{
    _id: string;
    procedureName: string;
    performedAt: string;
    outcome: string | null;
  }>;
  recentImagingReports: Array<{
    _id: string;
    imagingType: string;
    bodyPart: string | null;
    reportDate: string | null;
    impression: string | null;
  }>;
  allergies: {
    activeAllergiesCount: number;
    criticalAllergies: Array<{ allergen: string; severity: string }>;
  };
  recentDocuments: Array<{
    _id: string;
    originalName: string;
    category: string | null;
    sourceHospital: string | null;
    uploadedAt: string;
  }>;
  note?: string;
}

function StatTile({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border p-3">
      <div className="rounded-md bg-muted p-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div>
        <p className="text-lg font-bold tabular-nums leading-none">{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{label}</p>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  icon: Icon,
  children,
  empty,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  empty?: string;
}) {
  const hasContent = React.Children.count(children) > 0;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {hasContent ? children : (
          <p className="text-sm text-muted-foreground italic">{empty ?? 'None recorded'}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function MyRecordsPage() {
  const user = useAuthStore((s) => s.user);

  // Only patients should land here; guard in the UI as well as the API.
  if (!user?.role || !PATIENT_ROLES.includes(user.role)) {
    return (
      <EmptyWrapper
        icon={ShieldAlert}
        title="Not available"
        message="This page is for patient accounts."
        cta="/dashboard"
        ctaLabel="Go to Dashboard"
      />
    );
  }

  return <MyRecordsInner />;
}

function MyRecordsInner() {
  // Resolve the patient's own record from the linked account email.
  const { data: myPatient, isError: meError } = useMyPatientQuery();
  const patientId = myPatient?._id;

  const { data: summary, isError: summaryError } = usePatientSummaryQuery(patientId);

  if (meError || myPatient === null) {
    return (
      <EmptyWrapper
        icon={ClipboardList}
        title="No profile linked"
        message="No patient profile is linked to this account yet. Contact your provider."
        cta="/dashboard"
        ctaLabel="Back to Dashboard"
      />
    );
  }

  if (!myPatient || !summary) {
    return (
      <div className="space-y-6">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (summaryError) {
    return (
      <EmptyWrapper
        icon={ShieldAlert}
        title="Summary unavailable"
        message="We could not load your record summary. Please try again later."
        cta="/dashboard"
        ctaLabel="Back to Dashboard"
      />
    );
  }

  const p = summary.patient;
  const fullName = `${p.firstName} ${p.lastName}`;
  const totals = summary.totals;

  return (
    <div className="space-y-6">
      {/* ─── Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">My Medical Records</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            A summary of your records at Medivault.
          </p>
        </div>
        <div className="flex items-center gap-2 justify-self-start sm:justify-self-end">
          <Button asChild variant="outline" size="sm">
            <Link href={`/patients/${patientId}`}>Full record</Link>
          </Button>
          <Badge variant="info" dot>
            Summary view
          </Badge>
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <User className="h-6 w-6" />
              </div>
              <div>
                <p className="text-lg font-bold">{fullName}</p>
                <p className="text-sm font-mono text-primary">ID: {p.profileId ?? '—'}</p>
                <p className="text-xs text-muted-foreground font-mono">{p.mrn}</p>
              </div>
            </div>
            <div className="text-sm text-muted-foreground space-y-0.5 sm:text-right">
              <p>Age {calculateAge(p.dateOfBirth)} · {formatDate(p.dateOfBirth, 'short')}</p>
              <p className="capitalize">{p.gender.toLowerCase()}</p>
              <p className="font-semibold text-red-600 dark:text-red-400">
                Blood group: {p.bloodGroup ?? '—'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {summary.note && (
        <div className="flex items-start gap-2 rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 px-3 py-2">
          <AlertCircle className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-blue-800 dark:text-blue-300">{summary.note}</p>
        </div>
      )}

      {/* ─── Allergies alert ─────────────────────────────────────────── */}
      {summary.allergies.criticalAllergies.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 px-3 py-2">
          <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase tracking-wide">
              Critical Allergies
            </p>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {summary.allergies.criticalAllergies.map((a) => (
                <Badge key={a.allergen} variant="destructive">
                  {a.allergen} · {a.severity}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── Totals ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile icon={ClipboardList} label="Encounters" value={totals.encounters} />
        <StatTile icon={Stethoscope} label="Diagnoses" value={totals.diagnoses} />
        <StatTile icon={Pill} label="Prescriptions" value={totals.prescriptions} />
        <StatTile icon={FlaskConical} label="Lab Reports" value={totals.labReports} />
        <StatTile icon={Activity} label="Vitals" value={totals.vitals} />
        <StatTile icon={Syringe} label="Vaccinations" value={totals.vaccinations} />
        <StatTile icon={Scissors} label="Procedures" value={totals.procedures} />
        <StatTile icon={FileText} label="Documents" value={totals.documents} />
      </div>

      {/* ─── Latest vitals ───────────────────────────────────────────── */}
      {summary.latestVital && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                Latest Vitals
              </span>
              <span className="text-xs font-normal text-muted-foreground">
                {formatDate(summary.latestVital.recordedAt, 'short')}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {summary.latestVital.bloodPressureSystolic && (
                <VitalStat
                  label="BP"
                  value={`${summary.latestVital.bloodPressureSystolic}/${summary.latestVital.bloodPressureDiastolic}`}
                  unit="mmHg"
                />
              )}
              <VitalStat label="Heart Rate" value={summary.latestVital.heartRate} unit="bpm" />
              <VitalStat label="SpO₂" value={summary.latestVital.oxygenSaturation} unit="%" />
              <VitalStat label="Temperature" value={summary.latestVital.temperature} unit="°C" />
              <VitalStat label="Resp. Rate" value={summary.latestVital.respiratoryRate} unit="/min" />
              <VitalStat label="Weight" value={summary.latestVital.weight} unit="kg" />
              <VitalStat label="Height" value={summary.latestVital.height} unit="cm" />
              <VitalStat label="BMI" value={summary.latestVital.bmi} unit="" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Active diagnoses & prescriptions ────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SectionCard title="Active Diagnoses" icon={Stethoscope}>
          {summary.activeDiagnoses.map((dx) => (
            <div key={dx._id} className="flex items-start justify-between gap-3 py-2 border-b border-border last:border-b-0">
              <div>
                <p className="text-sm font-medium">{dx.diagnosisName}</p>
                {dx.diagnosisCode && (
                  <p className="text-xs text-muted-foreground font-mono">{dx.diagnosisCode}</p>
                )}
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatDate(dx.diagnosedAt, 'short')}
                </p>
              </div>
              {dx.severity && (
                <Badge variant={dx.severity === 'SEVERE' || dx.severity === 'LIFE_THREATENING' ? 'destructive' : 'warning'}>
                  {dx.severity}
                </Badge>
              )}
            </div>
          ))}
        </SectionCard>

        <SectionCard title="Active Prescriptions" icon={Pill}>
          {summary.activePrescriptions.map((rx) => (
            <div key={rx._id} className="py-2 border-b border-border last:border-b-0">
              <p className="text-sm font-medium">{rx.medicationName}</p>
              <p className="text-sm text-muted-foreground">
                {rx.dosage} — {rx.frequency}{rx.route ? ` — ${rx.route}` : ''}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Prescribed {formatDate(rx.prescribedAt, 'short')}
                {rx.expiresAt ? ` · Expires ${formatDate(rx.expiresAt, 'short')}` : ''}
              </p>
            </div>
          ))}
        </SectionCard>
      </div>

      {/* ─── Recent labs / vaccinations / imaging / procedures ────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SectionCard title="Recent Lab Reports" icon={FlaskConical}>
          {summary.recentLabReports.map((lab) => (
            <div key={lab._id} className="py-2 border-b border-border last:border-b-0">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{lab.testName}</p>
                <Badge variant={lab.status === 'completed' ? 'success' : 'warning'} dot>
                  {lab.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatDate(lab.reportDate ?? summary.recentLabReports[0]?.reportDate ?? new Date().toISOString(), 'short')}
                {lab.interpretation ? ` · ${lab.interpretation}` : ''}
              </p>
            </div>
          ))}
        </SectionCard>

        <SectionCard title="Recent Vaccinations" icon={Syringe}>
          {summary.recentVaccinations.map((v) => (
            <div key={v._id} className="py-2 border-b border-border last:border-b-0">
              <p className="text-sm font-medium">{v.vaccineName}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {v.dose ? `Dose ${v.dose} · ` : ''}Administered {formatDate(v.administeredAt, 'short')}
              </p>
            </div>
          ))}
        </SectionCard>
      </div>

      {/* ─── Recent documents ────────────────────────────────────────── */}
      <SectionCard title="Recent Documents" icon={FileText}>
        {summary.recentDocuments.map((d) => (
          <div key={d._id} className="py-2 border-b border-border last:border-b-0">
            <p className="text-sm font-medium">{d.originalName}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {d.category ?? 'OTHER'}
              {d.sourceHospital ? ` · from ${d.sourceHospital}` : ''}
              {' · '}{formatDate(d.uploadedAt, 'short')}
            </p>
          </div>
        ))}
      </SectionCard>

      {/* ─── Full medical records ────────────────────────────────────── */}
      <FullMedicalRecords patientId={patientId} />

      {/* ─── Record access history ───────────────────────────────────── */}
      <RecordAccessHistory patientId={patientId} />

      <div className="flex justify-end">
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard">Back to Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}

function VitalStat({ label, value, unit }: { label: string; value: number | string | null; unit: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-base font-semibold tabular-nums mt-0.5">
        {value ?? '—'}
        {value !== null && value !== undefined && unit && (
          <span className="text-xs font-normal text-muted-foreground ml-1">{unit}</span>
        )}
      </p>
    </div>
  );
}

function EmptyWrapper({
  icon: Icon,
  title,
  message,
  cta,
  ctaLabel,
}: {
  icon: React.ElementType;
  title: string;
  message: string;
  cta: string;
  ctaLabel: string;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <div className="rounded-full bg-muted p-4">
        <Icon className="h-8 w-8 text-muted-foreground/30" />
      </div>
      <p className="text-base font-medium">{title}</p>
      <p className="text-sm text-muted-foreground max-w-sm">{message}</p>
      <Button variant="outline" size="sm" asChild>
        <Link href={cta}>{ctaLabel}</Link>
      </Button>
    </div>
  );
}

function useMyPatientQuery() {
  return useQuery({
    queryKey: ['patients', 'me'],
    queryFn: async () => {
      const res = await apiClient.get<MyPatient | null>('/patients/me');
      return res.data;
    },
    staleTime: 60_000,
  });
}

function usePatientSummaryQuery(patientId?: string) {
  return useQuery({
    queryKey: ['patient', patientId, 'medical-summary'],
    queryFn: async () => {
      const res = await apiClient.get<RecordSummary>(`/patients/${patientId}/medical-summary`);
      return res.data;
    },
    enabled: !!patientId,
    staleTime: 60_000,
  });
}