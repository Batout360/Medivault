'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Droplet,
  EyeOff,
  HeartPulse,
  LogIn,
  Phone,
  QrCode,
  Shield,
  ShieldCheck,
  XCircle,
  Zap,
} from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/lib/stores/auth.store';
import { MedicalProfileCardView } from '@/components/medical-profile-card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { SkeletonCard } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/utils';
import type { MedicalProfileCard, PublicProfileResult } from '@/lib/hooks/use-api';

interface VerifyDetails {
  patientId: string;
  card: MedicalProfileCard;
}

// ─── Severity badge ───────────────────────────────────────────────────────────
function SeverityBadge({ severity }: { severity: string | null }) {
  if (!severity) return null;
  const color: Record<string, string> = {
    LIFE_THREATENING: 'bg-red-600 text-white',
    CRITICAL: 'bg-red-600 text-white',
    SEVERE: 'bg-red-500 text-white',
    HIGH: 'bg-orange-500 text-white',
    MODERATE: 'bg-amber-400 text-black',
    MILD: 'bg-yellow-200 text-yellow-900',
  };
  return (
    <span
      className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${
        color[severity.toUpperCase()] ?? 'bg-muted text-muted-foreground'
      }`}
    >
      {severity}
    </span>
  );
}

// ─── Blood type pill ──────────────────────────────────────────────────────────
function BloodBadge({ group }: { group: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-1.5 text-2xl font-bold text-red-600 dark:text-red-400">
      <Droplet className="h-5 w-5" />
      {group}
    </span>
  );
}

// ─── Section card ─────────────────────────────────────────────────────────────
function Section({
  icon: Icon,
  title,
  children,
  accent,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
  accent?: 'red' | 'amber' | 'teal';
}) {
  const border = {
    red: 'border-red-200 dark:border-red-800',
    amber: 'border-amber-200 dark:border-amber-800',
    teal: 'border-teal-200 dark:border-teal-800',
  }[accent ?? 'teal'] ?? 'border-border';
  const headerBg = {
    red: 'bg-red-50 dark:bg-red-900/10',
    amber: 'bg-amber-50 dark:bg-amber-900/10',
    teal: 'bg-teal-50 dark:bg-teal-900/10',
  }[accent ?? 'teal'] ?? 'bg-muted/40';
  const iconColor = {
    red: 'text-red-600',
    amber: 'text-amber-600',
    teal: 'text-teal-600',
  }[accent ?? 'teal'] ?? 'text-muted-foreground';

  return (
    <div className={`rounded-2xl border ${border} overflow-hidden`}>
      <div className={`flex items-center gap-2 px-5 py-3 ${headerBg} border-b ${border}`}>
        <Icon className={`h-4 w-4 ${iconColor}`} />
        <p className={`text-sm font-semibold ${iconColor}`}>{title}</p>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

// ─── Public Profile View ─────────────────────────────────────────────────────
function PublicProfileView({ data }: { data: PublicProfileResult }) {
  const fullName =
    data.patient?.firstName && data.patient?.lastName
      ? `${data.patient.firstName} ${data.patient.lastName}`
      : null;

  const hasCritical = data.criticalAllergies && data.criticalAllergies.length > 0;

  return (
    <div className="space-y-5">
      {/* Identity header */}
      <div className="rounded-2xl border border-border bg-white dark:bg-zinc-900 overflow-hidden shadow-sm">
        {/* Top gradient strip */}
        <div className="h-2 bg-gradient-to-r from-cyan-600 to-teal-600" />
        <div className="px-6 py-6 flex flex-col sm:flex-row items-center sm:items-start gap-5">
          <div className="relative">
            <Avatar name={fullName ?? data.patient?.initials ?? 'P'} size="xl" />
            <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-emerald-500 border-2 border-white dark:border-zinc-900 flex items-center justify-center">
              <CheckCircle2 className="h-3.5 w-3.5 text-white" />
            </div>
          </div>
          <div className="flex-1 text-center sm:text-left">
            {fullName ? (
              <h1 className="text-2xl font-bold">{fullName}</h1>
            ) : (
              <div className="flex items-center gap-2 justify-center sm:justify-start">
                <EyeOff className="h-4 w-4 text-muted-foreground" />
                <p className="text-base text-muted-foreground">Name is private</p>
              </div>
            )}
            {data.patientId && (
              <p className="text-sm font-mono font-semibold text-cyan-700 dark:text-cyan-400 mt-1">
                {data.patientId}
              </p>
            )}
            {data.mvId && (
              <p className="text-xs font-mono text-muted-foreground mt-0.5">
                {data.mvId}
              </p>
            )}
            <div className="flex items-center gap-2 mt-2 justify-center sm:justify-start">
              <Badge variant="success" dot>
                Verified
              </Badge>
              <Badge variant="gray">
                {data.patient?.gender ?? 'Unknown'}
              </Badge>
            </div>
          </div>
          {data.patient?.bloodGroup && (
            <BloodBadge group={data.patient.bloodGroup} />
          )}
        </div>
      </div>

      {/* Critical allergy alert */}
      {hasCritical && (
        <div className="rounded-2xl border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/10 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5 animate-pulse" />
            <div className="flex-1">
              <p className="font-bold text-red-700 dark:text-red-400 uppercase tracking-wide text-sm">
                ⚠ Critical Allergies
              </p>
              <div className="mt-2 space-y-1">
                {data.criticalAllergies.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-red-800 dark:text-red-300">{a.allergen}</span>
                    <SeverityBadge severity={a.severity} />
                    {a.reaction && (
                      <span className="text-sm text-red-700/80 dark:text-red-400/80">— {a.reaction}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Allergies */}
      {data.visibility?.showAllergies && data.allergies.length > 0 && !hasCritical && (
        <Section icon={AlertCircle} title="Known Allergies" accent="amber">
          <div className="space-y-2">
            {data.allergies.map((a, i) => (
              <div key={i} className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">{a.allergen}</span>
                <SeverityBadge severity={a.severity} />
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Conditions */}
      {data.visibility?.showConditions && data.conditions.length > 0 && (
        <Section icon={Shield} title="Medical Conditions" accent="teal">
          <ul className="space-y-1">
            {data.conditions.map((c, i) => (
              <li key={i} className="text-sm text-foreground">{c.conditionName}</li>
            ))}
          </ul>
        </Section>
      )}

      {/* Emergency contact */}
      {data.visibility?.showEmergencyContact && data.emergencyContact && (
        <Section icon={Phone} title="Emergency Contact" accent="teal">
          <div className="space-y-0.5">
            <p className="font-semibold">{data.emergencyContact.name}</p>
            <p className="text-sm text-muted-foreground">{data.emergencyContact.relationship}</p>
            <p className="text-sm font-mono">{data.emergencyContact.phone}</p>
          </div>
        </Section>
      )}

      {/* Scan metadata */}
      {data.qr && (
        <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1.5">
          <QrCode className="h-3 w-3" />
          {data.qr.scanCount} scan{data.qr.scanCount === 1 ? '' : 's'} &nbsp;·&nbsp;
          Last scanned {data.qr.lastScannedAt ? formatDate(data.qr.lastScannedAt, 'relative') : 'just now'}
        </p>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function VerifyPage() {
  const { token } = useParams<{ token: string }>();
  const isAuthenticated = useAuthStore((s) => !!s.accessToken);
  const [showEmergency, setShowEmergency] = React.useState(false);

  // 1. Public profile (visibility-filtered)
  const publicQuery = useQuery<PublicProfileResult>({
    queryKey: ['public-profile', token],
    queryFn: async () => {
      const res = await apiClient.get<PublicProfileResult>(`/medical-profile/public/${token}`);
      return res.data;
    },
    enabled: !!token,
    retry: false,
    staleTime: 30_000,
  });

  // 2. Authorized details for signed-in staff
  const canViewDetails = publicQuery.data?.valid === true && isAuthenticated;
  const detailsQuery = useQuery<VerifyDetails>({
    queryKey: ['verify-details', token],
    queryFn: async () => {
      const res = await apiClient.get<VerifyDetails>(`/medical-profile/verify/${token}/details`);
      return res.data;
    },
    enabled: canViewDetails,
    retry: false,
  });

  const loading = publicQuery.isLoading;
  const data = publicQuery.data;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-zinc-950 dark:to-zinc-900">
      {/* Header */}
      <header className="border-b border-border bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 text-cyan-800 dark:text-cyan-300">
            <HeartPulse className="h-5 w-5" />
            <span className="text-sm font-bold tracking-wider uppercase">Medivault</span>
          </div>
          {!isAuthenticated && (
            <Link href={`/login?redirect=/verify/${token}`}>
              <Button size="sm" variant="outline">
                <LogIn className="h-3.5 w-3.5" />
                Sign in
              </Button>
            </Link>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Loading */}
        {loading && (
          <div className="space-y-4">
            <SkeletonCard />
            <SkeletonCard />
            <p className="text-sm text-muted-foreground text-center">Loading profile…</p>
          </div>
        )}

        {/* Invalid / revoked */}
        {!loading && data && !data.valid && (
          <div className="rounded-2xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10 p-8 space-y-3">
            <div className="flex items-center gap-3">
              {data.status === 'REVOKED' ? (
                <XCircle className="h-8 w-8 text-red-600 flex-shrink-0" />
              ) : (
                <QrCode className="h-8 w-8 text-red-600 flex-shrink-0" />
              )}
              <div>
                <p className="text-base font-semibold text-red-700 dark:text-red-400">
                  {data.status === 'REVOKED' ? 'This QR code has been revoked.' : 'Invalid QR code'}
                </p>
                <p className="text-sm text-red-700/80 dark:text-red-400/80">
                  Ask the patient&apos;s care team for a current, active medical card.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Valid public profile */}
        {data?.valid && <PublicProfileView data={data} />}

        {/* Emergency view toggle */}
        {data?.valid && (
          <div className="flex items-center justify-center">
            <button
              onClick={() => setShowEmergency((v) => !v)}
              className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400 hover:text-amber-800 transition-colors px-4 py-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10"
            >
              <Zap className="h-4 w-4" />
              {showEmergency ? 'Hide emergency info' : 'View emergency profile'}
              <ChevronRight className={`h-4 w-4 transition-transform ${showEmergency ? 'rotate-90' : ''}`} />
            </button>
          </div>
        )}

        {/* Emergency profile panel */}
        {data?.valid && showEmergency && (
          <EmergencyPanel token={token} />
        )}

        {/* Authenticated staff view */}
        {canViewDetails && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <EyeOff className="h-3.5 w-3.5" />
              <span>Full profile — visible only to signed-in care team</span>
            </div>
            {detailsQuery.isLoading ? (
              <SkeletonCard />
            ) : detailsQuery.data ? (
              <MedicalProfileCardView card={detailsQuery.data.card} canManage={false} />
            ) : (
              <div className="rounded-2xl border border-border p-8 text-center space-y-2">
                <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto" />
                <p className="text-sm font-medium">Access restricted</p>
                <p className="text-xs text-muted-foreground">
                  You don&apos;t have access to this patient&apos;s full profile.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Unauthenticated — invite to sign in */}
        {data?.valid && !isAuthenticated && (
          <div className="rounded-2xl border border-border bg-white dark:bg-zinc-900 p-6 space-y-4 text-center shadow-sm">
            <ShieldCheck className="h-8 w-8 text-teal-600 mx-auto" />
            <p className="text-base font-semibold">Request Medical Access</p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Sign in with your Medivault credentials to view the complete verified medical
              profile. Access is logged and audited.
            </p>
            <Link href={`/login?redirect=/verify/${token}`}>
              <Button>
                <LogIn className="h-4 w-4" />
                Sign in to view full profile
              </Button>
            </Link>
          </div>
        )}

        {/* Network error */}
        {!loading && publicQuery.isError && (
          <div className="rounded-2xl border border-border p-8 space-y-3 text-center">
            <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto" />
            <p className="text-base font-medium">Could not verify this QR code.</p>
            <p className="text-sm text-muted-foreground">
              The verification service is temporarily unavailable. Please try again.
            </p>
          </div>
        )}

        {/* Footer */}
        <footer className="text-center pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground">
            Medivault · Secure Medical Identity &nbsp;·&nbsp;
            <Link href="/" className="underline hover:text-foreground transition-colors">medivault.health</Link>
          </p>
        </footer>
      </main>
    </div>
  );
}

// ─── Emergency Panel (lazy loaded) ────────────────────────────────────────────
function EmergencyPanel({ token }: { token: string }) {
  const emergencyQuery = useQuery({
    queryKey: ['emergency-profile', token],
    queryFn: async () => {
      const res = await apiClient.get(`/medical-profile/emergency/${token}`);
      return res.data as {
        isEmergencyView: boolean;
        patient: { firstName: string; lastName: string; bloodGroup: string | null; gender: string };
        criticalAllergies: Array<{ allergen: string; severity: string | null; reaction: string | null }>;
        allergies: Array<{ allergen: string; severity: string | null }>;
        conditions: Array<{ conditionName: string }>;
        emergencyContact: { name: string; relationship: string; phone: string } | null;
      };
    },
    enabled: !!token,
    retry: false,
    staleTime: 60_000,
  });

  if (emergencyQuery.isLoading) return <SkeletonCard />;
  if (!emergencyQuery.data) return null;

  const e = emergencyQuery.data;
  const fullName = `${e.patient.firstName} ${e.patient.lastName}`;

  return (
    <div className="rounded-2xl border-2 border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/10 overflow-hidden">
      <div className="bg-amber-500 dark:bg-amber-600 px-5 py-3 flex items-center gap-2">
        <Zap className="h-4 w-4 text-white" />
        <p className="text-sm font-bold text-white uppercase tracking-wide">Emergency Profile</p>
      </div>
      <div className="p-5 space-y-4">
        <div className="flex items-center gap-3">
          <Avatar name={fullName} size="md" />
          <div>
            <p className="font-bold text-lg">{fullName}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {e.patient.bloodGroup && <BloodBadge group={e.patient.bloodGroup} />}
              <span className="text-sm text-muted-foreground capitalize">{e.patient.gender.toLowerCase()}</span>
            </div>
          </div>
        </div>

        {e.criticalAllergies.length > 0 && (
          <div className="rounded-xl bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-700 p-4">
            <p className="text-xs font-bold text-red-700 dark:text-red-400 uppercase mb-2">⚠ Critical Allergies</p>
            {e.criticalAllergies.map((a, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="font-semibold text-red-800 dark:text-red-300">{a.allergen}</span>
                {a.severity && <SeverityBadge severity={a.severity} />}
              </div>
            ))}
          </div>
        )}

        {e.allergies.length > 0 && e.criticalAllergies.length === 0 && (
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Allergies</p>
            <p className="text-sm">{e.allergies.map((a) => a.allergen).join(', ')}</p>
          </div>
        )}

        {e.conditions.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Conditions</p>
            <p className="text-sm">{e.conditions.map((c) => c.conditionName).join(', ')}</p>
          </div>
        )}

        {e.emergencyContact && (
          <div className="rounded-xl bg-white dark:bg-zinc-900 border border-border p-3">
            <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Emergency Contact</p>
            <p className="font-medium">{e.emergencyContact.name}</p>
            <p className="text-sm text-muted-foreground">{e.emergencyContact.relationship}</p>
            <a
              href={`tel:${e.emergencyContact.phone}`}
              className="flex items-center gap-1.5 text-sm font-mono text-primary hover:underline mt-1"
            >
              <Phone className="h-3.5 w-3.5" />
              {e.emergencyContact.phone}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
