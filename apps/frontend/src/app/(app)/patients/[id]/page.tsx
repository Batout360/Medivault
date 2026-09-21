'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft,
  Edit,
  Fingerprint,
  Phone,
  Mail,
  MapPin,
  AlertCircle,
  Heart,
  User,
  Stethoscope,
  Pill,
  FlaskConical,
  Activity,
  FileText,
  ClipboardList,
  Plus,
  CreditCard,
  Search,
  Filter,
  Upload,
  Download,
  Eye,
  CalendarDays,
  KeyRound,
  Copy,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { SkeletonCard } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/modal';
import { MedicalProfileCardView } from '@/components/medical-profile-card';
import { VisibilitySettingsPanel } from '@/components/visibility-settings-panel';
import { apiClient, normalizeError } from '@/lib/api/client';
import { cn, formatDate, calculateAge } from '@/lib/utils';
import { useAuthStore } from '@/lib/stores/auth.store';
import type { MedicalProfileCard as MedicalProfileCardData } from '@/lib/hooks/use-api';
import { UserRole } from '@medivault/shared';

// ─── Types ────────────────────────────────────────────────────────────────────
interface PatientAllergy {
  id: string;
  allergen: string;
  allergyType?: string | null;
  severity?: string | null;
  reaction?: string | null;
  notes?: string | null;
  isActive: boolean;
}

interface PatientCondition {
  id: string;
  conditionName: string;
  conditionCode?: string | null;
  status: string;
  diagnosedAt?: string | null;
  notes?: string | null;
}

interface PatientEmergencyContact {
  id: string;
  name: string;
  relationship: string;
  phone: string;
  email?: string | null;
  isActive: boolean;
}

