"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Users,
  Fingerprint,
  UserPlus,
  TrendingUp,
  TrendingDown,
  Activity,
  AlertCircle,
  Clock,
  ChevronRight,
  Stethoscope,
  FlaskConical,
  ShieldAlert,
  FileText,
  UserRound,
  QrCode,
  CreditCard,
  Droplet,
  Eye,
  Copy,
  RefreshCw,
  ShieldX,
} from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { cn, formatDate } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { SkeletonCard, SkeletonTable } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ConfirmModal,
} from "@/components/ui/modal";
import { apiClient } from "@/lib/api/client";
import {
  useGenerateMedicalQr,
  useRevokeMedicalQr,
  type MedicalProfileCard,
} from "@/lib/hooks/use-api";
import { useAuthStore } from "@/lib/stores/auth.store";
import { UserRole, PATIENT_ROLES } from "@medivault/shared";

// ─── Types ────────────────────────────────────────────────────────────────────
interface DashboardStats {
  totalPatients: number;
  patientsTrend: number;
  todayRegistrations: number;
  activeStaff: number;
  pendingLabReports: number;
  fingerprintScansToday: number;
  recentAlerts: number;
}

interface RecentActivity {
  id: string;
  action: string;
  user: string;
  target: string;
  timestamp: string;
  type: "patient" | "record" | "auth" | "biometric" | "admin";
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface RecentPatientRow {
  _id: string;
  id?: string;
  mrn?: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string | null;
  gender?: string;
  bloodGroup?: string | null;
  registeredAt?: string;
  updatedAt?: string;
}

// ─── Stats Card ───────────────────────────────────────────────────────────────
interface StatsCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: React.ElementType;
  trend?: number;
  trendLabel?: string;
  href?: string;
  variant?: "default" | "primary" | "success" | "warning" | "danger";
}

function StatsCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  trendLabel,
  href,
  variant = "default",
}: StatsCardProps) {
  const iconBg = {
    default: "bg-muted text-muted-foreground",
    primary: "bg-primary/10 text-primary",
    success:
      "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
    warning:
      "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
    danger: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
  }[variant];

  return (
    <Card
      className={cn(
        "transition-all duration-200",
        href && "hover:shadow-md hover:-translate-y-0.5 cursor-pointer",
      )}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-muted-foreground truncate">
              {title}
            </p>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums">{value}</span>
              {trend !== undefined && (
                <span
                  className={cn(
                    "flex items-center gap-0.5 text-xs font-medium",
                    trend >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400",
                  )}
                >
                  {trend >= 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {Math.abs(trend)}%
                </span>
              )}
            </div>
            {(description || trendLabel) && (
              <p className="mt-1 text-xs text-muted-foreground truncate">
                {description || trendLabel}
              </p>
            )}
          </div>
          <div className={cn("rounded-xl p-2.5 flex-shrink-0", iconBg)}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Quick Action Card ────────────────────────────────────────────────────────
function QuickAction({
  label,
  description,
  icon: Icon,
  href,
  variant = "default",
}: {
  label: string;
  description: string;
  icon: React.ElementType;
  href: string;
  variant?: "default" | "primary" | "fingerprint";
}) {
  const styles = {
    default: "border-border hover:bg-accent",
    primary: "border-primary/20 bg-primary/5 hover:bg-primary/10",
    fingerprint:
      "border-violet-200 bg-violet-50 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-900/20 dark:hover:bg-violet-900/30",
  }[variant];

  const iconStyles = {
    default: "bg-muted text-muted-foreground",
    primary: "bg-primary/10 text-primary",
    fingerprint:
      "bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400",
  }[variant];

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-4 rounded-xl border p-4 transition-all duration-150 group",
        styles,
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg",
          iconStyles,
        )}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{label}</p>
        <p className="text-xs text-muted-foreground truncate">{description}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
    </Link>
  );
}

// ─── Activity type badge ──────────────────────────────────────────────────────
const activityBadge: Record<
  RecentActivity["type"],
  {
    label: string;
    variant: "default" | "info" | "success" | "warning" | "purple";
  }
