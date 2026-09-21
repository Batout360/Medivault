/**
 * React Query hooks for all Medivault API resources.
 *
 * Each hook wraps a React Query useQuery or useMutation call,
 * providing typed responses, consistent query keys, and default options.
 *
 * Query keys use arrays so React Query can correctly invalidate
 * related queries when mutations succeed.
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

// ─── Query key factory ────────────────────────────────────────────────────────
// Centralised query keys prevent typos and make bulk invalidation easy.
export const queryKeys = {
  // Patients
  patients: (params?: object) => ['patients', params] as const,
  patient: (id: string) => ['patient', id] as const,
  patientDiagnoses: (id: string) => ['patient', id, 'diagnoses'] as const,
  patientPrescriptions: (id: string) =>
    ['patient', id, 'prescriptions'] as const,
  patientVitals: (id: string) => ['patient', id, 'vitals'] as const,
  patientLabs: (id: string) => ['patient', id, 'labs'] as const,
  patientEncounters: (id: string) => ['patient', id, 'encounters'] as const,
  patientDocuments: (id: string) => ['patient', id, 'documents'] as const,
  patientNotes: (id: string) => ['patient', id, 'notes'] as const,

  // Medical profile card + QR
  medicalProfileCard: (id: string) => ['medical-profile', id] as const,
  medicalQrStatus: (id: string) =>
    ['medical-profile', id, 'qr-status'] as const,
  publicProfile: (token: string) => ['public-profile', token] as const,
  emergencyProfile: (token: string) => ['emergency-profile', token] as const,

  // Users
  users: (params?: object) => ['users', params] as const,
  user: (id: string) => ['user', id] as const,
  currentUser: () => ['auth', 'current-user'] as const,

  // Biometrics
  biometricStatus: (patientId: string) => ['biometric', patientId] as const,

  // Admin
  adminStats: () => ['admin', 'stats'] as const,
  auditLogs: (params?: object) => ['audit-logs', params] as const,
  securityEvents: (params?: object) => ['security-events', params] as const,

  // Dashboard
  dashboardStats: () => ['dashboard', 'stats'] as const,
};

// ─── Shared response shapes ────────────────────────────────────────────────────
export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages?: number;
}

export interface PatientListItem {
  id: string;
  profileId?: string | null;
  mrn?: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  gender?: string;
  bloodGroup?: string | null;
  phoneNumber?: string;
  email?: string | null;
  isActive?: boolean;
}

export interface PatientSearchParams {
  q?: string;
  gender?: string;
  bloodGroup?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  order?: 'asc' | 'desc';
}

export interface DiagnosisRecord {
  id: string;
  patientId: string;
  diagnosisCode?: string;
  name: string;
  icdCode?: string;
  status?: string;
  severity?: string;
  recordedAt?: string;
}

export interface PrescriptionRecord {
  id: string;
  patientId: string;
  medicationName: string;
  dosage?: string;
  frequency?: string;
  route?: string;
  duration?: string;
  instructions?: string;
  prescribedAt?: string;
}

export interface VitalRecord {
  id: string;
  patientId: string;
  bloodPressureSystolic?: number;
  bloodPressureDiastolic?: number;
  heartRate?: number;
  temperature?: number;
  oxygenSaturation?: number;
  respiratoryRate?: number;
  weightKg?: number;
  recordedAt?: string;
}

export interface LabReportRecord {
  id: string;
  patientId: string;
  testName: string;
  result?: string;
  referenceRange?: string;
  resultStatus?: string;
  orderedBy?: string;
  collectedAt?: string;
  resultedAt?: string;
}

export interface EncounterRecord {
  _id: string;
  patientId: string;
  encounterId?: string | null;
  authorId?: string;
  organizationId?: string;
  facilityId?: string | null;
  data: {
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
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface PatientDocument {
  id: string;
  patientId: string;
  originalName: string;
  category?: string;
  sourceHospital?: string | null;
  sizeBytes: number;
  mimeType?: string;
  createdAt?: string;
  documentTitle?: string | null;
  documentDate?: string | null;
  facilityId?: string | null;
  notes?: string | null;
  uploadedById?: string;
  uploadedByName?: string | null;
  uploadedByRole?: string | null;
}

export interface MedicalProfileAllergy {
  id: string;
  allergen: string;
  allergyType?: string | null;
  severity?: string | null;
  reaction?: string | null;
}

export interface MedicalProfileCondition {
  id: string;
  conditionName: string;
  status: string;
  notes?: string | null;
}

export interface MedicalProfileEmergencyContact {
  id: string;
  name: string;
  relationship: string;
  phone: string;
  email?: string | null;
}

export interface MedicalProfileQr {
  status: 'ACTIVE' | 'REVOKED' | 'NOT_CREATED';
  scanCount: number;
  lastScannedAt: string | null;
  qrCreatedAt: string | null;
  qrRevokedAt: string | null;
  payloadUrl: string | null;
}

export interface VisibilitySettings {
  showName: boolean;
  showPhoto: boolean;
  showBloodType: boolean;
  showAllergies: boolean;
  showConditions: boolean;
  showEmergencyContact: boolean;
  showMedications: boolean;
}

export interface PublicProfileAllergy {
  allergen: string;
  severity: string | null;
  reaction: string | null;
  isCritical: boolean;
}

export interface PublicProfileCondition {
  conditionName: string;
}

export interface PublicEmergencyContact {
  name: string;
  relationship: string;
  phone: string;
}

export interface PublicProfileResult {
  valid: boolean;
  status: 'ACTIVE' | 'REVOKED' | 'INVALID';
  scannedAt: string | null;
  mvId: string | null;
  patientId: string | null;
  patient: {
    firstName: string | null;
    lastName: string | null;
    initials: string;
    gender: string;
    bloodGroup: string | null;
  } | null;
  allergies: PublicProfileAllergy[];
  criticalAllergies: PublicProfileAllergy[];
  conditions: PublicProfileCondition[];
  emergencyContact: PublicEmergencyContact | null;
  visibility: VisibilitySettings | null;
  qr: { scanCount: number; lastScannedAt: string | null } | null;
}

export interface EmergencyProfileResult {
  isEmergencyView: true;
  patient: {
    firstName: string;
    lastName: string;
    initials: string;
    bloodGroup: string | null;
    gender: string;
  };
  criticalAllergies: PublicProfileAllergy[];
  allergies: Array<{ allergen: string; severity: string | null }>;
  conditions: Array<{ conditionName: string }>;
  emergencyContact: PublicEmergencyContact | null;
}

export interface MedicalProfileCard {
  patient: {
    id: string;
    profileId: string | null;
    patientId: string | null;
    mrn: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    gender: string;
    bloodGroup: string | null;
    phoneNumber: string | null;
    email: string | null;
    city: string | null;
    state: string | null;
    pincode: string | null;
  };
  allergies: MedicalProfileAllergy[];
  conditions: MedicalProfileCondition[];
  emergencyContacts: MedicalProfileEmergencyContact[];
  qr: MedicalProfileQr;
  /** Patient-controlled fields that are shared on the public QR scan page. */
  visibility?: {
    showName?: boolean;
    showPhoto?: boolean;
    showBloodType?: boolean;
    showAllergies?: boolean;
    showConditions?: boolean;
    showEmergencyContact?: boolean;
    showMedications?: boolean;
  };
}

