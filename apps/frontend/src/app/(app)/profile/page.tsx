"use client";

import * as React from "react";
import Link from "next/link";
import {
  User,
  Shield,
  Mail,
  Phone,
  Calendar,
  Building2,
  Fingerprint,
  FileText,
  ClipboardList,
  Stethoscope,
  Download,
  AlertCircle,
  BadgeCheck,
  CheckCircle2,
  Printer,
  CreditCard,
  KeyRound,
  Pencil,
  MapPin,
  Loader2,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { SkeletonCard } from "@/components/ui/skeleton";
import { MedicalProfileCardView } from "@/components/medical-profile-card";
import { VisibilitySettingsPanel } from "@/components/visibility-settings-panel";
import { ChangePasswordForm } from "@/components/change-password-form";
import { apiClient } from "@/lib/api/client";
import { formatDate, calculateAge } from "@/lib/utils";
import { useAuthStore } from "@/lib/stores/auth.store";
import type { MedicalProfileCard } from "@/lib/hooks/use-api";
import { UserRole, UserRoleLabels, PATIENT_ROLES } from "@medivault/shared";

// ─── Types ────────────────────────────────────────────────────────────────────
interface UserProfile {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: UserRole;
  organizationId: string | null;
  facilityId: string | null;
  hospital: string | null;
  isActive: boolean;
  isEmailVerified: boolean;
  mfaEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface LinkedPatient {
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
  patient: {
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
}

interface ProfileDocument {
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
}

// ─── Role badge ───────────────────────────────────────────────────────────────
const roleVariant: Record<
  UserRole,
  "default" | "warning" | "info" | "success" | "gray" | "purple"
> = {
  [UserRole.SUPER_ADMIN]: "purple",
  [UserRole.ORG_ADMIN]: "warning",
  [UserRole.FACILITY_ADMIN]: "warning",
  [UserRole.DOCTOR]: "info",
  [UserRole.NURSE]: "success",
  [UserRole.PHARMACIST]: "info",
  [UserRole.LAB_TECHNICIAN]: "info",
  [UserRole.RADIOLOGIST]: "info",
  [UserRole.RECEPTIONIST]: "default",
  [UserRole.BILLING_STAFF]: "default",
  [UserRole.USER]: "gray",
  [UserRole.PATIENT]: "gray",
  [UserRole.AUDITOR]: "gray",
};

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function groupDocuments(
  docs: ProfileDocument[] | undefined,
): Array<[string, ProfileDocument[]]> {
  const groups = new Map<string, ProfileDocument[]>();
  for (const doc of docs ?? []) {
    const key = doc.sourceHospital?.trim() || "Unknown source";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(doc);
  }
  return Array.from(groups.entries());
}

/** Derive the display MediVault ID (MV-XXXX-XXXX) from a raw profileId. */
function toMvId(profileId: string | null): string | null {
  if (!profileId) return null;
  const clean = profileId.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (clean.length >= 8) return `MV-${clean.slice(0, 4)}-${clean.slice(4, 8)}`;
  return `MV-${clean}`;
}

function toE164(raw: string): string {
  const digits = raw.replace(/[\s\-()]/g, "");
  return digits.startsWith("+") ? digits : `+${digits}`;
}

function apiErrorMessage(err: unknown): string {
  const candidate = (err as {
    response?: { data?: { message?: unknown } };
  }).response?.data?.message;
  return typeof candidate === "string" && candidate
    ? candidate
    : "Could not save your details. Please try again.";
}

// ─── Patient self-service edit — name / contact / address / email only ────────
function PatientSelfEditForm({
  patient,
  onCancel,
  onSaved,
}: {
  patient: LinkedPatient;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const address = (patient as unknown as { address?: Record<string, unknown> })
    .address;

  const [firstName, setFirstName] = React.useState(patient.firstName ?? "");
  const [lastName, setLastName] = React.useState(patient.lastName ?? "");
  const [email, setEmail] = React.useState(patient.email ?? "");
  const [phone, setPhone] = React.useState(patient.phoneNumber ?? "");
  const [line1, setLine1] = React.useState(
    (address?.line1 as string) ?? "",
  );
  const [city, setCity] = React.useState(
    (address?.city as string) ?? (patient as unknown as { city?: string }).city ?? "",
  );
  const [state, setState] = React.useState(
    (address?.state as string) ?? (patient as unknown as { state?: string }).state ?? "",
  );
  const [pincode, setPincode] = React.useState(
    (address?.postalCode as string) ??
      (patient as unknown as { pincode?: string }).pincode ??
      "",
  );
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      };
      if (phone.trim()) payload.phone = toE164(phone.trim());
      if (email.trim()) payload.email = email.trim();
      const hasAddress = line1.trim() || city.trim() || state.trim() || pincode.trim();
      if (hasAddress) {
        payload.address = {
          line1: line1.trim() || "N/A",
          city: city.trim() || "N/A",
          state: state.trim() || "N/A",
          country: (address?.country as string) ?? "India",
          ...(pincode.trim() ? { postalCode: pincode.trim() } : {}),
        };
        payload.city = city.trim() || "N/A";
        payload.state = state.trim() || "N/A";
        payload.pincode = pincode.trim() || null;
      }
      await apiClient.patch("/patients/me", payload);
      await onSaved();
    } catch (err: unknown) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    void save(e);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          Edit personal details
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          You can update your name, phone, email, and address. Your medical
          records remain read-only.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Ananya"
            />
            <Input
              label="Last name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Iyer"
            />
            <Input
              label="Email address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
            <Input
              label="Phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
            />
            <div className="sm:col-span-2">
              <Input
                label="Address"
                leftIcon={<MapPin className="h-3.5 w-3.5" />}
                value={line1}
                onChange={(e) => setLine1(e.target.value)}
                placeholder="Street address, apartment, suite, etc."
              />
            </div>
            <Input
              label="City"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Bengaluru"
            />
            <Input
              label="State"
              value={state}
              onChange={(e) => setState(e.target.value)}
              placeholder="Karnataka"
            />
            <Input
              label="PIN code"
              value={pincode}
              onChange={(e) => setPincode(e.target.value)}
              placeholder="560001"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCancel}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
              Save changes
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="rounded-md bg-muted p-1.5 mt-0.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium truncate">{value}</p>
      </div>
    </div>
  );
}