> = {
  patient: { label: "User", variant: "info" },
  record: { label: "Record", variant: "success" },
  auth: { label: "Auth", variant: "warning" },
  biometric: { label: "Biometric", variant: "purple" },
  admin: { label: "Admin", variant: "default" },
};

function ageFromDateOfBirth(dateOfBirth?: string | Date | null): number {
  if (!dateOfBirth) return 0;
  const dob = new Date(dateOfBirth);
  if (isNaN(dob.getTime())) return 0;
  return Math.max(
    0,
    Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000)),
  );
}

function isErrorLike(err: unknown): err is { message: string } {
  return typeof err === "object" && err !== null && "message" in err;
}

// ─── Patient MediVault ID card ────────────────────────────────────────────────
interface PatientMeRow {
  _id: string;
  profileId: string | null;
  patientId: string | null;
  mrn: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  bloodGroup: string | null;
  phoneNumber: string;
  email: string | null;
}

function toMvId(profileId: string | null): string | null {
  if (!profileId) return null;
  const clean = profileId.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (clean.length >= 8) return `MV-${clean.slice(0, 4)}-${clean.slice(4, 8)}`;
  return `MV-${clean}`;
}

function MediVaultIdCard() {
  const { data: me, isLoading: meLoading } = useQuery({
    queryKey: ["patients", "me"],
    queryFn: async () => {
      const res = await apiClient.get<PatientMeRow | null>("/patients/me");
      return res.data;
    },
    staleTime: 60_000,
  });

  const patientId = me?._id;
  const { data: card, isLoading: cardLoading } = useQuery({
    queryKey: ["medical-profile", patientId],
    queryFn: async () => {
      const res = await apiClient.get<MedicalProfileCard>(
        `/medical-profile/patients/${patientId}`,
      );
      return res.data;
    },
    enabled: !!patientId,
    staleTime: 60_000,
  });

  const generateQr = useGenerateMedicalQr(patientId ?? "");
  const [qrModalOpen, setQrModalOpen] = React.useState(false);

  if (meLoading || cardLoading) return <SkeletonCard />;

  if (!me) {
    return (
      <Card>
        <CardContent className="p-6 flex flex-col items-center gap-3 text-center">
          <CreditCard className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium">No MediVault ID yet</p>
          <p className="text-sm text-muted-foreground max-w-md">
            Your account is not linked to a patient record yet. Contact your
            healthcare provider to link your profile.
          </p>
        </CardContent>
      </Card>
    );
  }

  const fullName = `${me.firstName} ${me.lastName}`;
  const mvId = toMvId(me.profileId);
  const displayId = me.patientId ?? mvId;
  const isActive = card?.qr.status === "ACTIVE";

  return (
    <div className="max-w-3xl rounded-2xl border border-border overflow-hidden shadow-sm">
      {/* Header */}
      <div className="bg-gradient-to-r from-cyan-800 to-teal-700 px-6 py-4 text-white">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.2em] uppercase text-cyan-100/80">
              Medivault · Patient Identity
            </p>
            <p className="text-xl font-bold mt-0.5">{fullName}</p>
            <p className="text-xs font-mono text-cyan-100/70 mt-0.5">{me.mrn}</p>
          </div>
          <div className="text-right">
            {displayId ? (
              <div>
                <p className="text-[10px] font-medium uppercase tracking-widest text-cyan-200/70">
                  {me.patientId ? "Patient ID" : "MediVault ID"}
                </p>
                <p className="text-2xl font-black font-mono tracking-widest text-white mt-0.5">
                  {displayId}
                </p>
              </div>
            ) : (
              <p className="text-sm text-cyan-100/70">No ID assigned</p>
            )}
          </div>
        </div>
      </div>

      {/* Identity details */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 px-6 py-4 bg-white dark:bg-zinc-900">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Blood Group
          </p>
          <p className="text-sm font-bold text-red-600 dark:text-red-400 mt-0.5">
            {me.bloodGroup ?? "—"}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Date of Birth
          </p>
          <p className="text-sm font-medium mt-0.5">
            {formatDate(me.dateOfBirth, "short")}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Gender
          </p>
          <p className="text-sm font-medium capitalize mt-0.5">
            {me.gender?.toLowerCase() ?? "—"}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Phone
          </p>
          <p className="text-sm font-medium mt-0.5">{me.phoneNumber ?? "—"}</p>
        </div>
      </div>

      {/* QR status strip */}
      <div className="border-t border-border px-6 py-3 bg-muted/30 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm">
          {card?.qr.status === "ACTIVE" ? (
            <>
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                QR Active
              </span>
              {(card?.qr.scanCount ?? 0) > 0 && (
                <span className="text-muted-foreground text-xs">
                  · {card?.qr.scanCount} scan
                  {card?.qr.scanCount === 1 ? "" : "s"}
                </span>
              )}
            </>
          ) : card?.qr.status === "REVOKED" ? (
            <>
              <span className="h-2 w-2 rounded-full bg-red-500" />
              <span className="text-red-700 dark:text-red-400 font-medium">
                QR Revoked
              </span>
            </>
          ) : (
            <>
              <span className="h-2 w-2 rounded-full bg-muted-foreground/50" />
              <span className="text-muted-foreground">No QR generated</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setQrModalOpen(true)}>
            <Eye className="h-3.5 w-3.5" />
            View QR
          </Button>
          {!isActive && (
            <Button
              size="sm"
              onClick={() =>
                void generateQr.mutateAsync({
                  baseUrl: window.location.origin,
                })
              }
              loading={generateQr.isPending}
            >
              <QrCode className="h-3.5 w-3.5" />
              {card?.qr.status === "REVOKED"
                ? "Regenerate QR"
                : "Generate QR"}
            </Button>
          )}
          <Button size="sm" variant="outline" asChild>
            <Link href="/profile">
              <Droplet className="h-3.5 w-3.5 text-red-500" />
              Manage Card
            </Link>
          </Button>
        </div>
      </div>

      <PatientQrModal
        open={qrModalOpen}
        onOpenChange={setQrModalOpen}
        patientId={me._id}
        displayId={displayId}
        card={card}
      />
    </div>
  );
}

// ─── Patient QR view modal ────────────────────────────────────────────────────
function PatientQrModal({
  open,
  onOpenChange,
  patientId,
  displayId,
  card,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  displayId: string | null;
  card: MedicalProfileCard | undefined;
}) {
  const generateQr = useGenerateMedicalQr(patientId);
  const revokeQr = useRevokeMedicalQr(patientId);
  const [confirmRevoke, setConfirmRevoke] = React.useState(false);

  const isActive = card?.qr.status === "ACTIVE";

  const qrImage = useQuery({
    queryKey: ["qr", "png", patientId],
    queryFn: async () => {
      const res = await apiClient.get<Blob>(
        `/medical-profile/patients/${patientId}/qr.png`,
        { responseType: "blob" },
      );
      return URL.createObjectURL(res.data);
    },
    enabled: open && isActive,
    staleTime: 0,
  });

  const payloadUrl = isActive ? (card?.qr.payloadUrl ?? null) : null;

  const copyPayload = async () => {
    if (!payloadUrl) return;
    try {
      await navigator.clipboard.writeText(payloadUrl);
      toast.success("QR link copied to clipboard");
    } catch {
      toast.error("Could not copy the link");
    }
  };

  const handleRegenerate = () =>
    void generateQr
      .mutateAsync({ baseUrl: window.location.origin })
      .then((res) => {
        toast.success(res.regenerated ? "QR regenerated" : "QR generated");
      })
      .catch((err: unknown) => {
        toast.error(isErrorLike(err) ? err.message : "QR update failed");
      });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>MediVault QR Code</DialogTitle>
            <DialogDescription>
              Scan this code to open the emergency view of your health card.
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 pb-2 space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 p-3">
              <div className="text-sm">
                <p className="text-xs text-muted-foreground">Status</p>
                {isActive ? (
                  <p className="font-medium text-emerald-600 dark:text-emerald-400">
                    Active · {card?.qr.scanCount ?? 0} scan
                    {(card?.qr.scanCount ?? 0) === 1 ? "" : "s"}
                  </p>
                ) : card?.qr.status === "REVOKED" ? (
                  <p className="font-medium text-red-600 dark:text-red-400">
                    Revoked
                  </p>
                ) : (
                  <p className="font-medium text-muted-foreground">
                    Not generated
                  </p>
                )}
              </div>
              {displayId && (
                <p className="text-xs font-mono font-medium text-right">
                  {displayId}
                </p>
              )}
            </div>

            <div className="flex justify-center">
              {isActive ? (
                qrImage.isLoading ? (
                  <div className="h-40 w-40 rounded-lg border border-border animate-pulse bg-muted" />
                ) : qrImage.data ? (
                  <Image
                    src={qrImage.data}
                    alt="MediVault QR code"
                    width={160}
                    height={160}
                    unoptimized
                    className="h-40 w-40 rounded-lg border border-border"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground py-10">
                    QR image unavailable.
                  </p>
                )
              ) : (
                <p className="text-sm text-muted-foreground py-10">
                  Generate a QR code to display the scannable card.
                </p>
              )}
            </div>

            {payloadUrl && (
              <div className="rounded-md border border-border bg-muted/30 p-2 flex items-center gap-2">
                <p className="flex-1 min-w-0 text-xs font-mono text-muted-foreground truncate">
                  {payloadUrl}
                </p>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => void copyPayload()}
                  aria-label="Copy QR link"
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              loading={revokeQr.isPending}
              disabled={!isActive}
              onClick={() => setConfirmRevoke(true)}
            >
              <ShieldX className="h-4 w-4" />
              Revoke
            </Button>
            <Button
              type="button"
              size="sm"
              loading={generateQr.isPending}
              onClick={() => void handleRegenerate()}
            >
              <RefreshCw className="h-4 w-4" />
              Regenerate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmModal
        open={confirmRevoke}
        onOpenChange={setConfirmRevoke}
        title="Revoke this QR code?"
        description="Revoking immediately invalidates the current QR. Nobody will be able to scan it until you generate a new one."
        confirmLabel="Revoke QR"
        variant="destructive"
        loading={revokeQr.isPending}
        onConfirm={() =>
          void revokeQr
            .mutateAsync()
            .then(() => {
              setConfirmRevoke(false);
              toast.success("QR code revoked");
            })
            .catch((err: unknown) => {
              toast.error(
                isErrorLike(err) ? err.message : "QR revoke failed",
              );
            })
        }
      />
    </>
  );
}

// ─── Patient Home (no staff dashboards for PATIENT role) ─────────────────────
function PatientHome({
  user,
  greeting,
}: {
  user: { firstName?: string } | null;
  greeting: string;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          {greeting}, {user?.firstName} 👋
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Your personal health dashboard
        </p>
      </div>

      <MediVaultIdCard />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
        <QuickAction
          label="My Health Profile"
          description="Your details, records and appointments"
          icon={UserRound}
          href="/profile"
          variant="primary"
        />
        <QuickAction
          label="My Medical Records"
          description="View your reports, notes and prescriptions"
          icon={Stethoscope}
          href="/my-records"
        />
        <QuickAction
          label="My Documents"
          description="Files uploaded across hospitals"
          icon={FileText}
          href="/profile"
        />
        <QuickAction
          label="Update Contact Info"
          description="Keep your phone number current"
          icon={UserPlus}
          href="/profile"
        />
      </div>
    </div>
  );
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────
export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const isAdmin =
    user?.role === UserRole.SUPER_ADMIN ||
    user?.role === UserRole.ORG_ADMIN ||
    user?.role === UserRole.FACILITY_ADMIN;
  const isDoctor = user?.role === UserRole.DOCTOR;
  const isReceptionist = user?.role === UserRole.RECEPTIONIST;
  const isPatient = !!user?.role && PATIENT_ROLES.includes(user.role);
  const isStaff = !isPatient;

  // Stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["dashboard", "stats"],
    queryFn: async () => {
      const res = await apiClient.get<DashboardStats>("/dashboard/stats");
      return res.data;
    },
    // Don't fire until auth is initialized — prevents 401 storm on page load
    enabled: isInitialized && !!user && isStaff,
    staleTime: 60_000,
  });

  // Recent patients (paginated — backend returns { data: [...], total, ... })
  const { data: recentPatients, isLoading: patientsLoading } = useQuery({
    queryKey: ["dashboard", "recent-patients"],
    queryFn: async () => {
      const res = await apiClient.get<PaginatedResponse<RecentPatientRow>>(
        "/patients?limit=5&sortBy=createdAt&order=desc",
      );
      return (res.data?.data ?? []).map((p) => ({
        id: p._id ?? p.id ?? "",
        patientId: p.mrn ?? "",
        fullName: [p.firstName, p.lastName].filter(Boolean).join(" "),
        age: ageFromDateOfBirth(p.dateOfBirth),
        gender: p.gender ?? "",
        bloodGroup: p.bloodGroup ?? "—",
        lastVisit: p.registeredAt ?? p.updatedAt ?? new Date().toISOString(),
      }));
    },
    enabled: isInitialized && !!user && isStaff,
    staleTime: 60_000,
  });

  // Recent activity
  const { data: recentActivity, isLoading: activityLoading } = useQuery({
    queryKey: ["dashboard", "activity"],
    queryFn: async () => {
      const res = await apiClient.get<PaginatedResponse<RecentActivity>>(
        "/audit-logs?limit=8",
      );
      return res.data?.data ?? [];
    },
    enabled: isInitialized && !!user && isAdmin,
    staleTime: 30_000,
  });

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="space-y-6">
      {isPatient && <PatientHome user={user} greeting={greeting()} />}
      {isStaff && (
        <>
          {/* ─── Page Header ─────────────────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">
                {greeting()}, {user?.firstName} 👋
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {new Date().toLocaleDateString("en-IN", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href="/patients">
                  <Users className="h-4 w-4" />
                  View Users
                </Link>
              </Button>
              {(isReceptionist || isAdmin) && (
                <Button size="sm" asChild>
                  <Link href="/patients/new">
                    <UserPlus className="h-4 w-4" />
                    Register User
                  </Link>
                </Button>
              )}
            </div>
          </div>

          {/* ─── Stats Grid ──────────────────────────────────────────────── */}
          {statsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }, (_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatsCard
                title="Total Users"
                value={stats?.totalPatients?.toLocaleString() ?? "—"}
                icon={Users}
                trend={stats?.patientsTrend}
                trendLabel="vs last month"
                href="/patients"
                variant="primary"
              />
              <StatsCard
                title="Today's Registrations"
                value={stats?.todayRegistrations ?? "—"}
                icon={UserPlus}
                description="New users registered today"
                href="/patients?filter=today"
                variant="success"
              />
              <StatsCard
                title="Fingerprint Scans"
                value={stats?.fingerprintScansToday ?? "—"}
                icon={Fingerprint}
                description="Identifications today"
                href="/fingerprint"
                variant="default"
              />
              <StatsCard
                title="Pending Reports"
                value={stats?.pendingLabReports ?? "—"}
                icon={FlaskConical}
                description="Lab reports awaiting review"
                href="/labs"
                variant={
                  (stats?.pendingLabReports ?? 0) > 10 ? "warning" : "default"
                }
              />
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* ─── Quick Actions ──────────────────────────────────────────── */}
            <div className="lg:col-span-1 space-y-4">
              <h2 className="text-base font-semibold">Quick Actions</h2>
              <div className="space-y-2">
                <QuickAction
                  label="Scan Fingerprint"
                  description="Identify a user biometrically"
                  icon={Fingerprint}
                  href="/fingerprint"
                  variant="fingerprint"
                />
                {(isReceptionist || isAdmin) && (
                  <QuickAction
                    label="Register User"
                    description="Create a new user record"
                    icon={UserPlus}
                    href="/patients/new"
                    variant="primary"
                  />
                )}
                <QuickAction
                  label="Search Users"
                  description="Find by name, ID, or phone"
                  icon={Users}
                  href="/patients"
                />
                {(isDoctor || isAdmin) && (
                  <QuickAction
                    label="Add Medical Record"
                    description="New diagnosis, note or prescription"
                    icon={Stethoscope}
                    href="/records/new"
                  />
                )}
                {isAdmin && (
                  <QuickAction
                    label="View Audit Log"
                    description="Monitor system activity"
                    icon={ShieldAlert}
                    href="/admin/audit-logs"
                  />
                )}
              </div>

              {/* Alerts */}
              {(stats?.recentAlerts ?? 0) > 0 && (
                <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/10">
                  <CardContent className="p-4 flex items-start gap-3">
                    <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                        {stats?.recentAlerts} security alert
                        {stats?.recentAlerts !== 1 ? "s" : ""}
                      </p>
                      <p className="text-xs text-amber-600/80 dark:text-amber-400/80 mt-0.5">
                        Unusual activity detected. Review audit logs.
                      </p>
                      <Link
                        href="/admin/audit-logs"
                        className="mt-1.5 inline-flex text-xs text-amber-700 dark:text-amber-300 font-medium hover:underline"
                      >
                        Review →
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* ─── Recent Users ─────────────────────────────────────────── */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">Recent Users</h2>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/patients">
                    View all
                    <ChevronRight className="h-3.5 w-3.5 ml-1" />
                  </Link>
                </Button>
              </div>

              <Card>
                {patientsLoading ? (
                  <CardContent className="p-4">
                    <SkeletonTable rows={5} cols={4} />
                  </CardContent>
                ) : !recentPatients?.length ? (
                  <CardContent className="p-8 flex flex-col items-center gap-3 text-center">
                    <Users className="h-8 w-8 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">
                      No users yet.
                    </p>
                    <Button size="sm" asChild>
                      <Link href="/patients/new">Register first user</Link>
                    </Button>
                  </CardContent>
                ) : (
                  <div className="divide-y divide-border">
                    {recentPatients.map((patient) => (
                      <Link
                        key={patient.id}
                        href={`/patients/${patient.id}`}
                        className="flex items-center gap-4 px-4 py-3 hover:bg-accent transition-colors group"
                        aria-label={`View user ${patient.fullName}`}
                      >
                        <Avatar name={patient.fullName} size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                            {patient.fullName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {patient.patientId} · {patient.age}y ·{" "}
                            {patient.gender}
                          </p>
                        </div>
                        <div className="text-right hidden sm:block">
                          <Badge variant="gray" className="text-xs">
                            {patient.bloodGroup}
                          </Badge>
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatDate(patient.lastVisit, "relative")}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
                      </Link>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </div>

          {/* ─── Recent Activity (Admin/Doctor only) ─────────────────────── */}
          {isAdmin && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">Recent Activity</h2>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/admin/audit-logs">
                    Full audit log
                    <ChevronRight className="h-3.5 w-3.5 ml-1" />
                  </Link>
                </Button>
              </div>
              <Card>
                {activityLoading ? (
                  <CardContent className="p-4">
                    <SkeletonTable rows={6} cols={3} />
                  </CardContent>
                ) : !recentActivity?.length ? (
                  <CardContent className="p-6 text-center text-sm text-muted-foreground">
                    No recent activity.
                  </CardContent>
                ) : (
                  <div className="divide-y divide-border">
                    {recentActivity.map((event) => {
                      const { label, variant } = activityBadge[event.type] ?? {
                        label: event.type,
                        variant: "default" as const,
                      };
                      return (
                        <div
                          key={event.id}
                          className="flex items-start gap-4 px-4 py-3"
                        >
                          <div className="flex-shrink-0 mt-0.5">
                            <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm">
                              <span className="font-medium">{event.user}</span>{" "}
                              <span className="text-muted-foreground">
                                {event.action}
                              </span>{" "}
                              <span className="font-medium">
                                {event.target}
                              </span>
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Badge
                              variant={variant}
                              className="hidden sm:inline-flex"
                            >
                              {label}
                            </Badge>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDate(event.timestamp, "relative")}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
