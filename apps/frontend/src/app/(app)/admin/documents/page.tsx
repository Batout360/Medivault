'use client';

import * as React from 'react';
import {
  Upload,
  Search,
  Filter,
  FileText,
  Eye,
  Download,
  Archive,
  ArchiveRestore,
  Pencil,
  History,
  X,
  ChevronLeft,
  ChevronRight,
  User,
  CalendarDays,
  Clock,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogDescription,
  DialogTitle,
  ConfirmModal,
} from '@/components/ui/modal';
import { SkeletonTable } from '@/components/ui/skeleton';
import { apiClient, isApiError, normalizeError } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/stores/auth.store';

// ─── Constants ────────────────────────────────────────────────────────────────
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

const LIMIT = 20;

// ─── Types ────────────────────────────────────────────────────────────────────
interface FacilityDocument {
  _id: string;
  id?: string;
  patientId: string;
  originalName: string;
  category: string | null;
  description: string | null;
  sourceHospital: string | null;
  mimeType: string;
  sizeBytes: number;
  uploadedById: string;
  uploadedByName?: string | null;
  uploadedByRole?: string | null;
  createdAt: string;
  documentTitle?: string | null;
  documentDate?: string | null;
  facilityId?: string | null;
  notes?: string | null;
  archivedAt?: string | null;
  archivedById?: string | null;
  patientName?: string | null;
  patientMrn?: string | null;
  patientProfileId?: string | null;
}

interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface UploaderOption {
  id: string;
  name: string;
  role: string;
}

interface HistoryEntry {
  id: string;
  eventType: string;
  action: string | null;
  result: string;
  timestamp: string;
  userId: string | null;
  userName: string;
  userRole: string | null;
  ipAddress: string | null;
  metadata: Record<string, unknown> | null;
}

interface PatientHit {
  _id: string;
  mrn: string;
  profileId: string | null;
  firstName: string;
  lastName: string;
}

