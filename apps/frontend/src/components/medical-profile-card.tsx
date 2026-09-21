'use client';

import * as React from 'react';
import {
  AlertCircle,
  Download,
  Droplet,
  Fingerprint,
  Printer,
  QrCode,
  RefreshCw,
  ShieldBan,
  ShieldCheck,
} from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import { calculateAge, formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import type { MedicalProfileCard } from '@/lib/hooks/use-api';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toMvId(profileId: string | null): string | null {
  if (!profileId) return null;
  const clean = profileId.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length >= 8) return `MV-${clean.slice(0, 4)}-${clean.slice(4, 8)}`;
  return `MV-${clean}`;
}

function triggerDownload(name: string, src: string | Blob) {
  const url = typeof src === 'string' ? src : URL.createObjectURL(src);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (typeof src !== 'string') setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Rasterize computed SVG markup to a PNG blob (all content is data-URL safe). */
async function svgToPngBlob(svg: string, width = 1200): Promise<Blob> {
  const height = Math.round(width * 0.62);
  const img = new Image();
  const encoded = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  img.decoding = 'async';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to rasterize card image'));
    img.src = encoded;
  });
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not supported in this browser.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not encode card as PNG.');
  return blob;
}

function buildCardSvg(card: MedicalProfileCard, qrDataUrl: string): string {
  const p = card.patient;
  const fullName = `${p.firstName} ${p.lastName}`;
  const ec = card.emergencyContacts[0];
  const age = calculateAge(p.dateOfBirth);

  const allergyLine =
    card.allergies.length > 0
      ? card.allergies
          .slice(0, 4)
          .map((a) => `${a.allergen}${a.severity ? ` (${a.severity})` : ''}`)
          .join(', ')
      : 'None recorded';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="744" viewBox="0 0 1200 744">
  <defs>
    <linearGradient id="hdr" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#0e7490"/>
      <stop offset="100%" stop-color="#155e75"/>
    </linearGradient>
    <style>
      .title { font: 600 34px sans-serif; fill: #ffffff; letter-spacing: 4px; }
      .name { font: 700 46px sans-serif; fill: #ffffff; }
      .sub { font: 500 26px sans-serif; }
      .label { font: 600 22px sans-serif; fill: #64748b; letter-spacing: 1px; }
      .value { font: 600 30px sans-serif; fill: #0f172a; }
      .value-muted { font: 500 28px sans-serif; fill: #0f172a; }
      .mono { font-family: monospace; }
    </style>
  </defs>
  <rect width="1200" height="744" rx="36" fill="#ffffff"/>
  <rect width="1200" height="218" fill="url(#hdr)"/>
  <circle cx="1200" cy="218" r="140" fill="#00000010"/>
  <text x="48" y="86" class="title">MEDIVAULT</text>
  <text x="48" y="124" class="sub" fill="#cffafe">MEDICAL PROFILE CARD</text>
  <circle cx="996" cy="122" r="62" fill="#ffffff"/>
  <text x="996" y="146" text-anchor="middle" font-size="44" font-weight="700" fill="#0e7490">${initials(fullName)}</text>
  <text x="48" y="188" class="name">${escapeXml(fullName)}</text>
  <text x="48" y="64" class="mono" transform="none"></text>
  <text x="614" y="146" class="sub" fill="#e0f2fe" text-anchor="middle" font-family="monospace">ID ${p.profileId ?? ''}</text>
  <text x="614" y="182" class="sub" fill="#e0f2fe" text-anchor="middle" font-family="monospace">${p.mrn}</text>

  <g>
    <text x="48" y="300" class="label">NAME</text>
    <text x="48" y="334" class="value">${escapeXml(fullName)}</text>
    <text x="48" y="390" class="label">DATE OF BIRTH / AGE</text>
    <text x="48" y="424" class="value">${formatDate(p.dateOfBirth, 'short')} · ${age} yrs</text>
  </g>
  <g>
    <text x="420" y="300" class="label">GENDER</text>
    <text x="420" y="334" class="value">${escapeXml(p.gender)}</text>
    <text x="420" y="390" class="label">BLOOD GROUP</text>
    <text x="420" y="424" class="value">${p.bloodGroup ?? '—'}</text>
  </g>
  <g>
    <text x="780" y="300" class="label">PHONE</text>
    <text x="780" y="334" class="value">${escapeXml(p.phoneNumber ?? '—')}</text>
    <text x="780" y="390" class="label">PATIENT ID</text>
    <text x="780" y="424" class="value-muted mono" font-size="24">${p.profileId ?? '—'}</text>
  </g>

  <line x1="48" y1="470" x2="1152" y2="470" stroke="#e2e8f0" stroke-width="2"/>
  <text x="48" y="520" class="label">ALLERGIES</text>
  <text x="48" y="560" class="value-muted" font-size="26">${escapeXml(allergyLine)}</text>
  <text x="48" y="610" class="label">EMERGENCY CONTACT</text>
  <text x="48" y="648" class="value-muted" font-size="26">${ec ? `${escapeXml(ec.name)} · ${escapeXml(ec.relationship)} · ${escapeXml(ec.phone)}` : 'Not recorded'}</text>

  <rect x="880" y="480" width="248" height="248" rx="20" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
  <image x="892" y="492" width="224" height="224" href="${qrDataUrl}"/>
  <text x="1004" y="760" text-anchor="middle" class="label" fill="#64748b">Scan to verify</text>
</svg>`;
}

function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || 'P';
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Component ────────────────────────────────────────────────────────────────
export interface MedicalProfileCardProps {
  card: MedicalProfileCard;
  /** Authenticated user is allowed to manage (generate/regenerate/revoke) the QR. */
  canManage: boolean;
  /** Base64 PNG data URL from a freshly generated QR (higher fidelity than the re-render). */
  freshQrDataUrl?: string | null;
  /** Trigger to force-refetch card + status queries (called after generate/revoke). */
  onRefresh?: () => void;
}

export function MedicalProfileCardView({
  card,
  canManage,
  freshQrDataUrl,
  onRefresh,
}: MedicalProfileCardProps) {
  const p = card.patient;
  const fullName = `${p.firstName} ${p.lastName}`;
  const isActive = card.qr.status === 'ACTIVE';

  const [qrSrc, setQrSrc] = React.useState<string | null>(freshQrDataUrl ?? null);
  const [action, setAction] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Load the server-rendered QR PNG so the card is displayable even before any
  // fresh generation happened in this session.
  React.useEffect(() => {
    if (freshQrDataUrl) {
      setQrSrc(freshQrDataUrl);
      return;
    }
    if (!isActive) {
      setQrSrc(null);
      return;
    }
    let revoked = false;
    apiClient
      .get(`/medical-profile/patients/${p.id}/qr.png`, { responseType: 'blob' })
      .then((res) => {
        if (!revoked) setQrSrc(URL.createObjectURL(res.data as Blob));
      })
      .catch(() => {
        /* QR PNG may 404 if the code was revoked between fetches */
      });
    return () => {
      revoked = true;
    };
  }, [isActive, freshQrDataUrl, p.id]);

  const handleGenerate = async () => {
    setAction('generating');
    setError(null);
    try {
      const res = await apiClient.post<{ qrDataUrl: string; regenerated: boolean }>(
        `/medical-profile/patients/${p.id}/qr`,
        { baseUrl: window.location.origin },
      );
      setQrSrc(res.data.qrDataUrl);
      onRefresh?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate QR code.');
    } finally {
      setAction(null);
    }
  };

  const handleRevoke = async () => {
    if (!window.confirm('Revoking the QR code will invalidate it immediately. Continue?')) return;
    setAction('revoking');
    setError(null);
    try {
      await apiClient.post(`/medical-profile/patients/${p.id}/qr/revoke`);
      setQrSrc(null);
      onRefresh?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revoke QR code.');
    } finally {
      setAction(null);
    }
  };

  const handleDownloadQr = () => {
    if (!qrSrc) return;
    triggerDownload(`medical-card-qr-${p.mrn}.png`, qrSrc);
  };

  const handleDownloadCard = async () => {
    if (!qrSrc) return;
    setError(null);
    try {
      const blob = await svgToPngBlob(buildCardSvg(card, qrSrc), 1200);
      triggerDownload(`medical-card-${p.mrn}.png`, blob);
    } catch {
      setError('Could not generate the card image in this browser.');
    }
  };

  const handlePrint = () => {
    if (!qrSrc) return;
    const w = window.open('', '_blank', 'width=820,height=600');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>Medical Card — ${fullName}</title>
      <style>
        body{font-family:system-ui,sans-serif;margin:24px;color:#0f172a}
        .card{max-width:640px;border:1px solid #cbd5e1;border-radius:16px;overflow:hidden}
        .hdr{background:linear-gradient(90deg,#0e7490,#155e75);color:#fff;padding:24px;display:flex;justify-content:space-between;align-items:center}
        .hdr h1{margin:0;font-size:22px} .hdr .sub{opacity:.85;font-size:12px}
        .hdr .qr{width:120px;height:120px;background:#fff;border-radius:10px}
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:20px}
        .lbl{font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#64748b}
        .val{font-weight:600;font-size:15px;margin-top:2px}
        .full{grid-column:1 / -1}
        @media print{ body{margin:0} }
      </style></head><body onload="window.print()">${buildPrintHtml(card, qrSrc)}</body></html>`);
    w.document.close();
  };

  const criticalAllergy = card.allergies.find(
    (a) => ['HIGH', 'CRITICAL', 'SEVERE'].includes(a.severity?.toUpperCase() ?? ''),
  );
  const ec = card.emergencyContacts[0];

  return (
    <div className="space-y-6">
      {/* ─── The card ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border shadow-sm overflow-hidden" id="medical-card">
        {/* Header */}
        <div className="bg-gradient-to-r from-cyan-800 to-teal-800 text-white">
          <div className="flex items-center justify-between px-6 py-5">
            <div>
              <p className="text-xs font-semibold tracking-[0.25em] uppercase">
                Medivault
              </p>
              <p className="text-[11px] text-cyan-100/90 -mt-0.5">MEDICAL PROFILE CARD</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-bold">{fullName}</p>
                <div>
                  <p className="text-xs font-mono font-bold text-cyan-200 tracking-wider">
                    {toMvId(p.profileId) ?? p.profileId ?? '—'}
                  </p>
                  <p className="text-[10px] font-mono text-cyan-100/70">{p.mrn}</p>
                </div>
              </div>
              <Avatar name={fullName} size="md" />
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-white/15 px-6 py-3">
            <div className="flex items-center gap-2 text-sm">
              <ShieldCheck className="h-4 w-4 text-emerald-300" />
              <span className="font-medium">Verified medical profile</span>
            </div>
            {isActive ? (
              <Badge variant="success" dot>QR ACTIVE</Badge>
            ) : card.qr.status === 'REVOKED' ? (
              <Badge variant="destructive" dot>QR REVOKED</Badge>
            ) : (
              <Badge variant="gray" dot>NO QR</Badge>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5 px-6 py-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Name</p>
            <p className="text-base font-semibold mt-0.5">{fullName}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">DOB · Age</p>
            <p className="text-base font-semibold mt-0.5">
              {formatDate(p.dateOfBirth, 'short')} · {calculateAge(p.dateOfBirth)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Gender</p>
            <p className="text-base font-semibold mt-0.5 capitalize">{p.gender.toLowerCase()}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1"><Droplet className="h-3 w-3" />Blood Group</p>
            <p className="text-base font-bold text-red-600 dark:text-red-400 mt-0.5">{p.bloodGroup ?? '—'}</p>
          </div>
          <div className="col-span-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">MediVault ID</p>
            <p className="text-base font-bold mt-0.5 font-mono text-cyan-700 dark:text-cyan-400">
              {toMvId(p.profileId) ?? '—'}
            </p>
          </div>
          <div className="col-span-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Phone / Email</p>
            <p className="text-sm font-medium mt-0.5">
              {p.phoneNumber ?? '—'}
              {p.email ? ` · ${p.email}` : ''}
            </p>
          </div>
        </div>

        {/* Alerts + emergency contact */}
        <div className="border-t border-border px-6 py-4 space-y-3">
          {criticalAllergy ? (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 px-3 py-2">
              <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase tracking-wide">
                  Critical allergy
                </p>
                <p className="text-sm text-red-800 dark:text-red-300">
                  {criticalAllergy.allergen}
                  {criticalAllergy.reaction ? ` — ${criticalAllergy.reaction}` : ''} · {criticalAllergy.severity}
                </p>
              </div>
            </div>
          ) : null}

          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Allergies</p>
              <p className="text-sm mt-0.5 text-muted-foreground">
                {card.allergies.length
                  ? card.allergies.map((a) => a.allergen).join(', ')
                  : 'None recorded'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Emergency Contact</p>
              <p className="text-sm mt-0.5 text-muted-foreground">
                {ec ? `${ec.name} · ${ec.relationship} · ${ec.phone}` : 'Not recorded'}
              </p>
            </div>
          </div>
        </div>

        {/* QR strip */}
        {isActive && qrSrc && (
          <div className="flex items-center gap-5 border-t border-border px-6 py-5 bg-muted/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrSrc} alt={`QR code for ${fullName}`} className="h-36 w-36 rounded-lg border border-border bg-white p-1" />
            <div className="space-y-1">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <QrCode className="h-4 w-4 text-primary" />
                Scan to verify identity
              </p>
              <p className="text-xs text-muted-foreground">
                {card.qr.scanCount} scan{card.qr.scanCount === 1 ? '' : 's'}
                {card.qr.lastScannedAt
                  ? ` · last scanned ${formatDate(card.qr.lastScannedAt, 'short')}`
                  : ' · never scanned yet'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ─── Actions ──────────────────────────────────────────────────── */}
      {canManage && (
        <div className="flex flex-wrap items-center gap-2">
          {isActive ? (
            <>
              <Button size="sm" variant="outline" onClick={handleDownloadQr} disabled={!qrSrc}>
                <Download className="h-3.5 w-3.5" /> Download QR
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleDownloadCard()}
                disabled={!qrSrc}
              >
                <Download className="h-3.5 w-3.5" /> Download Card
              </Button>
              <Button size="sm" variant="outline" onClick={handlePrint} disabled={!qrSrc}>
                <Printer className="h-3.5 w-3.5" /> Print Card
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleGenerate()}
                loading={action === 'generating'}
              >
                <RefreshCw className="h-3.5 w-3.5" /> Regenerate QR
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => void handleRevoke()}
                loading={action === 'revoking'}
                className="ml-auto"
              >
                <ShieldBan className="h-3.5 w-3.5" /> Revoke QR
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              onClick={() => void handleGenerate()}
              loading={action === 'generating'}
            >
              <QrCode className="h-3.5 w-3.5" /> Generate QR Code
            </Button>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}

      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Fingerprint className="h-3 w-3" />
        The QR code contains no medical data — it only verifies this profile to an authorized sign-in.
      </p>
    </div>
  );
}

function buildPrintHtml(card: MedicalProfileCard, qrDataUrl: string): string {
  const p = card.patient;
  const fullName = `${p.firstName} ${p.lastName}`;
  const criticalAllergy = card.allergies.find(
    (a) => ['HIGH', 'CRITICAL', 'SEVERE'].includes(a.severity?.toUpperCase() ?? ''),
  );
  const ec = card.emergencyContacts[0];

  return `<div class="card">
    <div class="hdr">
      <div>
        <h1>MEDIVAULT · MEDICAL PROFILE CARD</h1>
        <p class="sub">${escapeXml(fullName)} · ${escapeXml(p.mrn)}</p>
        <p class="sub">ID ${escapeXml(p.profileId ?? '')} · ${escapeXml(p.gender)} · ${escapeXml(p.bloodGroup ?? '—')}</p>
      </div>
      <img class="qr" src="${qrDataUrl}" alt="QR"/>
    </div>
    <div class="grid">
      <div><div class="lbl">Date of birth</div><div class="val">${formatDate(p.dateOfBirth, 'short')} (age ${calculateAge(p.dateOfBirth)})</div></div>
      <div><div class="lbl">Phone</div><div class="val">${escapeXml(p.phoneNumber ?? '—')}</div></div>
      <div class="full"><div class="lbl">Allergies</div><div class="val">${card.allergies.length ? card.allergies.map((a) => escapeXml(a.allergen + (a.severity ? ` (${a.severity})` : ''))).join(', ') : 'None recorded'}</div></div>
      ${criticalAllergy ? `<div class="full"><div class="lbl">Critical allergy</div><div class="val">${escapeXml(criticalAllergy.allergen)}</div></div>` : ''}
      <div class="full"><div class="lbl">Emergency contact</div><div class="val">${ec ? `${escapeXml(ec.name)} (${escapeXml(ec.relationship)}) · ${escapeXml(ec.phone)}` : 'Not recorded'}</div></div>
    </div>
  </div>`;
}