export interface UserListItem {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  organizationId?: string;
  facilityId?: string | null;
  isActive?: boolean;
  createdAt?: string;
}

export interface AuditLogRecord {
  id: string;
  eventType: string;
  userId?: string | null;
  organizationId?: string | null;
  resourceType?: string;
  resourceId?: string | null;
  action?: string;
  result?: string;
  createdAt?: string;
}

export interface DashboardStats {
  totalPatients: number;
  totalUsers: number;
  totalOrganizations?: number;
  admissionsToday?: number;
  appointmentsToday?: number;
}

// ─── Helper ────────────────────────────────────────────────────────────────────
function buildSearchParams(params: Record<string, unknown>): URLSearchParams {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') searchParams.set(k, String(v));
  });
  return searchParams;
}

// ─── Patients ─────────────────────────────────────────────────────────────────
export function usePatients(params: PatientSearchParams = {}) {
  return useQuery({
    queryKey: queryKeys.patients(params),
    queryFn: async () => {
      const res = await apiClient.get<Paginated<PatientListItem>>(
        `/patients?${buildSearchParams(params as Record<string, unknown>).toString()}`,
      );
      return res.data;
    },
    staleTime: 30_000,
  });
}

export function usePatient(id: string, options?: Partial<UseQueryOptions>) {
  return useQuery({
    queryKey: queryKeys.patient(id),
    queryFn: async () => {
      const res = await apiClient.get<PatientListItem>(`/patients/${id}`);
      return res.data;
    },
    enabled: !!id,
    staleTime: 60_000,
    ...(options as object),
  });
}