// ─── Staff Profile Card ───────────────────────────────────────────────────────
/** Downloadable / printable identity card for staff roles. */
function StaffProfileCard({ profile }: { profile: UserProfile }) {
  const fullName = `${profile.firstName} ${profile.lastName}`;
  const [downloading, setDownloading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const cardId = `staff-card-${profile.id}`;

  const handlePrint = () => {
    const cardEl = document.getElementById(cardId);
    if (!cardEl) return;
    const w = window.open('', '_blank', 'width=720,height=480');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>Staff Card — ${fullName}</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:system-ui,sans-serif;background:#f1f5f9;display:flex;justify-content:center;padding:32px}
        .card{width:640px;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px #0002;background:#fff}
        .hdr{background:linear-gradient(135deg,#0e7490,#155e75);color:#fff;padding:24px 28px;display:flex;justify-content:space-between;align-items:center;gap:16px}
        .avatar{width:64px;height:64px;border-radius:50%;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;color:#fff;flex-shrink:0}
        .hdr-text h1{font-size:20px;font-weight:700;margin:0}
        .hdr-text p{font-size:12px;opacity:.85;margin-top:2px}
        .body{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:20px 28px}
        .field label{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;font-weight:600}
        .field p{font-size:14px;font-weight:500;color:#0f172a;margin-top:2px}
        .badge{display:inline-block;background:#e0f2fe;color:#0369a1;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em}
        .footer{background:#f8fafc;border-top:1px solid #e2e8f0;padding:10px 28px;display:flex;justify-content:space-between;align-items:center}
        .footer p{font-size:10px;color:#94a3b8}
        @media print{body{padding:0;background:#fff}.card{box-shadow:none;border-radius:0;width:100%}}
      </style></head>
      <body onload="window.print()">
      <div class="card">
        <div class="hdr">
          <div class="hdr-text">
            <h1>${fullName}</h1>
            <p>${UserRoleLabels[profile.role] ?? profile.role} &nbsp;·&nbsp; Medivault</p>
          </div>
          <div class="avatar">${fullName.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0,2)}</div>
        </div>
        <div class="body">
          <div class="field"><label>Email</label><p>${profile.email}</p></div>
          <div class="field"><label>Role</label><p><span class="badge">${UserRoleLabels[profile.role] ?? profile.role}</span></p></div>
          <div class="field"><label>Phone</label><p>${profile.phone ?? '—'}</p></div>
          <div class="field"><label>Organization ID</label><p>${profile.organizationId ?? '—'}</p></div>
          <div class="field"><label>Member since</label><p>${formatDate(profile.createdAt, 'long')}</p></div>
          <div class="field"><label>Account ID</label><p style="font-family:monospace;font-size:11px">${profile.id}</p></div>
        </div>
        <div class="footer">
          <p>Medivault &mdash; Staff Identity Card</p>
          <p>Generated ${new Date().toLocaleDateString('en-IN')}</p>
        </div>
      </div>
      </body></html>`);
    w.document.close();
  };

  const handleDownload = async () => {
    setDownloading(true);
    setError(null);
    try {
      const cardEl = document.getElementById(cardId);
      if (!cardEl) throw new Error('Card element not found');

      const initials = fullName.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);
      const roleLabel = UserRoleLabels[profile.role] ?? profile.role;

      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="440" viewBox="0 0 800 440">
  <defs>
    <linearGradient id="hdr" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#0e7490"/>
      <stop offset="100%" stop-color="#155e75"/>
    </linearGradient>
    <style>
      .title{font:700 28px system-ui,sans-serif;fill:#fff}
      .sub{font:500 16px system-ui,sans-serif;fill:#e0f2fe}
      .lbl{font:600 12px system-ui,sans-serif;fill:#64748b;letter-spacing:1px}
      .val{font:500 18px system-ui,sans-serif;fill:#0f172a}
    </style>
  </defs>
  <rect width="800" height="440" rx="24" fill="#ffffff"/>
  <rect width="800" height="150" rx="0" fill="url(#hdr)"/>
  <rect x="0" y="126" width="800" height="24" fill="url(#hdr)"/>
  <circle cx="726" cy="75" r="80" fill="#ffffff10"/>
  <circle cx="60" cy="200" r="5" fill="#e2e8f0"/>
  <circle cx="736" cy="75" r="56" fill="#ffffff20"/>
  <text x="736" y="90" text-anchor="middle" font-size="32" font-weight="700" fill="#ffffff">${initials}</text>
  <text x="48" y="70" class="title">${fullName.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</text>
  <text x="48" y="98" class="sub">${roleLabel}</text>
  <text x="48" y="128" class="sub" fill="#cffafe" font-size="13">Medivault · Staff Identity</text>

  <text x="48" y="200" class="lbl">EMAIL</text>
  <text x="48" y="224" class="val">${profile.email.replace(/&/g,'&amp;')}</text>

  <text x="360" y="200" class="lbl">ROLE</text>
  <text x="360" y="224" class="val">${roleLabel}</text>

  <text x="48" y="278" class="lbl">PHONE</text>
  <text x="48" y="302" class="val">${(profile.phone ?? '—').replace(/&/g,'&amp;')}</text>

  <text x="360" y="278" class="lbl">MEMBER SINCE</text>
  <text x="360" y="302" class="val">${formatDate(profile.createdAt, 'long')}</text>

  <text x="48" y="356" class="lbl">ACCOUNT ID</text>
  <text x="48" y="378" class="val" style="font-family:monospace;font-size:14px">${profile.id}</text>

  <rect x="0" y="410" width="800" height="30" fill="#f8fafc"/>
  <text x="48" y="430" class="lbl" fill="#94a3b8">Medivault — Staff Identity Card · ${new Date().toLocaleDateString('en-IN')}</text>
</svg>`;

      const img = new Image();
      const encoded = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to render card'));
        img.src = encoded;
      });
      const canvas = document.createElement('canvas');
      canvas.width = 1600;
      canvas.height = 880;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 1600, 880);
      ctx.drawImage(img, 0, 0, 1600, 880);
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
      if (!blob) throw new Error('PNG encoding failed');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `staff-card-${profile.firstName.toLowerCase()}-${profile.lastName.toLowerCase()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* ─── The card ─────────────────────────────────────────────────── */}
      <div
        id={cardId}
        className="rounded-2xl border border-border shadow-sm overflow-hidden"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-cyan-800 to-teal-800 text-white px-6 py-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.25em] uppercase text-cyan-100/80">
              Medivault · Staff Identity
            </p>
            <h2 className="text-xl font-bold mt-0.5">{fullName}</h2>
            <p className="text-sm text-cyan-100/90 mt-0.5">
              {UserRoleLabels[profile.role] ?? profile.role}
            </p>
          </div>
          <div className="h-14 w-14 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
            {fullName.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)}
          </div>
        </div>

        {/* Body */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 px-6 py-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Email</p>
            <p className="text-sm font-medium mt-0.5 truncate">{profile.email}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Role</p>
            <div className="mt-0.5">
              <Badge variant={roleVariant[profile.role] ?? 'gray'}>
                {UserRoleLabels[profile.role] ?? profile.role}
              </Badge>
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Phone</p>
            <p className="text-sm font-medium mt-0.5">{profile.phone ?? '—'}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Organization</p>
            <p className="text-sm font-medium mt-0.5 font-mono text-xs">{profile.organizationId ?? '—'}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Member Since</p>
            <p className="text-sm font-medium mt-0.5">{formatDate(profile.createdAt, 'long')}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Security</p>
            <div className="flex flex-wrap gap-1 mt-0.5">
              <Badge variant={profile.mfaEnabled ? 'success' : 'gray'} dot>
                {profile.mfaEnabled ? 'MFA on' : 'MFA off'}
              </Badge>
            </div>
          </div>
        </div>

        {/* Footer strip */}
        <div className="border-t border-border px-6 py-3 bg-muted/40 flex items-center justify-between">
          <p className="text-xs font-mono text-muted-foreground truncate max-w-xs">
            ID: {profile.id}
          </p>
          <CreditCard className="h-4 w-4 text-muted-foreground/50" />
        </div>
      </div>

      {/* ─── Action buttons ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => void handleDownload()}
          disabled={downloading}
        >
          <Download className="h-3.5 w-3.5" />
          {downloading ? 'Downloading…' : 'Download Card'}
        </Button>
        <Button size="sm" variant="outline" onClick={handlePrint}>
          <Printer className="h-3.5 w-3.5" />
          Print Card
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Quick nav */}
      <div className="flex flex-wrap gap-2 pt-1 border-t border-border">
        <Button size="sm" asChild>
          <Link href="/dashboard">Go to Dashboard</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href="/patients">Patients</Link>
        </Button>
        {(profile.role === UserRole.ORG_ADMIN ||
          profile.role === UserRole.FACILITY_ADMIN ||
          profile.role === UserRole.SUPER_ADMIN) && (
          <Button variant="outline" size="sm" asChild>
            <Link href="/admin">Admin Panel</Link>
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const storeUser = useAuthStore((s) => s.user);
  const isPatient = !!storeUser?.role && PATIENT_ROLES.includes(storeUser.role);

  const {
    data: profile,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["users", "me", "profile"],
    queryFn: async () => {
      const res = await apiClient.get<UserProfile>("/users/me/profile");
      return res.data;
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (isError || !profile) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-muted-foreground">
          Could not load your profile.
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard">Back to Dashboard</Link>
        </Button>
      </div>
    );
  }

  const fullName = `${profile.firstName} ${profile.lastName}`;

  return (
    <div className="space-y-6">
      {/* ─── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar name={fullName} size="lg" />
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              {fullName}
              {profile.isEmailVerified && (
                <BadgeCheck
                  className="h-4 w-4 text-primary"
                  aria-label="Email verified"
                />
              )}
            </h1>
            <p className="text-sm text-muted-foreground">{profile.email}</p>
          </div>
        </div>
        <Badge variant={roleVariant[profile.role] ?? "gray"}>
          {UserRoleLabels[profile.role] ?? profile.role}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ─── Account details ─────────────────────────────────────────── */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              Account
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DetailRow icon={Mail} label="Email" value={profile.email} />
            <DetailRow
              icon={Phone}
              label="Phone"
              value={profile.phone ?? "—"}
            />
            <DetailRow
              icon={Building2}
              label="Organization"
              value={profile.organizationId ?? "—"}
            />
            {profile.hospital && (
              <DetailRow
                icon={Building2}
                label="Hospital / Clinic"
                value={profile.hospital}
              />
            )}
            <DetailRow
              icon={Shield}
              label="Member since"
              value={formatDate(profile.createdAt, "long")}
            />
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-muted p-1.5 mt-0.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Security</p>
                <div className="flex flex-wrap gap-1.5 mt-0.5">
                  <Badge variant={profile.mfaEnabled ? "success" : "gray"}>
                    {profile.mfaEnabled ? "MFA enabled" : "MFA off"}
                  </Badge>
                  <Badge
                    variant={profile.isEmailVerified ? "success" : "warning"}
                    dot
                  >
                    {profile.isEmailVerified
                      ? "Email verified"
                      : "Email not verified"}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ─── Patient section (PATIENT role only) ────────────────────── */}
        {isPatient ? (
          <PatientProfileSection />
        ) : (
          <div className="lg:col-span-2 space-y-4">
            <StaffProfileCard profile={profile} />
          </div>
        )}
      </div>

      {/* ─── Change password (all roles) ────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
            Change Password
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Update the password used to sign in to your Medivault account. For
            your security, all other active sessions will be signed out.
          </p>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Patient profile section ──────────────────────────────────────────────────
function PatientProfileSection() {
  const queryClient = useQueryClient();
  const {
    data: myPatient,
    isError: meError,
    isLoading: meLoading,
  } = useQuery({
    queryKey: ["patients", "me"],
    queryFn: async () => {
      const res = await apiClient.get<LinkedPatient | null>("/patients/me");
      return res.data;
    },
    staleTime: 60_000,
  });

  const patientId = myPatient?._id;

  const { data: medicalCard, refetch: refetchCard } = useQuery({
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

  const { data: summary } = useQuery({
    queryKey: ["patient", patientId, "medical-summary"],
    queryFn: async () => {
      const res = await apiClient.get<RecordSummary>(
        `/patients/${patientId}/medical-summary`,
      );
      return res.data;
    },
    enabled: !!patientId,
    staleTime: 60_000,
  });

  const { data: documents } = useQuery({
    queryKey: ["patient", patientId, "documents"],
    queryFn: async () => {
      const res = await apiClient.get<ProfileDocument[]>(
        `/patients/${patientId}/documents`,
      );
      return res.data;
    },
    enabled: !!patientId,
    staleTime: 60_000,
  });

  const [editingDetails, setEditingDetails] = React.useState(false);

  if (meLoading) {
    return (
      <div className="lg:col-span-2 space-y-4">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (meError || !myPatient) {
    return (
      <div className="lg:col-span-2">
        <Card>
          <CardContent className="p-8 flex flex-col items-center gap-3 text-center">
            <ClipboardList className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-medium">No user profile linked</p>
            <p className="text-sm text-muted-foreground max-w-md">
              Your account is not linked to a user record yet. Contact your
              healthcare provider to link your profile.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const p = myPatient;
  const totals = summary?.totals;

  // Derive MediVault ID from profileId (same logic as backend formatMvId)
  const mvId = toMvId(p.profileId);

  const groupedDocuments = groupDocuments(documents);

  const handleRefreshCard = () => {
    void queryClient.invalidateQueries({ queryKey: ["medical-profile", patientId] });
    void refetchCard();
  };

  const handleDownload = async (doc: ProfileDocument) => {
    const id = doc._id ?? doc.id;
    if (!id) return;
    try {
      const res = await apiClient.get<{ url: string }>(
        `/patients/${patientId}/documents/${id}/download-url`,
      );
      window.open(res.data.url, "_blank", "noopener,noreferrer");
    } catch {
      // ignore — files from storage providers may fail to open
    }
  };

  return (
    <div className="lg:col-span-2 space-y-5">
      {/* ─── MediVault Identity banner ────────────────────────────────── */}
      <div className="rounded-2xl border border-border overflow-hidden shadow-sm">
        {/* Gradient header */}
        <div className="bg-gradient-to-r from-cyan-800 to-teal-700 px-6 py-4 text-white">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.2em] uppercase text-cyan-100/80">
                Medivault · Patient Identity
              </p>
              <p className="text-xl font-bold mt-0.5">
                {p.firstName} {p.lastName}
              </p>
            </div>
            <div className="text-right">
              {mvId ? (
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-widest text-cyan-200/70">
                    MediVault ID
                  </p>
                  <p className="text-2xl font-black font-mono tracking-widest text-white mt-0.5">
                    {mvId}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-cyan-100/70">No ID assigned</p>
              )}
            </div>
          </div>
        </div>

        {/* Identity details row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 px-6 py-4 bg-white dark:bg-zinc-900">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">MRN</p>
            <p className="text-sm font-mono font-medium mt-0.5">{p.mrn}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Blood Group</p>
            <p className="text-sm font-bold text-red-600 dark:text-red-400 mt-0.5">{p.bloodGroup ?? '—'}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Date of Birth</p>
            <p className="text-sm font-medium mt-0.5">{formatDate(p.dateOfBirth, 'short')}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Gender</p>
            <p className="text-sm font-medium capitalize mt-0.5">{p.gender?.toLowerCase() ?? '—'}</p>
          </div>
        </div>

        {/* QR status strip */}
        {medicalCard && (
          <div className="border-t border-border px-6 py-3 bg-muted/30 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-sm">
              {medicalCard.qr.status === 'ACTIVE' ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-emerald-700 dark:text-emerald-400 font-medium">QR Active</span>
                  {medicalCard.qr.scanCount > 0 && (
                    <span className="text-muted-foreground text-xs">
                      · {medicalCard.qr.scanCount} scan{medicalCard.qr.scanCount === 1 ? '' : 's'}
                    </span>
                  )}
                </>
              ) : medicalCard.qr.status === 'REVOKED' ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  <span className="text-red-700 dark:text-red-400 font-medium">QR Revoked</span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/50" />
                  <span className="text-muted-foreground">No QR generated</span>
                </>
              )}
            </div>
            <div className="flex gap-2">
              <a
                href={`/verify/${medicalCard.qr.payloadUrl?.split('/verify/')[1] ?? ''}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`text-xs text-cyan-700 dark:text-cyan-400 hover:underline ${!medicalCard.qr.payloadUrl ? 'pointer-events-none opacity-50' : ''}`}
              >
                View public profile →
              </a>
            </div>
          </div>
        )}
      </div>

      {/* ─── Medical ID Card (QR, download, print) ───────────────────── */}
      {medicalCard && (
        <MedicalProfileCardView
          card={medicalCard}
          canManage={true}
          onRefresh={handleRefreshCard}
        />
      )}

      {/* ─── Visibility / Privacy Settings ───────────────────────────── */}
      {patientId && (
        <VisibilitySettingsPanel
          patientId={patientId}
          initialVisibility={medicalCard?.visibility ?? null}
          onSaved={handleRefreshCard}
        />
      )}

      {/* ─── Patient details ─────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Stethoscope className="h-3.5 w-3.5 text-muted-foreground" />
              Patient Details
            </CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditingDetails((v) => !v)}
            >
              <Pencil className="h-3.5 w-3.5 mr-1" />
              {editingDetails ? "Cancel" : "Edit"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <DetailRow icon={ClipboardList} label="MRN" value={p.mrn} />
          <DetailRow
            icon={Calendar}
            label="Date of birth"
            value={formatDate(p.dateOfBirth, "long")}
          />
          <DetailRow
            icon={User}
            label="Age"
            value={`${calculateAge(p.dateOfBirth)} years`}
          />
          <DetailRow
            icon={Shield}
            label="Blood group"
            value={p.bloodGroup ?? "—"}
          />
          <DetailRow icon={Phone} label="Phone" value={p.phoneNumber ?? "—"} />
          <DetailRow icon={Mail} label="Email" value={p.email ?? "—"} />
        </CardContent>
      </Card>

      {editingDetails && (
        <PatientSelfEditForm
          patient={p}
          onCancel={() => setEditingDetails(false)}
          onSaved={async () => {
            setEditingDetails(false);
            await queryClient.invalidateQueries({
              queryKey: ["patients", "me"],
            });
            await queryClient.invalidateQueries({
              queryKey: ["users", "me", "profile"],
            });
            await refetchCard();
          }}
        />
      )}

      {/* ─── Summary counts ──────────────────────────────────────────── */}
      {totals && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Fingerprint className="h-3.5 w-3.5 text-muted-foreground" />
              Medical Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              { label: "Encounters", value: totals.encounters },
              { label: "Diagnoses", value: totals.diagnoses },
              { label: "Prescriptions", value: totals.prescriptions },
              { label: "Lab reports", value: totals.labReports },
              { label: "Documents", value: totals.documents },
            ].map((t) => (
              <div
                key={t.label}
                className="rounded-lg border border-border p-3 text-center"
              >
                <p className="text-lg font-bold tabular-nums leading-none">
                  {t.value}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{t.label}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ─── Documents grouped by source hospital ────────────────────── */}
      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            Documents from all hospitals
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!documents?.length ? (
            <p className="text-sm text-muted-foreground italic">
              No documents have been uploaded yet.
            </p>
          ) : (
            <div className="space-y-4">
              {groupedDocuments.map(([hospital, docs]) => (
                <div key={hospital} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {hospital}
                    </p>
                    <span className="text-xs text-muted-foreground">
                      ({docs.length})
                    </span>
                  </div>
                  <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                    {docs.map((doc) => (
                      <div
                        key={doc._id}
                        className="flex items-center gap-3 px-3 py-2.5 bg-card"
                      >
                        <div className="rounded-md bg-muted p-1.5 flex-shrink-0">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {doc.originalName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {[
                              doc.category,
                              formatBytes(doc.sizeBytes),
                              formatDate(doc.createdAt, "relative"),
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                        <button
                          onClick={() => void handleDownload(doc)}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                          aria-label={`Download ${doc.originalName}`}
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button size="sm" asChild>
          <Link href="/my-records">View Full Record</Link>
        </Button>
      </div>
    </div>
  );
}