interface PatientDetail {
  _id?: string;
  id?: string;
  patientId?: string;
  profileId: string | null;
  mrn: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  bloodGroup: string | null;
  phoneNumber: string;
  email: string | null;
  address: Record<string, unknown> | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  /** Embedded arrays — backend returns these instead of flat strings */
  allergies: PatientAllergy[];
  conditions: PatientCondition[];
  emergencyContacts: PatientEmergencyContact[];
  isActive: boolean;
  biometricEnrolled?: boolean;
  hasBiometric?: boolean;
  registeredAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

const BLOOD_GROUP_LABELS: Record<string, string> = {
  A_POSITIVE: 'A+',
  A_NEGATIVE: 'A-',
  B_POSITIVE: 'B+',
  B_NEGATIVE: 'B-',
  AB_POSITIVE: 'AB+',
  AB_NEGATIVE: 'AB-',
  O_POSITIVE: 'O+',
  O_NEGATIVE: 'O-',
  UNKNOWN: 'Unknown',
};

function displayBloodGroup(value: string | null): string {
  if (!value) return '—';
  return BLOOD_GROUP_LABELS[value.toUpperCase()] ?? value;
}

function displayGender(value: string): string {
  const normalized = value.toUpperCase();
  if (normalized === 'PREFER_NOT_TO_SAY') return 'Prefer not to say';
  return normalized.charAt(0) + normalized.slice(1).toLowerCase();
}

interface PatientDocument {
  _id: string;
  id?: string;
  originalName: string;
  category: string | null;
  description: string | null;
  sourceHospital: string | null;
  mimeType: string;
  sizeBytes: number;
  uploadedById: string;
  createdAt: string;
  documentTitle?: string | null;
  documentDate?: string | null;
  facilityId?: string | null;
  notes?: string | null;
  uploadedByName?: string | null;
  uploadedByRole?: string | null;
}

interface Diagnosis {
  id: string;
  icdCode: string | null;
  name: string;
  description: string | null;
  severity: string;
  status: string;
  diagnosedAt: string;
  diagnosedBy: string;
  resolvedAt: string | null;
}

interface Prescription {
  id: string;
  medicationName: string;
  dosage: string;
  frequency: string;
  route: string;
  startDate: string;
  endDate: string | null;
  instructions: string | null;
  prescribedBy: string;
  status: string;
}

interface Vital {
  id: string;
  recordedAt: string;
  bloodPressureSystolic: number | null;
  bloodPressureDiastolic: number | null;
  heartRate: number | null;
  temperature: number | null;
  respiratoryRate: number | null;
  oxygenSaturation: number | null;
  weight: number | null;
  height: number | null;
  bmi: number | null;
  recordedBy: string;
}

interface LabReport {
  id: string;
  testName: string;
  testCode: string | null;
  result: string | null;
  referenceRange: string | null;
  unit: string | null;
  status: string;
  orderedAt: string;
  resultAt: string | null;
  orderedBy: string;
  notes: string | null;
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function SeverityBadge({ severity }: { severity: string }) {
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

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, 'success' | 'warning' | 'gray' | 'info'> = {
    ACTIVE: 'success',
    RESOLVED: 'gray',
    ONGOING: 'info',
    COMPLETED: 'gray',
    PENDING: 'warning',
    VERIFIED: 'success',
  };
  return (
    <Badge variant={variants[status.toUpperCase()] ?? 'gray'} dot>
      {status}
    </Badge>
  );
}

// ─── Vitals display ──────────────────────────────────────────────────────────
function VitalCard({ vital }: { vital: Vital }) {
  const items = [
    {
      label: 'Blood Pressure',
      value:
        vital.bloodPressureSystolic && vital.bloodPressureDiastolic
          ? `${vital.bloodPressureSystolic}/${vital.bloodPressureDiastolic}`
          : '—',
      unit: 'mmHg',
    },
    { label: 'Heart Rate', value: vital.heartRate ?? '—', unit: 'bpm' },
    { label: 'Temperature', value: vital.temperature ?? '—', unit: '°C' },
    { label: 'SpO₂', value: vital.oxygenSaturation ?? '—', unit: '%' },
    {
      label: 'Respiratory Rate',
      value: vital.respiratoryRate ?? '—',
      unit: '/min',
    },
    { label: 'Weight', value: vital.weight ?? '—', unit: 'kg' },
    { label: 'Height', value: vital.height ?? '—', unit: 'cm' },
    { label: 'BMI', value: vital.bmi ?? '—', unit: '' },
  ];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="py-3 px-4 bg-muted/30 border-b border-border">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">
            {formatDate(vital.recordedAt, 'long')}
          </p>
          <p className="text-xs text-muted-foreground">by {vital.recordedBy}</p>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {items.map((item) => (
            <div key={item.label}>
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="text-base font-semibold tabular-nums mt-0.5">
                {item.value}
                {item.value !== '—' && item.unit && (
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

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({
  icon: Icon,
  message,
  action,
}: {
  icon: React.ElementType;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center">
      <div className="rounded-full bg-muted p-4">
        <Icon className="h-6 w-6 text-muted-foreground/30" />
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
      {action}
    </div>
  );
}

const DOCUMENT_TYPES = [
  'LAB_REPORT',
  'IMAGING_REPORT',
  'DIAGNOSTIC_REPORT',
  'MEDICAL_REPORT',
  'PRESCRIPTION',
  'DISCHARGE_SUMMARY',
  'REFERRAL_LETTER',
  'MEDICAL_CERTIFICATE',
  'CONSULTATION_NOTES',
  'TREATMENT_PLAN',
  'CONSENT_FORM',
  'INSURANCE_DOCUMENT',
  'VACCINATION_RECORD',
  'MEDICAL_HISTORY',
  'CLINICAL_NOTE',
  'OPERATIVE_REPORT',
  'PATHOLOGY_REPORT',
  'OTHER',
] as const;

function formatDocumentType(type: string) {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ─── Documents tab ────────────────────────────────────────────────────────────
interface DocumentFilters {
  q: string;
  type: string;
  facility: string;
  uploadedBy: string;
  from: string;
  to: string;
}

interface UploaderOption {
  id: string;
  name: string;
  role: string;
}

function useDebounced<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function DocumentsTab({
  patientId,
  canUploadDocument,
}: {
  patientId: string;
  canUploadDocument: boolean;
}) {
  const queryClient = useQueryClient();
  // Prefill the source hospital with the uploading staff member's workplace so
  // documents are tagged with their hospital out of the box.
  const currentHospital = useAuthStore((s) => s.user?.hospital ?? '');

  // Upload form state
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [documentType, setDocumentType] = React.useState<string>('OTHER');
  const [title, setTitle] = React.useState('');
  const [documentDate, setDocumentDate] = React.useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [description, setDescription] = React.useState('');
  const [sourceHospital, setSourceHospital] = React.useState(currentHospital);
  const [notes, setNotes] = React.useState('');
  const [status, setStatus] = React.useState<{
    kind: 'error' | 'success';
    message: string;
  } | null>(null);

  // Filters (debounced)
  const [q, setQ] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState('');
  const [facilityFilter, setFacilityFilter] = React.useState('');
  const [doctorFilter, setDoctorFilter] = React.useState('');
  const [fromDate, setFromDate] = React.useState('');
  const [toDate, setToDate] = React.useState('');
  const debouncedQ = useDebounced(q.trim());
  const debouncedFacility = useDebounced(facilityFilter.trim());

  const filters: DocumentFilters = {
    q: debouncedQ,
    type: typeFilter,
    facility: debouncedFacility,
    uploadedBy: doctorFilter,
    from: fromDate,
    to: toDate,
  };

  const resetUploadForm = () => {
    setFile(null);
    setDocumentType('OTHER');
    setTitle('');
    setDocumentDate(new Date().toISOString().slice(0, 10));
    setDescription('');
    setSourceHospital('');
    setNotes('');
  };

  const { data: uploaders } = useQuery({
    queryKey: ['patient', patientId, 'documents', 'uploaders'],
    queryFn: async () => {
      const res = await apiClient.get<UploaderOption[]>(
        `/patients/${patientId}/documents/uploaders`,
      );
      return res.data;
    },
    enabled: !!patientId,
    staleTime: 60_000,
  });

  const { data: documents, isLoading } = useQuery({
    queryKey: ['patient', patientId, 'documents', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.q) params.set('q', filters.q);
      if (filters.type) params.set('type', filters.type);
      if (filters.facility) params.set('facility', filters.facility);
      if (filters.uploadedBy) params.set('uploadedBy', filters.uploadedBy);
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      const qs = params.toString();
      const res = await apiClient.get<PatientDocument[]>(
        `/patients/${patientId}/documents${qs ? `?${qs}` : ''}`,
      );
      return res.data;
    },
    enabled: !!patientId,
    staleTime: 30_000,
  });

  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await apiClient.post<PatientDocument>(
        `/patients/${patientId}/documents`,
        formData,
      );
      return res.data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['patient', patientId, 'documents'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['patient', patientId, 'documents', 'uploaders'],
        }),
      ]);
      setUploadOpen(false);
      resetUploadForm();
      setStatus({
        kind: 'success',
        message: 'Document uploaded successfully.',
      });
    },
    onError: (err: unknown) => {
      const apiErr = normalizeError(err);
      console.error('Document upload failed:', apiErr, err);
      setStatus({
        kind: 'error',
        message: `Upload failed (HTTP ${apiErr.statusCode}): ${apiErr.message}`,
      });
    },
  });

  const handleUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('documentType', documentType);
    if (title.trim()) formData.append('title', title.trim());
    if (documentDate) formData.append('documentDate', documentDate);
    if (description.trim()) formData.append('description', description.trim());
    if (sourceHospital.trim())
      formData.append('sourceHospital', sourceHospital.trim());
    if (notes.trim()) formData.append('notes', notes.trim());
    setStatus(null);
    uploadMutation.mutate(formData);
  };