export function useCreatePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: object) => {
      const res = await apiClient.post<PatientListItem>('/patients', data);
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['patients'] });
    },
  });
}

export function useUpdatePatient(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: object) => {
      const res = await apiClient.patch<PatientListItem>(
        `/patients/${id}`,
        data,
      );
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.patient(id) });
      void qc.invalidateQueries({ queryKey: ['patients'] });
    },
  });
}

// ─── Medical Records ──────────────────────────────────────────────────────────
export function usePatientDiagnoses(patientId: string) {
  return useQuery({
    queryKey: queryKeys.patientDiagnoses(patientId),
    queryFn: async () => {
      const res = await apiClient.get<DiagnosisRecord[]>(
        `/patients/${patientId}/diagnoses`,
      );
      return res.data;
    },
    enabled: !!patientId,
    staleTime: 60_000,
  });
}

export function useCreateDiagnosis(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: object) => {
      const res = await apiClient.post<DiagnosisRecord>(
        `/patients/${patientId}/diagnoses`,
        data,
      );
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: queryKeys.patientDiagnoses(patientId),
      });
    },
  });
}

export function usePatientPrescriptions(patientId: string) {
  return useQuery({
    queryKey: queryKeys.patientPrescriptions(patientId),
    queryFn: async () => {
      const res = await apiClient.get<PrescriptionRecord[]>(
        `/patients/${patientId}/prescriptions`,
      );
      return res.data;
    },
    enabled: !!patientId,
    staleTime: 60_000,
  });
}

export function useCreatePrescription(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: object) => {
      const res = await apiClient.post<PrescriptionRecord>(
        `/patients/${patientId}/prescriptions`,
        data,
      );
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: queryKeys.patientPrescriptions(patientId),
      });
    },
  });
}

export function usePatientVitals(patientId: string) {
  return useQuery({
    queryKey: queryKeys.patientVitals(patientId),
    queryFn: async () => {
      const res = await apiClient.get<VitalRecord[]>(
        `/patients/${patientId}/vitals`,
      );
      return res.data;
    },
    enabled: !!patientId,
    staleTime: 60_000,
  });
}

export function useCreateVitals(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: object) => {
      const res = await apiClient.post<VitalRecord>(
        `/patients/${patientId}/vitals`,
        data,
      );
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: queryKeys.patientVitals(patientId),
      });
    },
  });
}

export function usePatientLabReports(patientId: string) {
  return useQuery({
    queryKey: queryKeys.patientLabs(patientId),
    queryFn: async () => {
      const res = await apiClient.get<LabReportRecord[]>(
        `/patients/${patientId}/lab-reports`,
      );
      return res.data;
    },
    enabled: !!patientId,
    staleTime: 60_000,
  });
}

