'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ClipboardList,
  FileText,
  FlaskConical,
  Pill,
  Scissors,
  ShieldAlert,
  Stethoscope,
  Syringe,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SkeletonCard } from '@/components/ui/skeleton';
import { apiClient } from '@/lib/api/client';
import { formatDate } from '@/lib/utils';

// ─── Types (mirror GET /patients/:id/history) ──────────────────────────────────
interface BaseHistoryRecord {
  _id: string;
  type: string;
  encounterId: string | null;
  authorId: string;
  facilityId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface EncounterData {
  doctorId?: string | null;
  facilityId?: string | null;
  encounterType?: string | null;
  encounterDate?: string | null;
  chiefComplaint?: string | null;
  historyOfPresentIllness?: string | null;
  physicalExam?: string | null;
  assessment?: string | null;
  plan?: string | null;
  notes?: string | null;
  followUpDate?: string | null;
  isConfidential?: boolean;
}

interface DiagnosisData {
  diagnosisCode?: string | null;
  diagnosisName: string;
  diagnosisType?: string | null;
  severity?: string | null;
  status?: string | null;
  notes?: string | null;
  diagnosedAt?: string | null;
}

interface VitalData {
  bloodPressureSystolic?: number | null;
  bloodPressureDiastolic?: number | null;
  heartRate?: number | null;
  temperature?: number | null;
  respiratoryRate?: number | null;
  oxygenSaturation?: number | null;
  weight?: number | null;
  height?: number | null;
  bmi?: number | null;
  glucose?: number | null;
  recordedAt?: string | null;
}

interface NoteData {
  noteType?: string | null;
  content?: string | null;
  isConfidential?: boolean;
}

interface PrescriptionData {
  medicationName: string;
  genericName?: string | null;
  dosage?: string | null;
  frequency?: string | null;
  route?: string | null;
  duration?: string | null;
  quantity?: string | null;
  refills?: number | null;
  instructions?: string | null;
  isActive?: boolean;
  prescribedAt?: string | null;
  expiresAt?: string | null;
}

interface LabReportData {
  testName: string;
  testCode?: string | null;
  status?: string | null;
  results?: string | null;
  normalRange?: string | null;
  unit?: string | null;
  interpretation?: string | null;
  labName?: string | null;
  reportDate?: string | null;
  notes?: string | null;
}

interface ImagingData {
  imagingType: string;
  bodyPart?: string | null;
  indication?: string | null;
  findings?: string | null;
  impression?: string | null;
  reportDate?: string | null;
}

interface VaccinationData {
  vaccineName: string;
  vaccineCode?: string | null;
  dose?: string | null;
  lotNumber?: string | null;
  manufacturer?: string | null;
  administeredAt?: string | null;
  nextDueDate?: string | null;
  site?: string | null;
  route?: string | null;
  notes?: string | null;
}

interface ProcedureData {
  procedureCode?: string | null;
  procedureName: string;
  performedAt?: string | null;
  duration?: string | null;
  notes?: string | null;
  outcome?: string | null;
}

interface HistoryRecord<D> extends BaseHistoryRecord {
  data: D;
}

interface FullHistory {
  encounters: HistoryRecord<EncounterData>[];
  diagnoses: HistoryRecord<DiagnosisData>[];
  vitals: HistoryRecord<VitalData>[];
  clinicalNotes: HistoryRecord<NoteData>[];
  prescriptions: HistoryRecord<PrescriptionData>[];
  labReports: HistoryRecord<LabReportData>[];
  imagingReports: HistoryRecord<ImagingData>[];
  vaccinations: HistoryRecord<VaccinationData>[];
  procedures: HistoryRecord<ProcedureData>[];
}

// ─── Query ─────────────────────────────────────────────────────────────────────
function useFullHistoryQuery(patientId?: string) {
  return useQuery({
    queryKey: ['patient', patientId, 'history'],
    queryFn: async () => {
      const res = await apiClient.get<FullHistory>(
        `/patients/${patientId}/history`,
      );
      return res.data;
    },
    enabled: !!patientId,
    staleTime: 60_000,
  });
}

// ─── Sub-components ────────────────────────────────────────────────────────────
function SeverityBadge({ severity }: { severity: string | null }) {
  if (!severity) return null;
  const variants: Record<string, 'destructive' | 'warning' | 'info' | 'gray'> =
    {
      CRITICAL: 'destructive',
      HIGH: 'destructive',
      MEDIUM: 'warning',
      LOW: 'info',
      MILD: 'info',
    };
  return (
    <Badge variant={variants[severity.toUpperCase()] ?? 'gray'}>
      {severity}
    </Badge>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const variants: Record<'success' | 'warning' | 'gray' | 'info', string[]> = {
    success: ['ACTIVE', 'VERIFIED', 'COMPLETED'],
    warning: ['PENDING'],
    info: ['ONGOING'],
    gray: ['RESOLVED'],
  };
  const key = (Object.keys(variants) as Array<'success' | 'warning' | 'gray' | 'info'>).find(
    (k) => variants[k].includes((status ?? '').toUpperCase()),
  );
  return (
    <Badge variant={key ?? 'gray'} dot>
      {status ?? '—'}
    </Badge>
  );
}

function EmptyState({
  icon: Icon,
  message,
}: {
  icon: React.ElementType;
  message: string;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center">
      <div className="rounded-full bg-muted p-4">
        <Icon className="h-6 w-6 text-muted-foreground/30" />
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function TabCount({ count, label }: { count: number; label: string }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <p className="text-sm font-medium text-muted-foreground">
        {count} {label}
        {count !== 1 ? 's' : ''} recorded
      </p>
    </div>
  );
}

function VitalGrid({ vital }: { vital: HistoryRecord<VitalData> }) {
  const d = vital.data;
  const items = [
    {
      label: 'Blood Pressure',
      value:
        d.bloodPressureSystolic && d.bloodPressureDiastolic
          ? `${d.bloodPressureSystolic}/${d.bloodPressureDiastolic}`
          : null,
      unit: 'mmHg',
    },
    { label: 'Heart Rate', value: d.heartRate ?? null, unit: 'bpm' },
    { label: 'Temperature', value: d.temperature ?? null, unit: '°C' },
    { label: 'SpO₂', value: d.oxygenSaturation ?? null, unit: '%' },
    { label: 'Resp. Rate', value: d.respiratoryRate ?? null, unit: '/min' },
    { label: 'Weight', value: d.weight ?? null, unit: 'kg' },
    { label: 'Height', value: d.height ?? null, unit: 'cm' },
    { label: 'BMI', value: d.bmi ?? null, unit: '' },
    { label: 'Glucose', value: d.glucose ?? null, unit: 'mg/dL' },
  ];
  return (
    <Card>
      <CardHeader className="py-3 px-4 bg-muted/30 border-b border-border">
        <p className="text-sm font-medium">
          {formatDate(d.recordedAt, 'long')}
        </p>
      </CardHeader>
      <CardContent className="p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {items.map((item) => (
            <div key={item.label}>
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="text-base font-semibold tabular-nums mt-0.5">
                {item.value ?? '—'}
                {item.value !== null && item.value !== undefined && item.unit && (
                  <span className="text-xs font-normal text-muted-foreground ml-1">
                    {item.unit}
                  </span>
                )}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Component ─────────────────────────────────────────────────────────────────
export function FullMedicalRecords({ patientId }: { patientId?: string }) {
  const { data, isLoading, isError } = useFullHistoryQuery(patientId);

  if (!patientId) {
    return (
      <div className="space-y-4">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-2">
            <ShieldAlert className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">
              Full medical records could not be loaded right now. Please try
              again later.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Confidential encounters/notes are never surfaced on patient-facing views.
  const encounters = data.encounters.filter(
    (e) => e.data.isConfidential !== true,
  );
  const notes = data.clinicalNotes.filter(
    (n) => n.data.isConfidential !== true,
  );

  const hasAny =
    encounters.length > 0 ||
    data.diagnoses.length > 0 ||
    data.vitals.length > 0 ||
    notes.length > 0 ||
    data.prescriptions.length > 0 ||
    data.labReports.length > 0 ||
    data.imagingReports.length > 0 ||
    data.vaccinations.length > 0 ||
    data.procedures.length > 0;

  if (!hasAny) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            Full Medical Records
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={ClipboardList}
            message="No full medical records have been linked yet."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            Full Medical Records
          </span>
          <Badge variant="info">Full record</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={encounters.length > 0 ? 'encounters' : 'diagnoses'}>
          <TabsList className="flex w-full justify-start overflow-x-auto">
            <TabsTrigger value="encounters">Encounters ({encounters.length})</TabsTrigger>
            <TabsTrigger value="diagnoses">Diagnoses ({data.diagnoses.length})</TabsTrigger>
            <TabsTrigger value="prescriptions">Prescriptions ({data.prescriptions.length})</TabsTrigger>
            <TabsTrigger value="vitals">Vitals ({data.vitals.length})</TabsTrigger>
            <TabsTrigger value="labs">Lab Reports ({data.labReports.length})</TabsTrigger>
            <TabsTrigger value="imaging">Imaging ({data.imagingReports.length})</TabsTrigger>
            <TabsTrigger value="vaccinations">Vaccinations ({data.vaccinations.length})</TabsTrigger>
            <TabsTrigger value="procedures">Procedures ({data.procedures.length})</TabsTrigger>
            <TabsTrigger value="notes">Notes ({notes.length})</TabsTrigger>
          </TabsList>

          {/* Encounters */}
          <TabsContent value="encounters" className="mt-4">
            {!encounters.length ? (
              <EmptyState
                icon={ClipboardList}
                message="No encounters recorded yet."
              />
            ) : (
              <>
                <TabCount count={encounters.length} label="encounter" />
                <div className="space-y-3">
                  {encounters.map((enc) => (
                    <Card key={enc._id}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between gap-4 mb-2">
                          <div className="flex items-center gap-2">
                            {enc.data.encounterType && (
                              <Badge variant="purple">
                                {enc.data.encounterType}
                              </Badge>
                            )}
                            <p className="text-sm font-semibold">
                              {formatDate(enc.data.encounterDate, 'long')}
                            </p>
                          </div>
                        </div>
                        {enc.data.chiefComplaint && (
                          <p className="text-sm text-muted-foreground">
                            <span className="font-medium text-foreground">
                              Chief complaint:
                            </span>{' '}
                            {enc.data.chiefComplaint}
                          </p>
                        )}
                        {enc.data.assessment && (
                          <p className="text-sm mt-2">
                            <span className="font-medium">Assessment:</span>{' '}
                            {enc.data.assessment}
                          </p>
                        )}
                        {enc.data.plan && (
                          <p className="text-sm mt-2">
                            <span className="font-medium">Plan:</span>{' '}
                            {enc.data.plan}
                          </p>
                        )}
                        {enc.data.notes && (
                          <p className="text-sm text-muted-foreground mt-2">
                            {enc.data.notes}
                          </p>
                        )}
                        {enc.data.followUpDate && (
                          <p className="text-xs text-muted-foreground mt-2">
                            Follow-up{' '}
                            {formatDate(enc.data.followUpDate, 'short')}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </TabsContent>

          {/* Diagnoses */}
          <TabsContent value="diagnoses" className="mt-4">
            {!data.diagnoses.length ? (
              <EmptyState icon={Stethoscope} message="No diagnoses recorded yet." />
            ) : (
              <>
                <TabCount count={data.diagnoses.length} label="diagnosis" />
                <div className="space-y-3">
                  {data.diagnoses.map((dx) => (
                    <Card key={dx._id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold">
                                {dx.data.diagnosisName}
                              </p>
                              {dx.data.diagnosisCode && (
                                <Badge variant="gray" className="font-mono text-xs">
                                  {dx.data.diagnosisCode}
                                </Badge>
                              )}
                            </div>
                            {dx.data.diagnosisType && (
                              <p className="text-xs text-muted-foreground uppercase tracking-wide mt-1">
                                {dx.data.diagnosisType}
                              </p>
                            )}
                            {dx.data.notes && (
                              <p className="text-sm text-muted-foreground mt-1">
                                {dx.data.notes}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground mt-2">
                              Diagnosed {formatDate(dx.data.diagnosedAt, 'short')}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <SeverityBadge severity={dx.data.severity ?? null} />
                            <StatusBadge status={dx.data.status ?? null} />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </TabsContent>

          {/* Prescriptions */}
          <TabsContent value="prescriptions" className="mt-4">
            {!data.prescriptions.length ? (
              <EmptyState icon={Pill} message="No prescriptions recorded yet." />
            ) : (
              <>
                <TabCount count={data.prescriptions.length} label="prescription" />
                <div className="space-y-3">
                  {data.prescriptions.map((rx) => (
                    <Card key={rx._id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold">
                              {rx.data.medicationName}
                              {rx.data.genericName && (
                                <span className="text-xs text-muted-foreground font-normal ml-2">
                                  ({rx.data.genericName})
                                </span>
                              )}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {rx.data.dosage}
                              {rx.data.frequency ? ` — ${rx.data.frequency}` : ''}
                              {rx.data.route ? ` — ${rx.data.route}` : ''}
                              {rx.data.duration ? ` — ${rx.data.duration}` : ''}
                            </p>
                            {rx.data.instructions && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {rx.data.instructions}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground mt-2">
                              From {formatDate(rx.data.prescribedAt, 'short')}
                              {rx.data.expiresAt
                                ? ` to ${formatDate(rx.data.expiresAt, 'short')}`
                                : ''}
                            </p>
                          </div>
                          <StatusBadge
                            status={rx.data.isActive ? 'ACTIVE' : 'INACTIVE'}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </TabsContent>

          {/* Vitals */}
          <TabsContent value="vitals" className="mt-4">
            {!data.vitals.length ? (
              <EmptyState icon={Activity} message="No vitals recorded yet." />
            ) : (
              <>
                <TabCount count={data.vitals.length} label="vital record" />
                <div className="space-y-3">
                  {data.vitals.map((v) => (
                    <VitalGrid key={v._id} vital={v} />
                  ))}
                </div>
              </>
            )}
          </TabsContent>

          {/* Lab Reports */}
          <TabsContent value="labs" className="mt-4">
            {!data.labReports.length ? (
              <EmptyState icon={FlaskConical} message="No lab reports recorded yet." />
            ) : (
              <>
                <TabCount count={data.labReports.length} label="lab report" />
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left">
                        {['Test', 'Result', 'Reference', 'Status', 'Date'].map((h) => (
                          <th
                            key={h}
                            className="py-2 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.labReports.map((lab) => (
                        <tr
                          key={lab._id}
                          className="hover:bg-accent/30 transition-colors"
                        >
                          <td className="py-3 px-3">
                            <p className="font-medium">{lab.data.testName}</p>
                            {lab.data.testCode && (
                              <p className="text-xs text-muted-foreground font-mono">
                                {lab.data.testCode}
                              </p>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            {lab.data.results ? (
                              <span className="font-semibold">
                                {lab.data.results}
                                {lab.data.unit ? ` ${lab.data.unit}` : ''}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-3 px-3 text-muted-foreground text-xs">
                            {lab.data.normalRange ?? '—'}
                          </td>
                          <td className="py-3 px-3">
                            <StatusBadge status={lab.data.status ?? null} />
                          </td>
                          <td className="py-3 px-3 text-muted-foreground">
                            {formatDate(
                              lab.data.reportDate ?? lab.createdAt,
                              'short',
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </TabsContent>

          {/* Imaging */}
          <TabsContent value="imaging" className="mt-4">
            {!data.imagingReports.length ? (
              <EmptyState icon={Activity} message="No imaging reports recorded yet." />
            ) : (
              <>
                <TabCount count={data.imagingReports.length} label="imaging report" />
                <div className="space-y-3">
                  {data.imagingReports.map((img) => (
                    <Card key={img._id}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between gap-4">
                          <p className="text-sm font-semibold">
                            {img.data.imagingType}
                            {img.data.bodyPart && (
                              <span className="text-xs text-muted-foreground font-normal ml-2">
                                {img.data.bodyPart}
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(img.data.reportDate, 'short')}
                          </p>
                        </div>
                        {img.data.indication && (
                          <p className="text-sm text-muted-foreground mt-2">
                            <span className="font-medium text-foreground">
                              Indication:
                            </span>{' '}
                            {img.data.indication}
                          </p>
                        )}
                        {img.data.findings && (
                          <p className="text-sm mt-2">
                            <span className="font-medium">Findings:</span>{' '}
                            {img.data.findings}
                          </p>
                        )}
                        {img.data.impression && (
                          <p className="text-sm mt-2">
                            <span className="font-medium">Impression:</span>{' '}
                            {img.data.impression}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </TabsContent>

          {/* Vaccinations */}
          <TabsContent value="vaccinations" className="mt-4">
            {!data.vaccinations.length ? (
              <EmptyState icon={Syringe} message="No vaccinations recorded yet." />
            ) : (
              <>
                <TabCount count={data.vaccinations.length} label="vaccination" />
                <div className="space-y-3">
                  {data.vaccinations.map((v) => (
                    <Card key={v._id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold">
                              {v.data.vaccineName}
                              {v.data.vaccineCode && (
                                <Badge variant="gray" className="ml-2 font-mono text-xs">
                                  {v.data.vaccineCode}
                                </Badge>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {v.data.dose
                                ? `Dose ${v.data.dose}${v.data.route ? ` · ${v.data.route}` : ''}${v.data.site ? ` (${v.data.site})` : ''}`
                                : ''}
                              {' · '}Administered{' '}
                              {formatDate(v.data.administeredAt, 'short')}
                              {v.data.nextDueDate
                                ? ` · Next due ${formatDate(v.data.nextDueDate, 'short')}`
                                : ''}
                            </p>
                            {v.data.lotNumber && (
                              <p className="text-xs text-muted-foreground mt-1 font-mono">
                                Lot {v.data.lotNumber}
                                {v.data.manufacturer
                                  ? ` · ${v.data.manufacturer}`
                                  : ''}
                              </p>
                            )}
                            {v.data.notes && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {v.data.notes}
                              </p>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </TabsContent>

          {/* Procedures */}
          <TabsContent value="procedures" className="mt-4">
            {!data.procedures.length ? (
              <EmptyState icon={Scissors} message="No procedures recorded yet." />
            ) : (
              <>
                <TabCount count={data.procedures.length} label="procedure" />
                <div className="space-y-3">
                  {data.procedures.map((p) => (
                    <Card key={p._id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold">
                                {p.data.procedureName}
                              </p>
                              {p.data.procedureCode && (
                                <Badge variant="gray" className="font-mono text-xs">
                                  {p.data.procedureCode}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              Performed {formatDate(p.data.performedAt, 'short')}
                              {p.data.duration
                                ? ` · ${p.data.duration}`
                                : ''}
                            </p>
                            {p.data.outcome && (
                              <p className="text-sm text-muted-foreground mt-1">
                                Outcome: {p.data.outcome}
                              </p>
                            )}
                            {p.data.notes && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {p.data.notes}
                              </p>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </TabsContent>

          {/* Notes */}
          <TabsContent value="notes" className="mt-4">
            {!notes.length ? (
              <EmptyState icon={FileText} message="No clinical notes recorded yet." />
            ) : (
              <>
                <TabCount count={notes.length} label="clinical note" />
                <div className="space-y-3">
                  {notes.map((n) => (
                    <Card key={n._id}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2">
                            {n.data.noteType && (
                              <Badge variant="gray">{n.data.noteType}</Badge>
                            )}
                            <p className="text-xs text-muted-foreground">
                              {formatDate(n.createdAt, 'short')}
                            </p>
                          </div>
                        </div>
                        {n.data.content && (
                          <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">
                            {n.data.content}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}