  const getSignedUrl = async (
    doc: PatientDocument,
    mode?: 'inline' | 'attachment',
  ) => {
    const id = doc._id ?? doc.id;
    if (!id) return;
    const res = await apiClient.get<{ url: string }>(
      `/patients/${patientId}/documents/${id}/download-url${mode ? `?mode=${mode}` : ''}`,
    );
    return res.data.url;
  };

  const handleView = async (doc: PatientDocument) => {
    try {
      const url = await getSignedUrl(doc, 'inline');
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      setStatus({
        kind: 'error',
        message: 'Could not open the file. Try again.',
      });
    }
  };

  const handleDownload = async (doc: PatientDocument) => {
    try {
      const url = await getSignedUrl(doc, 'attachment');
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      setStatus({
        kind: 'error',
        message: 'Could not generate download link. Try again.',
      });
    }
  };

  const handleDelete = async (doc: PatientDocument) => {
    const id = doc._id ?? doc.id;
    if (!id) return;
    if (!window.confirm(`Delete “${doc.originalName}”? This cannot be undone.`))
      return;
    try {
      await apiClient.delete(`/patients/${patientId}/documents/${id}`);
      await queryClient.invalidateQueries({
        queryKey: ['patient', patientId, 'documents'],
      });
      setStatus({ kind: 'success', message: 'Document deleted.' });
    } catch {
      setStatus({ kind: 'error', message: 'Could not delete the document.' });
    }
  };

  const hasFilters = Boolean(
    debouncedQ ||
    typeFilter ||
    facilityFilter ||
    doctorFilter ||
    fromDate ||
    toDate,
  );

  const clearFilters = () => {
    setQ('');
    setTypeFilter('');
    setFacilityFilter('');
    setDoctorFilter('');
    setFromDate('');
    setToDate('');
  };