export function useCreateLabReport(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: object) => {
      const res = await apiClient.post<LabReportRecord>(
        `/patients/${patientId}/lab-reports`,
        data,
      );
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.patientLabs(patientId) });
    },
  });
}

export function usePatientEncounters(patientId: string) {
  return useQuery({
    queryKey: queryKeys.patientEncounters(patientId),
    queryFn: async () => {
      const res = await apiClient.get<Paginated<EncounterRecord>>(
        `/patients/${patientId}/encounters?limit=100`,
      );
      return res.data;
    },
    enabled: !!patientId,
    staleTime: 60_000,
  });
}

export function usePatientDocuments(patientId: string) {
  return useQuery({
    queryKey: queryKeys.patientDocuments(patientId),
    queryFn: async () => {
      const res = await apiClient.get<PatientDocument[]>(
        `/patients/${patientId}/documents`,
      );
      return res.data;
    },
    enabled: !!patientId,
    staleTime: 120_000,
  });
}

// ─── Biometrics ───────────────────────────────────────────────────────────────
export interface IdentifyFingerprintPayload {
  templatePayload: string;
  format: string;
  quality: number;
  deviceId: string;
  capturedAt: string;
  bridgeSignature?: string;
}

export function useIdentifyFingerprint() {
  return useMutation({
    mutationFn: async (data: IdentifyFingerprintPayload) => {
      const res = await apiClient.post<{
        matched: boolean;
        patientId?: string;
        confidence?: number;
        message?: string;
      }>('/biometrics/identify', data);
      return res.data;
    },
  });
}

export interface EnrollFingerprintPayload {
  patientId: string;
  templateType: string;
  templatePayload: string;
  format: string;
  quality: number;
  deviceId: string;
  capturedAt: string;
  bridgeSignature?: string;
}

export function useEnrollFingerprint(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      templatePayload: string;
      format: string;
      quality: number;
      deviceId: string;
      capturedAt: string;
      bridgeSignature?: string;
    }) => {
      const res = await apiClient.post<{ success: boolean; message: string }>(
        '/biometrics/enroll',
        {
          ...data,
          patientId,
          templateType: 'FINGERPRINT',
        },
      );
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.patient(patientId) });
      void qc.invalidateQueries({
        queryKey: queryKeys.biometricStatus(patientId),
      });
    },
  });
}

export function useListFingerprintTemplates(patientId: string) {
  return useQuery({
    queryKey: queryKeys.biometricStatus(patientId),
    queryFn: async () => {
      const res = await apiClient.get<
        Array<{
          _id: string;
          templateVersion: string;
          enrolledById: string;
          deviceId: string | null;
          isActive: boolean;
          createdAt: string;
          updatedAt: string;
        }>
      >(`/biometrics/templates/patient/${patientId}`);
      return res.data;
    },
    enabled: !!patientId,
  });
}

export function useRevokeFingerprint(templateId: string, patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.delete<{ message: string }>(
        `/biometrics/templates/${templateId}`,
      );
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.patient(patientId) });
      void qc.invalidateQueries({
        queryKey: queryKeys.biometricStatus(patientId),
      });
    },
  });
}