// ─── Formatters ───────────────────────────────────────────────────────────────
function formatDocumentType(type: string) {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function shortId(value: string | null | undefined) {
  return value ? `${value.slice(0, 8)}…` : '—';
}

function docTitle(doc: FacilityDocument) {
  return doc.documentTitle?.trim() || doc.originalName;
}

function isArchived(doc: FacilityDocument) {
  return Boolean(doc.archivedAt);
}

// ─── Result badge for history ─────────────────────────────────────────────────
function ResultBadge({ result }: { result: string }) {
  const key = result?.toUpperCase();
  const variants = {
    SUCCESS: 'success' as const,
    FAILURE: 'destructive' as const,
    DENIED: 'warning' as const,
  };
  return (
    <Badge variant={variants[key as keyof typeof variants] ?? 'gray'}>
      {key ?? 'SUCCESS'}
    </Badge>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AdminDocumentsPage() {
  const queryClient = useQueryClient();
  // Prefill the upload source with the uploading admin's workplace.
  const currentHospital = useAuthStore((s) => s.user?.hospital ?? '');

  // ── Filters ────────────────────────────────────────────────────────────────
  const [patientSearch, setPatientSearch] = React.useState('');
  const [docSearch, setDocSearch] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState('');
  const [doctorFilter, setDoctorFilter] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<'active' | 'archived' | 'all'>(
    'active',
  );
  const [fromDate, setFromDate] = React.useState('');
  const [toDate, setToDate] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [showFilters, setShowFilters] = React.useState(false);

  const debouncedPatient = useDebounce(patientSearch.trim(), 500);
  const debouncedDocSearch = useDebounce(docSearch.trim(), 500);

  React.useEffect(() => {
    setPage(1);
  }, [
    debouncedPatient,
    debouncedDocSearch,
    typeFilter,
    doctorFilter,
    statusFilter,
    fromDate,
    toDate,
  ]);

  // Upload modal state
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [selectedPatient, setSelectedPatient] = React.useState<PatientHit | null>(null);
  const [pickerSearch, setPickerSearch] = React.useState('');
  const [file, setFile] = React.useState<File | null>(null);
  const [uploadType, setUploadType] = React.useState<string>('OTHER');
  const [uploadTitle, setUploadTitle] = React.useState('');
  const [uploadDate, setUploadDate] = React.useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [uploadDescription, setUploadDescription] = React.useState('');
  const [uploadSource, setUploadSource] = React.useState(currentHospital);
  const [uploadNotes, setUploadNotes] = React.useState('');

  // Edit modal state
  const [editingDoc, setEditingDoc] = React.useState<FacilityDocument | null>(null);
  const [editType, setEditType] = React.useState('OTHER');
  const [editTitle, setEditTitle] = React.useState('');
  const [editDate, setEditDate] = React.useState('');
  const [editDescription, setEditDescription] = React.useState('');
  const [editSource, setEditSource] = React.useState('');
  const [editNotes, setEditNotes] = React.useState('');

  // History modal + archive target
  const [historyDoc, setHistoryDoc] = React.useState<FacilityDocument | null>(null);
  const [archiveTarget, setArchiveTarget] = React.useState<FacilityDocument | null>(null);

  const invalidateList = () =>
    queryClient.invalidateQueries({ queryKey: ['facility-documents'] });

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data, isLoading, isError } = useQuery<PaginatedResult<FacilityDocument>>({
    queryKey: [
      'facility-documents',
      debouncedPatient,
      debouncedDocSearch,
      typeFilter,
      doctorFilter,
      statusFilter,
      fromDate,
      toDate,
      page,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (debouncedPatient) params.set('patient', debouncedPatient);
      if (debouncedDocSearch) params.set('q', debouncedDocSearch);
      if (typeFilter) params.set('type', typeFilter);
      if (doctorFilter) params.set('uploadedBy', doctorFilter);
      if (statusFilter !== 'active') params.set('status', statusFilter);
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      const res = await apiClient.get<PaginatedResult<FacilityDocument>>(
        `/facility/documents?${params.toString()}`,
      );
      return res.data;
    },
    staleTime: 30_000,
  });

  const { data: uploaders } = useQuery<UploaderOption[]>({
    queryKey: ['facility-documents', 'uploaders'],
    queryFn: async () => {
      const res = await apiClient.get<UploaderOption[]>('/facility/documents/uploaders');
      return res.data;
    },
    staleTime: 60_000,
  });

  // ── Patient picker (upload modal) ──────────────────────────────────────────
  const debouncedPicker = useDebounce(pickerSearch.trim(), 400);
  const { data: patientHits } = useQuery<PatientHit[]>({
    queryKey: ['facility-documents', 'patient-search', debouncedPicker],
    queryFn: async () => {
      const res = await apiClient.get<PatientHit[]>(
        `/patients/search?q=${encodeURIComponent(debouncedPicker)}`,
      );
      return res.data;
    },
    enabled: debouncedPicker.length >= 3,
    staleTime: 30_000,
  });

  // ── Signed URL + View/Download (mirrors the patient documents tab) ─────────
  const getSignedUrl = async (doc: FacilityDocument, mode?: 'inline' | 'attachment') => {
    const id = doc._id ?? doc.id;
    if (!id) return null;
    const res = await apiClient.get<{ url: string }>(
      `/patients/${doc.patientId}/documents/${id}/download-url${mode ? `?mode=${mode}` : ''}`,
    );
    return res.data.url;
  };

  const handleView = async (doc: FacilityDocument) => {
    try {
      const url = await getSignedUrl(doc, 'inline');
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error('Could not open the file. Try again.');
    }
  };

  const handleDownload = async (doc: FacilityDocument) => {
    try {
      const url = await getSignedUrl(doc, 'attachment');
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error('Could not generate the download link. Try again.');
    }
  };

  // ── Upload ──────────────────────────────────────────────────────────────────
  const resetUploadForm = () => {
    setSelectedPatient(null);
    setPickerSearch('');
    setFile(null);
    setUploadType('OTHER');
    setUploadTitle('');
    setUploadDate(new Date().toISOString().slice(0, 10));
    setUploadDescription('');
    setUploadSource('');
    setUploadNotes('');
  };

  const openUpload = () => {
    resetUploadForm();
    setUploadOpen(true);
  };

  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      if (!selectedPatient) throw new Error('Select a patient first.');
      const res = await apiClient.post<FacilityDocument>(
        `/patients/${selectedPatient._id}/documents`,
        formData,
      );
      return res.data;
    },
    onSuccess: async () => {
      await invalidateList();
      setUploadOpen(false);
      resetUploadForm();
      toast.success('Document uploaded successfully.');
    },
    onError: (err) => {
      const apiErr = normalizeError(err);
      console.error('Document upload failed:', apiErr, err);
      toast.error(`Upload failed (HTTP ${apiErr.statusCode}): ${apiErr.message}`);
    },
  });

  const handleUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      toast.error('Choose a file to upload.');
      return;
    }
    if (!selectedPatient) {
      toast.error('Select a patient to attach the document to.');
      return;
    }
    const formData = new FormData();
    formData.append('file', file);
    formData.append('documentType', uploadType);
    if (uploadTitle.trim()) formData.append('title', uploadTitle.trim());
    if (uploadDate) formData.append('documentDate', uploadDate);
    if (uploadDescription.trim()) formData.append('description', uploadDescription.trim());
    if (uploadSource.trim()) formData.append('sourceHospital', uploadSource.trim());
    if (uploadNotes.trim()) formData.append('notes', uploadNotes.trim());
    uploadMutation.mutate(formData);
  };

  // ── Edit metadata ───────────────────────────────────────────────────────────
  const openEdit = (doc: FacilityDocument) => {
    setEditingDoc(doc);
    setEditType(doc.category ?? 'OTHER');
    setEditTitle(doc.documentTitle ?? '');
    setEditDate((doc.documentDate ?? '').slice(0, 10));
    setEditDescription(doc.description ?? '');
    setEditSource(doc.sourceHospital ?? '');
    setEditNotes(doc.notes ?? '');
  };

  const editMutation = useMutation({
    mutationFn: async (doc: FacilityDocument) => {
      const id = doc._id ?? doc.id;
      if (!id) throw new Error('Missing document id.');
      const res = await apiClient.patch<FacilityDocument>(
        `/patients/${doc.patientId}/documents/${id}`,
        {
          documentType: editType,
          title: editTitle.trim(),
          documentDate: editDate || undefined,
          description: editDescription.trim(),
          sourceHospital: editSource.trim(),
          notes: editNotes.trim(),
        },
      );
      return res.data;
    },
    onSuccess: async () => {
      await invalidateList();
      setEditingDoc(null);
      toast.success('Document details updated.');
    },
    onError: (err) => {
      toast.error(isApiError(err) ? err.message : 'Could not update the document.');
    },
  });

  // ── Archive / restore ───────────────────────────────────────────────────────
  const archiveMutation = useMutation({
    mutationFn: async (doc: FacilityDocument) => {
      const id = doc._id ?? doc.id;
      if (!id) throw new Error('Missing document id.');
      const res = await apiClient.post<FacilityDocument>(
        `/patients/${doc.patientId}/documents/${id}/archive`,
        { archived: !isArchived(doc) },
      );
      return res.data;
    },
    onSuccess: async (_data, doc) => {
      await invalidateList();
      setArchiveTarget(null);
      toast.success(isArchived(doc) ? 'Document restored from archive.' : 'Document archived.');
    },
    onError: (err) => {
      toast.error(isApiError(err) ? err.message : 'Could not update archive status.');
    },
  });

  // ── History ─────────────────────────────────────────────────────────────────
  const { data: history, isLoading: historyLoading } = useQuery<HistoryEntry[]>({
    queryKey: [
      'facility-documents',
      'history',
      historyDoc?.patientId,
      historyDoc?._id,
    ],
    queryFn: async () => {
      if (!historyDoc) return [];
      const id = historyDoc._id ?? historyDoc.id;
      const res = await apiClient.get<HistoryEntry[]>(
        `/patients/${historyDoc.patientId}/documents/${id}/history`,
      );
      return res.data;
    },
    enabled: !!historyDoc,
    staleTime: 15_000,
  });

  // ── Filters UI helpers ──────────────────────────────────────────────────────
  const hasFilters = Boolean(
    debouncedPatient || debouncedDocSearch || typeFilter || doctorFilter ||
      statusFilter !== 'active' || fromDate || toDate,
  );

  const clearFilters = () => {
    setPatientSearch('');
    setDocSearch('');
    setTypeFilter('');
    setDoctorFilter('');
    setStatusFilter('active');
    setFromDate('');
    setToDate('');
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Medical Documents
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage medical documents for patients in your facility.
          </p>
        </div>
        <Button size="sm" onClick={openUpload}>
          <Upload className="h-4 w-4" />
          Upload Document
        </Button>
      </div>

      {/* Search + filters */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                type="search"
                value={patientSearch}
                onChange={(e) => setPatientSearch(e.target.value)}
                placeholder="Search patient by name, MRN or profile ID…"
                className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                type="search"
                value={docSearch}
                onChange={(e) => setDocSearch(e.target.value)}
                placeholder="Search document name, description, notes…"
                className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="w-44">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Document type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All types</SelectItem>
                  {DOCUMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {formatDocumentType(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-48">
              <Select value={doctorFilter} onValueChange={setDoctorFilter}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Uploaded by (filter)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All uploaders</SelectItem>
                  {(uploaders ?? []).map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-36">
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as 'active' | 'archived' | 'all')}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                aria-label="From date"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                aria-label="To date"
              />
            </div>
            <Button
              variant={showFilters ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="h-4 w-4" />
              Filters
            </Button>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
                Clear
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Documents table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4">
              <SkeletonTable rows={8} cols={8} />
            </div>
          ) : isError ? (
            <div className="p-8 text-center text-sm text-destructive">
              Failed to load documents.
            </div>
          ) : !data?.data?.length ? (
            <div className="p-12 text-center space-y-2">
              <FileText className="mx-auto h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                No documents match your criteria.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/20">
                      <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Patient
                      </th>
                      <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">
                        Medical ID
                      </th>
                      <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Document
                      </th>
                      <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden lg:table-cell">
                        Type
                      </th>
                      <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden xl:table-cell">
                        Uploaded by
                      </th>
                      <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden xl:table-cell">
                        Facility
                      </th>
                      <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">
                        Upload date
                      </th>
                      <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Status
                      </th>
                      <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.data.map((doc) => (
                      <tr key={doc._id ?? doc.id} className="hover:bg-accent/30 transition-colors">
                        <td className="py-3 px-4">
                          <p className="font-medium text-xs">{doc.patientName ?? '—'}</p>
                        </td>
                        <td className="py-3 px-4 hidden md:table-cell">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-mono text-muted-foreground">
                              {doc.patientMrn ?? '—'}
                            </span>
                            {doc.patientProfileId && (
                              <span className="text-[10px] text-muted-foreground/70">
                                {doc.patientProfileId}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <p className="text-xs font-medium truncate max-w-[220px]" title={doc.originalName}>
                            {docTitle(doc)}
                          </p>
                          <p className="text-xs text-muted-foreground truncate max-w-[220px]">
                            {doc.originalName} · {formatFileSize(doc.sizeBytes)}
                          </p>
                        </td>
                        <td className="py-3 px-4 hidden lg:table-cell">
                          <Badge variant="gray">
                            {formatDocumentType(doc.category ?? 'OTHER')}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 hidden xl:table-cell">
                          <p className="text-xs">{doc.uploadedByName ?? '—'}</p>
                          {doc.uploadedByRole && (
                            <p className="text-xs text-muted-foreground capitalize">
                              {doc.uploadedByRole.toLowerCase().replace('_', ' ')}
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-4 hidden xl:table-cell">
                          <span
                            className="text-xs font-mono text-muted-foreground"
                            title={doc.facilityId ?? undefined}
                          >
                            {shortId(doc.facilityId)}
                          </span>
                          {doc.sourceHospital && (
                            <p className="text-[10px] text-muted-foreground/70 truncate max-w-[140px]">
                              {doc.sourceHospital}
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-4 hidden md:table-cell">
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDate(doc.createdAt)}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {isArchived(doc) ? (
                            <Badge variant="warning" dot>
                              Archived
                            </Badge>
                          ) : (
                            <Badge variant="success" dot>
                              Active
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => void handleView(doc)}
                              title="View document"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              View
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => void handleDownload(doc)}
                              title="Download document"
                            >
                              <Download className="h-3.5 w-3.5" />
                              Download
                            </Button>
                            <button
                              onClick={() => openEdit(doc)}
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                              title="Edit details / categorize"
                              aria-label="Edit details"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setHistoryDoc(doc)}
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                              title="View history"
                              aria-label="View history"
                            >
                              <History className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setArchiveTarget(doc)}
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                              title={isArchived(doc) ? 'Restore from archive' : 'Archive'}
                              aria-label={isArchived(doc) ? 'Restore from archive' : 'Archive'}
                            >
                              {isArchived(doc) ? (
                                <ArchiveRestore className="h-3.5 w-3.5" />
                              ) : (
                                <Archive className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {data.totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                  <p className="text-xs text-muted-foreground">
                    {data.total.toLocaleString()} total document
                    {data.total === 1 ? '' : 's'}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      aria-label="Previous page"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {page} / {data.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                      disabled={page === data.totalPages}
                      aria-label="Next page"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ─── Upload modal (with patient picker) ─────────────────────────────── */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Upload Medical Document</DialogTitle>
            <DialogDescription>
              Attach a clinical document to a patient&apos;s record in your facility.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleUpload} className="px-6 space-y-4">
            {/* Patient picker */}
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Patient <span className="text-destructive">*</span>
              </label>
              {selectedPatient ? (
                <div className="mt-1 flex items-center justify-between rounded-md border border-primary/40 bg-primary/5 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">
                      {selectedPatient.firstName} {selectedPatient.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      MRN {selectedPatient.mrn}
                      {selectedPatient.profileId ? ` · ${selectedPatient.profileId}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedPatient(null)}
                    className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent"
                    aria-label="Change patient"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="mt-1 space-y-1.5">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <input
                      type="search"
                      value={pickerSearch}
                      onChange={(e) => setPickerSearch(e.target.value)}
                      placeholder="Search patients by name, MRN or profile ID (min 3 chars)…"
                      className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    />
                  </div>
                  {debouncedPicker.length >= 3 && (
                    <div className="max-h-44 overflow-y-auto rounded-md border border-border divide-y divide-border">
                      {(patientHits ?? []).length === 0 ? (
                        <p className="px-3 py-2 text-xs text-muted-foreground">
                          No patients found in your facility.
                        </p>
                      ) : (
                        (patientHits ?? []).map((p) => (
                          <button
                            key={p._id}
                            type="button"
                            onClick={() => {
                              setSelectedPatient(p);
                              setPickerSearch('');
                            }}
                            className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-accent/40 transition-colors"
                          >
                            <span className="text-xs font-medium">
                              {p.firstName} {p.lastName}
                            </span>
                            <span className="text-xs font-mono text-muted-foreground">
                              {p.mrn}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* File + fields */}
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
                  value={uploadType}
                  onChange={(e) => setUploadType(e.target.value)}
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
                <label className="text-xs font-medium text-muted-foreground">Document date</label>
                <input
                  type="date"
                  value={uploadDate}
                  onChange={(e) => setUploadDate(e.target.value)}
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">Title</label>
                <input
                  type="text"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  placeholder="e.g. Chest X-Ray — June 2026"
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">Description</label>
                <textarea
                  value={uploadDescription}
                  onChange={(e) => setUploadDescription(e.target.value)}
                  rows={2}
                  placeholder="What does this document contain?"
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Source hospital / facility
                </label>
                <input
                  type="text"
                  value={uploadSource}
                  onChange={(e) => setUploadSource(e.target.value)}
                  placeholder="Originating facility name"
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Notes</label>
                <input
                  type="text"
                  value={uploadNotes}
                  onChange={(e) => setUploadNotes(e.target.value)}
                  placeholder="Optional clinical notes"
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={() => setUploadOpen(false)}
                disabled={uploadMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={uploadMutation.isPending}>
                <Upload className="h-4 w-4" />
                {uploadMutation.isPending ? 'Uploading…' : 'Upload Document'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── Edit metadata modal ─────────────────────────────────────────────── */}
      <Dialog open={!!editingDoc} onOpenChange={(o) => !o && setEditingDoc(null)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Edit Document</DialogTitle>
            <DialogDescription>
              Update the category and description of
              {editingDoc ? ` “${docTitle(editingDoc)}”` : ' the document'}.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (editingDoc) editMutation.mutate(editingDoc);
            }}
            className="px-6 space-y-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Document type</label>
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value)}
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
                <label className="text-xs font-medium text-muted-foreground">Document date</label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">Title</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">Description</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Source hospital / facility
                </label>
                <input
                  type="text"
                  value={editSource}
                  onChange={(e) => setEditSource(e.target.value)}
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Notes</label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingDoc(null)}
                disabled={editMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={editMutation.isPending}>
                <Pencil className="h-4 w-4" />
                {editMutation.isPending ? 'Saving…' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── History modal ───────────────────────────────────────────────────── */}
      <Dialog open={!!historyDoc} onOpenChange={(o) => !o && setHistoryDoc(null)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Document History</DialogTitle>
            <DialogDescription>
              {historyDoc ? docTitle(historyDoc) : ''} — audit trail of every action on this
              document.
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 pb-6">
            {historyLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
                <Clock className="h-4 w-4 animate-pulse" />
                Loading history…
              </div>
            ) : !history?.length ? (
              <p className="py-6 text-sm text-muted-foreground">
                No recorded activity for this document yet.
              </p>
            ) : (
              <ol className="space-y-0">
                {history.map((entry, idx) => (
                  <li key={entry.id} className="relative flex gap-3 pb-4">
                    {idx < history.length - 1 && (
                      <span
                        className="absolute left-[7px] top-5 bottom-0 w-px bg-border"
                        aria-hidden="true"
                      />
                    )}
                    <span className="relative mt-1.5 flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center">
                      <span
                        className={cn(
                          'h-3.5 w-3.5 rounded-full border-2',
                          entry.result === 'SUCCESS'
                            ? 'border-primary bg-primary/20'
                            : entry.result === 'DENIED'
                              ? 'border-amber-500 bg-amber-100 dark:bg-amber-900/30'
                              : 'border-destructive bg-destructive/20',
                        )}
                      />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="text-xs font-medium">
                          {entry.action ?? entry.eventType}
                        </p>
                        <ResultBadge result={entry.result} />
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(entry.timestamp).toLocaleString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {entry.userName}
                        {entry.userRole ? ` · ${entry.userRole.toLowerCase().replace('_', ' ')}` : ''}
                        {entry.ipAddress ? ` · ${entry.ipAddress}` : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Archive confirmation ────────────────────────────────────────────── */}
      <ConfirmModal
        open={!!archiveTarget}
        onOpenChange={(o) => !o && setArchiveTarget(null)}
        title={archiveTarget && isArchived(archiveTarget) ? 'Restore document?' : 'Archive document?'}
        description={
          archiveTarget
            ? isArchived(archiveTarget)
              ? `Restore “${docTitle(archiveTarget)}” to the active document list?`
              : `Archive “${docTitle(archiveTarget)}”? It will be hidden from the active list but retained for compliance records.`
            : ''
        }
        confirmLabel={archiveTarget && isArchived(archiveTarget) ? 'Restore' : 'Archive'}
        loading={archiveMutation.isPending}
        onConfirm={() => {
          if (archiveTarget) archiveMutation.mutate(archiveTarget);
        }}
      />
    </div>
  );
}