  return (
    <div className="space-y-4">
      {/* Header + upload button */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">
          {documents?.length ?? 0} document{documents?.length === 1 ? '' : 's'}
        </p>
        {canUploadDocument && (
          <Button
            size="sm"
            onClick={() => {
              resetUploadForm();
              setStatus(null);
              setUploadOpen(true);
            }}
          >
            <Upload className="h-3.5 w-3.5" />
            Upload Medical Document
          </Button>
        )}
      </div>

      {/* Transient upload/delete feedback */}
      {status && (
        <p
          className={cn(
            'text-sm',
            status.kind === 'error'
              ? 'text-destructive'
              : 'text-emerald-600 dark:text-emerald-400',
          )}
        >
          {status.message}
        </p>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title, file name, hospital…"
            className="w-full h-9 rounded-md border border-input bg-background pl-8 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>
        <div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Filter by document type"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <option value="">All types</option>
            {DOCUMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {formatDocumentType(t)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <select
            value={doctorFilter}
            onChange={(e) => setDoctorFilter(e.target.value)}
            aria-label="Filter by doctor"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <option value="">All doctors</option>
            {(uploaders ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div className="relative">
          <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={facilityFilter}
            onChange={(e) => setFacilityFilter(e.target.value)}
            placeholder="Facility"
            className="h-9 w-40 rounded-md border border-input bg-background pl-8 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>
        <div className="relative">
          <CalendarDays className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            aria-label="From date"
            title="From date"
            className="h-9 w-40 rounded-md border border-input bg-background pl-8 pr-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>
        <div className="relative">
          <CalendarDays className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            aria-label="To date"
            title="To date"
            className="h-9 w-40 rounded-md border border-input bg-background pl-8 pr-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear
          </Button>
        )}
      </div>

      {isLoading ? (
        <SkeletonCard />
      ) : !documents?.length ? (
        <EmptyState
          icon={FileText}
          message="No documents match. Records from other hospitals can be attached here."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-2 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Record
                </th>
                <th className="py-2 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Type
                </th>
                <th className="py-2 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Facility
                </th>
                <th className="py-2 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Uploaded by
                </th>
                <th className="py-2 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Date
                </th>
                <th className="py-2 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Size
                </th>
                <th className="py-2 px-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {documents.map((doc) => {
                const id = doc._id ?? doc.id;
                return (
                  <tr key={id} className="hover:bg-accent/30 transition-colors">
                    <td className="py-3 px-3">
                      <p className="font-medium flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span>{doc.documentTitle || doc.originalName}</span>
                      </p>
                      {(doc.notes ?? doc.description) && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {doc.notes ?? doc.description}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground/70 font-mono mt-0.5">
                        {doc.originalName}
                      </p>
                    </td>
                    <td className="py-3 px-3">
                      <Badge variant="gray">
                        {formatDocumentType(doc.category ?? 'OTHER')}
                      </Badge>
                    </td>
                    <td className="py-3 px-3 text-muted-foreground">
                      {doc.sourceHospital ?? '—'}
                    </td>
                    <td className="py-3 px-3 text-muted-foreground">
                      {doc.uploadedByName ?? '—'}
                    </td>
                    <td className="py-3 px-3 text-muted-foreground whitespace-nowrap">
                      {formatDate(doc.documentDate ?? doc.createdAt, 'short')}
                    </td>
                    <td className="py-3 px-3 text-muted-foreground whitespace-nowrap">
                      {formatFileSize(doc.sizeBytes)}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleView(doc)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleDownload(doc)}
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download
                        </Button>
                        {canUploadDocument && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => void handleDelete(doc)}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Upload Medical Document modal ─────────────────────────────────── */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Upload Medical Document</DialogTitle>
            <DialogDescription>
              Attach a clinical document to this patient&apos;s record. Only
              authorized clinical staff can upload or delete documents.
            </DialogDescription>
          </DialogHeader>

          <form
            id="upload-document-form"
            onSubmit={handleUpload}
            className="px-6 space-y-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Document <span className="text-destructive">*</span>
                </label>
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,application/dicom"
                  required
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="mt-1 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  PDF, JPEG, PNG or DICOM — up to 50 MB.
                </p>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Document type
                </label>
                <select
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value)}
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {DOCUMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {formatDocumentType(t)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Document title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Blood Test — Sep 2026"
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Document date
                </label>
                <input
                  type="date"
                  value={documentDate}
                  onChange={(e) => setDocumentDate(e.target.value)}
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Source hospital / facility
                </label>
                <input
                  type="text"
                  value={sourceHospital}
                  onChange={(e) => setSourceHospital(e.target.value)}
                  placeholder="e.g. City General Hospital"
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Short description of the document…"
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Notes (optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Free-text clinical notes…"
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>
            </div>
          </form>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setUploadOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="upload-document-form"
              disabled={!file || uploadMutation.isPending}
            >
              {uploadMutation.isPending ? 'Uploading…' : 'Upload Document'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Medical Card tab ─────────────────────────────────────────────────────────
function MedicalCardTabView({
  patientId,
  canManage,
}: {
  patientId: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();

  const {
    data: card,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['medical-profile', patientId],
    queryFn: async () => {
      const res = await apiClient.get<MedicalProfileCardData>(
        `/medical-profile/patients/${patientId}`,
      );
      return res.data;
    },
    enabled: !!patientId,
    staleTime: 60_000,
  });

  if (isLoading) return <SkeletonCard />;
  if (!card) {
    return (
      <EmptyState
        icon={CreditCard}
        message="Could not load the medical profile card for this patient."
      />
    );
  }

  const handleRefresh = () => {
    void queryClient.invalidateQueries({
      queryKey: ['medical-profile', patientId],
    });
    void queryClient.invalidateQueries({ queryKey: ['patient', patientId] });
    void refetch();
  };

  return (
    <div className="space-y-6">
      <MedicalProfileCardView
        card={card}
        canManage={canManage}
        onRefresh={handleRefresh}
      />

      {/* Visibility settings — always collapsible in staff view */}
      {canManage && (
        <VisibilitySettingsPanel
          patientId={patientId}
          initialVisibility={card.visibility ?? null}
          onSaved={handleRefresh}
          collapsible
        />
      )}
    </div>
  );
}

// ─── Patient Profile Page ─────────────────────────────────────────────────────
export default function PatientProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const canEdit =
    user?.role === UserRole.ORG_ADMIN ||
    user?.role === UserRole.FACILITY_ADMIN ||
    user?.role === UserRole.SUPER_ADMIN ||
    user?.role === UserRole.RECEPTIONIST;
  // Only doctors and admins may add/edit clinical (medical record) data
  const canAddClinical =
    user?.role === UserRole.SUPER_ADMIN ||
    user?.role === UserRole.ORG_ADMIN ||
    user?.role === UserRole.FACILITY_ADMIN ||
    user?.role === UserRole.DOCTOR;
  const canUploadDocuments = canAddClinical;
  // Only admins may create/reset the patient's login credentials
  const canManageLogin =
    user?.role === UserRole.SUPER_ADMIN ||
    user?.role === UserRole.ORG_ADMIN ||
    user?.role === UserRole.FACILITY_ADMIN;

  const [loginDialogOpen, setLoginDialogOpen] = React.useState(false);
  const [loginResult, setLoginResult] = React.useState<{
    userId: string;
    email: string;
    username: string;
    temporaryPassword: string;
    createdAccount: boolean;
  } | null>(null);

  const generateLoginMutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<{
        userId: string;
        email: string;
        username: string;
        temporaryPassword: string;
        createdAccount: boolean;
      }>(`/patients/${id}/generate-login`);
      return res.data;
    },
    onSuccess: (data) => {
      setLoginResult(data);
      setLoginDialogOpen(true);
      toast.success(
        data.createdAccount
          ? 'Login account created. Share the credentials below.'
          : 'Password reset. New credentials generated below.',
      );
    },
    onError: (err: unknown) => {
      const apiErr = normalizeError(err);
      toast.error(`Failed: ${apiErr.message}`);
    },
  });

  const copyCredentials = async () => {
    if (!loginResult) return;
    try {
      await navigator.clipboard.writeText(
        `Email: ${loginResult.email}\nPassword: ${loginResult.temporaryPassword}`,
      );
      toast.success('Credentials copied to clipboard.');
    } catch {
      toast.error('Could not copy to clipboard.');
    }
  };

  // Patient data
  const { data: patient, isLoading: patientLoading } = useQuery({
    queryKey: ['patient', id],
    queryFn: async () => {
      const res = await apiClient.get<PatientDetail>(`/patients/${id}`);
      return res.data;
    },
  });

  // Diagnoses
  const { data: diagnoses } = useQuery({
    queryKey: ['patient', id, 'diagnoses'],
    queryFn: async () => {
      const res = await apiClient.get<Diagnosis[]>(`/patients/${id}/diagnoses`);
      return res.data;
    },
    enabled: !!patient,
  });

  // Prescriptions
  const { data: prescriptions } = useQuery({
    queryKey: ['patient', id, 'prescriptions'],
    queryFn: async () => {
      const res = await apiClient.get<Prescription[]>(
        `/patients/${id}/prescriptions`,
      );
      return res.data;
    },
    enabled: !!patient,
  });

  // Vitals
  const { data: vitals } = useQuery({
    queryKey: ['patient', id, 'vitals'],
    queryFn: async () => {
      const res = await apiClient.get<Vital[]>(`/patients/${id}/vitals`);
      return res.data;
    },
    enabled: !!patient,
  });

  // Lab reports
  const { data: labs } = useQuery({
    queryKey: ['patient', id, 'labs'],
    queryFn: async () => {
      const res = await apiClient.get<LabReport[]>(
        `/patients/${id}/lab-reports`,
      );
      return res.data;
    },
    enabled: !!patient,
  });

  if (patientLoading) {
    return (
      <div className="space-y-6">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <User className="h-12 w-12 text-muted-foreground/30" />
        <p className="text-base font-medium">Patient not found.</p>
        <Button variant="outline" onClick={() => router.push('/patients')}>
          Back to Patients
        </Button>
      </div>
    );
  }

  const fullName = `${patient.firstName} ${patient.lastName}`;

  return (
    <div className="space-y-6">
      {/* ─── Breadcrumb + Back ──────────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <button
          onClick={() => router.push('/patients')}
          className="flex items-center gap-1 hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Patients
        </button>
        <span>/</span>
        <span className="text-foreground font-medium">{fullName}</span>
      </div>

      {/* ─── Patient Header ─────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-start gap-5">
            {/* Avatar */}
            <Avatar name={fullName} size="xl" />

            {/* Info */}
            <div className="flex-1 min-w-0 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-xl font-bold">{fullName}</h1>
                    {(patient.biometricEnrolled || patient.hasBiometric) && (
                      <Badge
                        variant="purple"
                        className="flex items-center gap-1"
                      >
                        <Fingerprint className="h-2.5 w-2.5" />
                        Biometric
                      </Badge>
                    )}
                    <Badge variant={patient.isActive ? 'success' : 'gray'} dot>
                      {patient.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                    <p className="text-sm font-mono font-semibold text-primary">
                      ID: {patient.profileId ?? '—'}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {patient.mrn}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {canManageLogin && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void generateLoginMutation.mutateAsync()}
                      loading={generateLoginMutation.isPending}
                      title="Create or reset the patient's sign-in credentials"
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      Login Details
                    </Button>
                  )}
                  {canEdit && (
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/patients/${id}/edit`}>
                        <Edit className="h-3.5 w-3.5" />
                        Edit
                      </Link>
                    </Button>
                  )}
                  {!patient.biometricEnrolled && !patient.hasBiometric && (
                    <Button
                      size="sm"
                      className="bg-violet-600 hover:bg-violet-700 text-white"
                      asChild
                    >
                      <Link href={`/fingerprint?enroll=${id}`}>
                        <Fingerprint className="h-3.5 w-3.5" />
                        Enroll Fingerprint
                      </Link>
                    </Button>
                  )}
                </div>
              </div>

              {/* Key stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Age / DOB</p>
                  <p className="text-sm font-medium">
                    {calculateAge(patient.dateOfBirth)} ·{' '}
                    {formatDate(patient.dateOfBirth, 'short')}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Gender</p>
                  <p className="text-sm font-medium">
                    {displayGender(patient.gender)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Blood Group</p>
                  <p className="text-sm font-bold text-red-600 dark:text-red-400">
                    {displayBloodGroup(patient.bloodGroup)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Registered</p>
                  <p className="text-sm font-medium">
                    {formatDate(
                      patient.registeredAt ?? patient.createdAt,
                      'short',
                    )}
                  </p>
                </div>
              </div>

              {/* Contact info strip */}
              <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Phone className="h-3.5 w-3.5" />
                  {patient.phoneNumber}
                </span>
                {patient.email && (
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Mail className="h-3.5 w-3.5" />
                    {patient.email}
                  </span>
                )}
                {(patient.city || patient.state) && (
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    {[patient.city, patient.state].filter(Boolean).join(', ')}
                  </span>
                )}
              </div>

              {/* Allergies alert */}
              {patient.allergies?.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 px-3 py-2">
                  <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase tracking-wide">
                      Allergies
                    </p>
                    <p className="text-sm text-red-800 dark:text-red-300 mt-0.5">
                      {patient.allergies
                        .filter((a) => a.isActive)
                        .map(
                          (a) =>
                            `${a.allergen}${a.severity ? ` (${a.severity})` : ''}`,
                        )
                        .join(', ')}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Tabbed Medical Records ─────────────────────────────────────── */}
      <Tabs defaultValue="overview">
        <div className="border-b border-border overflow-x-auto">
          <TabsList className="bg-transparent h-auto p-0 gap-0 rounded-none">
            {[
              { value: 'overview', label: 'Overview', icon: ClipboardList },
              { value: 'diagnoses', label: 'Diagnoses', icon: Stethoscope },
              { value: 'prescriptions', label: 'Prescriptions', icon: Pill },
              { value: 'vitals', label: 'Vitals', icon: Activity },
              { value: 'labs', label: 'Lab Reports', icon: FlaskConical },
              {
                value: 'medical-card',
                label: 'Medical Card',
                icon: CreditCard,
              },
              { value: 'documents', label: 'Documents', icon: FileText },
            ].map(({ value, label, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                className={cn(
                  'rounded-none border-b-2 border-transparent px-4 py-2.5 text-sm font-medium text-muted-foreground',
                  'data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent',
                  'hover:text-foreground transition-colors flex items-center gap-1.5',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* Overview tab */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Medical conditions */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Medical Conditions</CardTitle>
              </CardHeader>
              <CardContent>
                {patient.conditions?.length > 0 ? (
                  <ul className="space-y-1">
                    {patient.conditions.map((c) => (
                      <li key={c.id} className="text-sm text-muted-foreground">
                        {c.conditionName}
                        {c.status && c.status !== 'ACTIVE' && (
                          <span className="ml-1 text-xs opacity-70">
                            ({c.status})
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    None recorded
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Current medications (comes from prescriptions, not a flat field) */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Current Medications</CardTitle>
              </CardHeader>
              <CardContent>
                {prescriptions?.filter((rx) => rx.status === 'ACTIVE')
                  .length ? (
                  <ul className="space-y-1">
                    {prescriptions
                      .filter((rx) => rx.status === 'ACTIVE')
                      .slice(0, 5)
                      .map((rx) => (
                        <li
                          key={rx.id}
                          className="text-sm text-muted-foreground"
                        >
                          {rx.medicationName}
                          {rx.dosage ? ` — ${rx.dosage}` : ''}
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    None recorded
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Emergency contact */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Heart className="h-3.5 w-3.5 text-red-500" />
                  Emergency Contact
                </CardTitle>
              </CardHeader>
              <CardContent>
                {patient.emergencyContacts?.filter((ec) => ec.isActive).length >
                0 ? (
                  <div className="space-y-1">
                    {patient.emergencyContacts
                      .filter((ec) => ec.isActive)
                      .map((ec) => (
                        <div key={ec.id} className="space-y-0.5">
                          <p className="text-sm font-medium">{ec.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {ec.relationship}
                          </p>
                          <p className="text-sm flex items-center gap-1.5">
                            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                            {ec.phone}
                          </p>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    Not recorded
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Recent vitals summary */}
            {vitals?.[0] && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span>Latest Vitals</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {formatDate(vitals[0].recordedAt, 'short')}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3">
                    {vitals[0].bloodPressureSystolic && (
                      <div>
                        <p className="text-xs text-muted-foreground">BP</p>
                        <p className="text-sm font-semibold">
                          {vitals[0].bloodPressureSystolic}/
                          {vitals[0].bloodPressureDiastolic}{' '}
                          <span className="text-xs font-normal text-muted-foreground">
                            mmHg
                          </span>
                        </p>
                      </div>
                    )}
                    {vitals[0].heartRate && (
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Heart Rate
                        </p>
                        <p className="text-sm font-semibold">
                          {vitals[0].heartRate}{' '}
                          <span className="text-xs font-normal text-muted-foreground">
                            bpm
                          </span>
                        </p>
                      </div>
                    )}
                    {vitals[0].oxygenSaturation && (
                      <div>
                        <p className="text-xs text-muted-foreground">SpO₂</p>
                        <p className="text-sm font-semibold">
                          {vitals[0].oxygenSaturation}
                          <span className="text-xs font-normal text-muted-foreground">
                            %
                          </span>
                        </p>
                      </div>
                    )}
                    {vitals[0].temperature && (
                      <div>
                        <p className="text-xs text-muted-foreground">Temp</p>
                        <p className="text-sm font-semibold">
                          {vitals[0].temperature}
                          <span className="text-xs font-normal text-muted-foreground">
                            °C
                          </span>
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Diagnoses tab */}
        <TabsContent value="diagnoses" className="mt-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-medium text-muted-foreground">
              {diagnoses?.length ?? 0} diagnos
              {diagnoses?.length === 1 ? 'is' : 'es'} recorded
            </p>
            {canAddClinical && (
              <Button size="sm" asChild>
                <Link href={`/patients/${id}/diagnoses/new`}>
                  <Plus className="h-3.5 w-3.5" />
                  Add Diagnosis
                </Link>
              </Button>
            )}
          </div>
          {!diagnoses?.length ? (
            <EmptyState
              icon={Stethoscope}
              message="No diagnoses recorded yet."
            />
          ) : (
            <div className="space-y-3">
              {diagnoses.map((dx) => (
                <Card key={dx.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold">{dx.name}</p>
                          {dx.icdCode && (
                            <Badge variant="gray" className="font-mono text-xs">
                              {dx.icdCode}
                            </Badge>
                          )}
                        </div>
                        {dx.description && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {dx.description}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-2">
                          Diagnosed {formatDate(dx.diagnosedAt, 'short')} by{' '}
                          {dx.diagnosedBy}
                          {dx.resolvedAt &&
                            ` · Resolved ${formatDate(dx.resolvedAt, 'short')}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <SeverityBadge severity={dx.severity} />
                        <StatusBadge status={dx.status} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Prescriptions tab */}
        <TabsContent value="prescriptions" className="mt-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-medium text-muted-foreground">
              {prescriptions?.length ?? 0} prescription
              {prescriptions?.length !== 1 ? 's' : ''}
            </p>
            {canAddClinical && (
              <Button size="sm" asChild>
                <Link href={`/patients/${id}/prescriptions/new`}>
                  <Plus className="h-3.5 w-3.5" />
                  Add Prescription
                </Link>
              </Button>
            )}
          </div>
          {!prescriptions?.length ? (
            <EmptyState icon={Pill} message="No prescriptions yet." />
          ) : (
            <div className="space-y-3">
              {prescriptions.map((rx) => (
                <Card key={rx.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">
                          {rx.medicationName}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {rx.dosage} — {rx.frequency} — {rx.route}
                        </p>
                        {rx.instructions && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {rx.instructions}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-2">
                          From {formatDate(rx.startDate, 'short')}
                          {rx.endDate
                            ? ` to ${formatDate(rx.endDate, 'short')}`
                            : ''}
                          {' · '} by {rx.prescribedBy}
                        </p>
                      </div>
                      <StatusBadge status={rx.status} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Vitals tab */}
        <TabsContent value="vitals" className="mt-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-medium text-muted-foreground">
              {vitals?.length ?? 0} vital record
              {vitals?.length !== 1 ? 's' : ''}
            </p>
            {canAddClinical && (
              <Button size="sm" asChild>
                <Link href={`/patients/${id}/vitals/new`}>
                  <Plus className="h-3.5 w-3.5" />
                  Record Vitals
                </Link>
              </Button>
            )}
          </div>
          {!vitals?.length ? (
            <EmptyState icon={Activity} message="No vitals recorded yet." />
          ) : (
            <div className="space-y-3">
              {vitals.map((v) => (
                <VitalCard key={v.id} vital={v} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Lab Reports tab */}
        <TabsContent value="labs" className="mt-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-medium text-muted-foreground">
              {labs?.length ?? 0} lab report{labs?.length !== 1 ? 's' : ''}
            </p>
            {canAddClinical && (
              <Button size="sm" asChild>
                <Link href={`/patients/${id}/labs/new`}>
                  <Plus className="h-3.5 w-3.5" />
                  Add Lab Report
                </Link>
              </Button>
            )}
          </div>
          {!labs?.length ? (
            <EmptyState icon={FlaskConical} message="No lab reports yet." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="py-2 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                      Test
                    </th>
                    <th className="py-2 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                      Result
                    </th>
                    <th className="py-2 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                      Reference
                    </th>
                    <th className="py-2 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                      Status
                    </th>
                    <th className="py-2 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {labs.map((lab) => (
                    <tr
                      key={lab.id}
                      className="hover:bg-accent/30 transition-colors"
                    >
                      <td className="py-3 px-3">
                        <p className="font-medium">{lab.testName}</p>
                        {lab.testCode && (
                          <p className="text-xs text-muted-foreground font-mono">
                            {lab.testCode}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {lab.result ? (
                          <span className="font-semibold">
                            {lab.result}
                            {lab.unit ? ` ${lab.unit}` : ''}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-3 px-3 text-muted-foreground text-xs">
                        {lab.referenceRange ?? '—'}
                      </td>
                      <td className="py-3 px-3">
                        <StatusBadge status={lab.status} />
                      </td>
                      <td className="py-3 px-3 text-muted-foreground">
                        {formatDate(lab.resultAt ?? lab.orderedAt, 'short')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* Medical Card tab */}
        <TabsContent value="medical-card" className="mt-4">
          <MedicalCardTabView patientId={id} canManage={canAddClinical} />
        </TabsContent>

        {/* Documents tab */}
        <TabsContent value="documents" className="mt-4">
          <DocumentsTab patientId={id} canUploadDocument={canUploadDocuments} />
        </TabsContent>
      </Tabs>

      {/* ─── Login credentials dialog ──────────────────────────────────── */}
      <Dialog open={loginDialogOpen} onOpenChange={setLoginDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              {loginResult?.createdAccount
                ? 'Login account created'
                : 'Login credentials reset'}
            </DialogTitle>
            <DialogDescription>
              Share these credentials with the patient. The password is shown
              once — the patient should change it after their first sign-in.
            </DialogDescription>
          </DialogHeader>

          {loginResult && (
            <div className="space-y-3">
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/10 p-4 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Email
                  </span>
                  <span className="font-mono text-amber-900 dark:text-amber-300">
                    {loginResult.email}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Temporary Password
                  </span>
                  <span className="font-mono text-amber-900 dark:text-amber-300">
                    {loginResult.temporaryPassword}
                  </span>
                </div>
              </div>
              <Button variant="outline" className="w-full" onClick={() => void copyCredentials()}>
                <Copy className="h-3.5 w-3.5" />
                Copy credentials
              </Button>
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setLoginDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