// ─── Users ─────────────────────────────────────────────────────────────────────
export function useUsers(params: object = {}) {
  return useQuery({
    queryKey: queryKeys.users(params),
    queryFn: async () => {
      const res = await apiClient.get<Paginated<UserListItem>>(
        `/users?${buildSearchParams(params as Record<string, unknown>).toString()}`,
      );
      return res.data;
    },
    staleTime: 60_000,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: object) => {
      const res = await apiClient.post<UserListItem>('/users', data);
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useUpdateUser(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: object) => {
      const res = await apiClient.patch<UserListItem>(`/users/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.user(id) });
      void qc.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

// ─── Audit Logs ───────────────────────────────────────────────────────────────
export function useAuditLogs(params: object = {}) {
  return useQuery({
    queryKey: queryKeys.auditLogs(params),
    queryFn: async () => {
      const res = await apiClient.get<Paginated<AuditLogRecord>>(
        `/audit-logs?${buildSearchParams(params as Record<string, unknown>).toString()}`,
      );
      return res.data;
    },
    staleTime: 15_000,
  });
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export function useDashboardStats() {
  return useQuery({
    queryKey: queryKeys.dashboardStats(),
    queryFn: async () => {
      const res = await apiClient.get<DashboardStats>('/dashboard/stats');
      return res.data;
    },
    staleTime: 60_000,
  });
}

// ─── Documents ────────────────────────────────────────────────────────────────
export function useUploadDocument(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await apiClient.post<PatientDocument>(
        `/patients/${patientId}/documents`,
        formData,
      );
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: queryKeys.patientDocuments(patientId),
      });
    },
  });
}

export function useGetDocumentDownloadUrl(
  patientId: string,
  documentId: string,
) {
  return useQuery({
    queryKey: ['document-url', patientId, documentId],
    queryFn: async () => {
      const res = await apiClient.get<{
        url: string;
        expiresInSeconds: number;
      }>(`/patients/${patientId}/documents/${documentId}/download-url`);
      return res.data;
    },
    enabled: false, // Only fetch on demand
    staleTime: 0, // URLs are short-lived
    gcTime: 0,
  });
}

// ─── Medical Profile Card + QR ─────────────────────────────────────────────────
export function useMedicalProfileCard(patientId: string) {
  return useQuery({
    queryKey: queryKeys.medicalProfileCard(patientId),
    queryFn: async () => {
      const res = await apiClient.get<MedicalProfileCard>(
        `/medical-profile/patients/${patientId}`,
      );
      return res.data;
    },
    enabled: !!patientId,
    staleTime: 60_000,
  });
}

export interface GenerateQrResult {
  patientId: string;
  status: 'ACTIVE';
  regenerated: boolean;
  payloadUrl: string;
  qrDataUrl: string;
}

export function useGenerateMedicalQr(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload?: { baseUrl?: string }) => {
      const res = await apiClient.post<GenerateQrResult>(
        `/medical-profile/patients/${patientId}/qr`,
        payload?.baseUrl ? { baseUrl: payload.baseUrl } : {},
      );
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: queryKeys.medicalProfileCard(patientId),
      });
      void qc.invalidateQueries({ queryKey: ['patient', patientId] });
    },
  });
}

export function useRevokeMedicalQr(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<{ message: string; status: 'REVOKED' }>(
        `/medical-profile/patients/${patientId}/qr/revoke`,
      );
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: queryKeys.medicalProfileCard(patientId),
      });
    },
  });
}

export function useMedicalQrStatus(patientId: string) {
  return useQuery({
    queryKey: queryKeys.medicalQrStatus(patientId),
    queryFn: async () => {
      const res = await apiClient.get<MedicalProfileQr>(
        `/medical-profile/patients/${patientId}/qr/status`,
      );
      return res.data;
    },
    enabled: !!patientId,
    staleTime: 30_000,
  });
}

// ─── Public Profile (unauthenticated QR scan) ──────────────────────────────────
export function usePublicProfile(token: string) {
  return useQuery({
    queryKey: queryKeys.publicProfile(token),
    queryFn: async () => {
      const res = await apiClient.get<PublicProfileResult>(
        `/medical-profile/public/${token}`,
      );
      return res.data;
    },
    enabled: !!token,
    retry: false,
    staleTime: 30_000,
  });
}

export function useUpdateVisibility(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<VisibilitySettings>) => {
      const res = await apiClient.patch<{ message: string }>(
        `/medical-profile/patients/${patientId}/visibility`,
        data,
      );
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: queryKeys.medicalProfileCard(patientId),
      });
    },
  });
}
