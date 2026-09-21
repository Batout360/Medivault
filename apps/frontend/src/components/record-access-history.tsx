'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ClipboardList,
  Download,
  Edit,
  Eye,
  FileText,
  Fingerprint,
  LogIn,
  LogOut,
  QrCode,
  ShieldCheck,
  User,
  ArchiveRestore,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SkeletonCard } from '@/components/ui/skeleton';
import { apiClient } from '@/lib/api/client';
import { cn, formatDate } from '@/lib/utils';

export interface RecordAccessEntry {
  id: string;
  eventType: string | null;
  action: string | null;
  userId: string | null;
  userEmail: string | null;
  user: string | null;
  userRole: string | null;
  resourceType: string | null;
  result: string;
  createdAt: string;
  timestamp?: string;
  ipAddress: string | null;
  type: string;
}

// ─── Friendly label + icon per event type ──────────────────────────────────────
const eventMeta: Record<string, { label: string; icon: React.ElementType }> = {
  LOGIN: { label: 'Signed in to the portal', icon: LogIn },
  LOGOUT: { label: 'Signed out of the portal', icon: LogOut },
  MEDICAL_CARD_QR_GENERATE: { label: 'Medical card QR generated', icon: QrCode },
  MEDICAL_CARD_QR_REGENERATE: { label: 'Medical card QR regenerated', icon: QrCode },
  MEDICAL_CARD_QR_REVOKE: { label: 'Medical card QR revoked', icon: QrCode },
  MEDICAL_CARD_QR_STATUS: { label: 'Medical card QR status checked', icon: QrCode },
  MEDICAL_CARD_QR_SCAN: { label: 'Medical card QR scanned', icon: QrCode },
  MEDICAL_CARD_VIEW: { label: 'Medical profile card viewed', icon: QrCode },
  MEDICAL_CARD_VERIFY_VIEW: { label: 'Medical card verified after scan', icon: QrCode },
  DOCUMENT_UPLOAD: { label: 'Medical document uploaded', icon: FileText },
  DOCUMENT_UPDATE: { label: 'Document details updated', icon: Edit },
  DOCUMENT_ARCHIVE: { label: 'Document archived', icon: ArchiveRestore },
  DOCUMENT_DOWNLOAD: { label: 'Document downloaded', icon: Download },
  DOCUMENT_VIEW: { label: 'Document viewed', icon: Eye },
  PATIENT_VIEW: { label: 'Patient record viewed', icon: Eye },
  PATIENT_UPDATE: { label: 'Patient record updated', icon: Edit },
  PATIENT_CREATE: { label: 'Patient record created', icon: User },
  BIOMETRIC_ENROLL: { label: 'Biometric template enrolled', icon: Fingerprint },
  BIOMETRIC_IDENTIFY: { label: 'Fingerprint identification', icon: Fingerprint },
  RECORD_CREATE: { label: 'Medical record added', icon: FileText },
  RECORD_VIEW: { label: 'Medical record viewed', icon: Eye },
  PERMISSION_CHANGE: { label: 'Access permissions changed', icon: ShieldCheck },
};

function metaFor(eventType: string | null): { label: string; icon: React.ElementType } {
  if (!eventType) return { label: 'System activity', icon: Activity };
  const hit = eventMeta[eventType];
  if (hit) return hit;
  return {
    label: eventType.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
    icon: ClipboardList,
  };
}

function ResultBadge({ result }: { result: string }) {
  const variants: Record<string, 'success' | 'destructive' | 'warning' | 'gray'> = {
    SUCCESS: 'success',
    FAILURE: 'destructive',
    DENIED: 'warning',
  };
  const variant = variants[result] ?? 'gray';
  return (
    <Badge variant={variant} className="justify-self-end sm:justify-self-auto">
      {result === 'SUCCESS' ? 'ACCESS' : result === 'FAILURE' ? 'BLOCKED' : result}
    </Badge>
  );
}

// ─── Record access history (patient-facing) ───────────────────────────────────
export function RecordAccessHistory({ patientId }: { patientId?: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['audit-logs', 'patient', patientId],
    queryFn: async () => {
      const res = await apiClient.get<RecordAccessEntry[]>(`/audit-logs/patient/${patientId}`);
      return res.data;
    },
    enabled: !!patientId,
    staleTime: 60_000,
  });

  if (!patientId) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
          Record Access History
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            Who has accessed your records
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        )}

        {isError && !isLoading && (
          <p className="text-sm text-muted-foreground">
            Access history could not be loaded right now.
          </p>
        )}

        {!isLoading && !isError && (!data || data.length === 0) && (
          <p className="text-sm text-muted-foreground italic">
            No record accesses yet. When care team members view or download your records,
            the activity appears here.
          </p>
        )}

        {!isLoading && !isError && data && data.length > 0 && (
          <ul className="space-y-2">
            {data.slice(0, 8).map((entry) => {
              const meta = metaFor(entry.eventType);
              const Icon = meta.icon;
              return (
                <li
                  key={entry.id}
                  className="flex items-start gap-3 rounded-lg border border-border p-3"
                >
                  <div className="rounded-md bg-muted p-2 flex-shrink-0">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <p className="text-sm font-medium">{meta.label}</p>
                      <ResultBadge result={entry.result} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      by <span className="font-medium text-foreground">{entry.user ?? 'System'}</span>
                      {entry.userRole && (
                        <span className="capitalize">
                          {' '}
                          ({entry.userRole.toLowerCase().replace('_', ' ')})
                        </span>
                      )}
                      {entry.eventType ? ` · ${entry.eventType}` : ''}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                      <time dateTime={entry.createdAt ?? entry.timestamp}>
                        {formatDate(
                          entry.createdAt ?? entry.timestamp,
                          'relative',
                        )}{' '}
                        ·{' '}
                        {formatDate(entry.createdAt ?? entry.timestamp, 'short')}
                      </time>
                      {entry.ipAddress && (
                        <span className={cn('font-mono', entry.result !== 'SUCCESS' && 'text-red-500')}>
                          {entry.ipAddress}
                        </span>
                      )}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}