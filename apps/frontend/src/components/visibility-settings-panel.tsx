'use client';

/**
 * VisibilitySettingsPanel
 *
 * Patient-controlled toggle panel for their public QR profile visibility.
 * The backend enforces all settings server-side — this component only provides
 * the UI for the patient to manage their own preferences.
 *
 * Usage:
 *   <VisibilitySettingsPanel patientId={patientId} initialVisibility={card?.visibility} />
 */

import * as React from 'react';
import {
  Eye,
  EyeOff,
  Lock,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VisibilityState {
  showName: boolean;
  showPhoto: boolean;
  showBloodType: boolean;
  showAllergies: boolean;
  showConditions: boolean;
  showEmergencyContact: boolean;
  showMedications: boolean;
}

const DEFAULT_VISIBILITY: VisibilityState = {
  showName: true,
  showPhoto: true,
  showBloodType: true,
  showAllergies: false,
  showConditions: false,
  showEmergencyContact: false,
  showMedications: false,
};

const VISIBILITY_FIELDS: Array<{
  key: keyof VisibilityState;
  label: string;
  description: string;
  alwaysPublicNote?: string;
}> = [
  {
    key: 'showName',
    label: 'Patient name',
    description: 'Display your full name on the public scan page.',
  },
  {
    key: 'showPhoto',
    label: 'Profile photo',
    description: 'Show your avatar / initials on the public scan page.',
  },
  {
    key: 'showBloodType',
    label: 'Blood type',
    description: 'Show your blood group — useful for emergency responders.',
  },
  {
    key: 'showAllergies',
    label: 'Allergies (all)',
    description:
      'Show the full list of your recorded allergies. Critical allergies are always shown.',
    alwaysPublicNote: 'Life-threatening allergies are always visible regardless of this setting.',
  },
  {
    key: 'showConditions',
    label: 'Medical conditions',
    description: 'Show your active medical conditions on the public profile.',
  },
  {
    key: 'showEmergencyContact',
    label: 'Emergency contact',
    description: 'Show your emergency contact name and phone number.',
  },
  {
    key: 'showMedications',
    label: 'Current medications',
    description: 'Show your active medications list.',
  },
];

// ─── Toggle ────────────────────────────────────────────────────────────────────

function VisibilityToggle({
  field,
  checked,
  onChange,
}: {
  field: (typeof VISIBILITY_FIELDS)[number];
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = `vis-toggle-${field.key}`;
  return (
    <label
      htmlFor={id}
      className="flex items-start gap-3 p-4 rounded-xl border border-border cursor-pointer hover:bg-accent/20 transition-colors group select-none"
    >
      {/* Toggle switch */}
      <button
        role="switch"
        aria-checked={checked}
        id={id}
        type="button"
        onClick={() => onChange(!checked)}
        className={`
          relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent
          transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2
          focus-visible:ring-primary focus-visible:ring-offset-2 mt-0.5
          ${checked ? 'bg-teal-600' : 'bg-muted-foreground/30'}
        `}
      >
        <span
          className={`
            pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-lg ring-0
            transition duration-200 ease-in-out
            ${checked ? 'translate-x-4' : 'translate-x-0'}
          `}
        />
      </button>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium">{field.label}</p>
          <Badge variant={checked ? 'success' : 'gray'}>
            {checked ? (
              <span className="flex items-center gap-1">
                <Eye className="h-3 w-3" /> Visible
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <EyeOff className="h-3 w-3" /> Hidden
              </span>
            )}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{field.description}</p>
        {field.alwaysPublicNote && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 flex-shrink-0" />
            {field.alwaysPublicNote}
          </p>
        )}
      </div>
    </label>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export interface VisibilitySettingsPanelProps {
  patientId: string;
  /** Seed the panel with existing settings from the loaded medical profile card. */
  initialVisibility?: Partial<VisibilityState> | null;
  /** Called after a successful save so the parent can refresh dependent queries. */
  onSaved?: () => void;
  /** Render in a compact collapsed-by-default mode (used in patient [id] admin view). */
  collapsible?: boolean;
}

export function VisibilitySettingsPanel({
  patientId,
  initialVisibility,
  onSaved,
  collapsible = false,
}: VisibilitySettingsPanelProps) {
  const queryClient = useQueryClient();

  const [open, setOpen] = React.useState(!collapsible);
  const [visibility, setVisibility] = React.useState<VisibilityState>({
    ...DEFAULT_VISIBILITY,
    ...(initialVisibility ?? {}),
  });
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Sync when initialVisibility prop changes (e.g. after parent refetch)
  React.useEffect(() => {
    if (initialVisibility) {
      setVisibility({ ...DEFAULT_VISIBILITY, ...initialVisibility });
    }
  }, [initialVisibility]);

  const handleChange = (key: keyof VisibilityState, value: boolean) => {
    setSaved(false);
    setVisibility((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await apiClient.patch(`/medical-profile/patients/${patientId}/visibility`, visibility);
      await queryClient.invalidateQueries({ queryKey: ['medical-profile', patientId] });
      setSaved(true);
      onSaved?.();
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (err instanceof Error ? err.message : 'Failed to save settings.');
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  // Count how many fields are currently visible
  const visibleCount = Object.values(visibility).filter(Boolean).length;

  return (
    <div className="rounded-2xl border border-border overflow-hidden">
      {/* Header */}
      <div
        className={`flex items-center justify-between px-5 py-4 bg-muted/30 border-b border-border ${
          collapsible ? 'cursor-pointer hover:bg-muted/50 transition-colors' : ''
        }`}
        onClick={collapsible ? () => setOpen((v) => !v) : undefined}
        role={collapsible ? 'button' : undefined}
        tabIndex={collapsible ? 0 : undefined}
        onKeyDown={
          collapsible ? (e) => e.key === 'Enter' && setOpen((v) => !v) : undefined
        }
        aria-expanded={collapsible ? open : undefined}
      >
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-teal-100 dark:bg-teal-900/20 p-1.5">
            <Lock className="h-4 w-4 text-teal-700 dark:text-teal-400" />
          </div>
          <div>
            <p className="text-sm font-semibold">Public Profile Visibility</p>
            <p className="text-xs text-muted-foreground">
              {visibleCount} of {VISIBILITY_FIELDS.length} fields visible on QR scan
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={visibleCount > 0 ? 'success' : 'gray'} dot>
            {visibleCount > 0 ? 'Partially public' : 'Fully private'}
          </Badge>
          {collapsible && (
            <span className="text-muted-foreground text-xs">{open ? '▲' : '▼'}</span>
          )}
        </div>
      </div>

      {open && (
        <div className="p-5 space-y-4">
          {/* Security notice */}
          <div className="flex items-start gap-3 rounded-xl bg-cyan-50 dark:bg-cyan-900/10 border border-cyan-200 dark:border-cyan-800 px-4 py-3">
            <ShieldCheck className="h-4 w-4 text-cyan-700 dark:text-cyan-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-cyan-800 dark:text-cyan-300">
              These settings control exactly what is shown to anyone who scans your QR code.{' '}
              <strong>Visibility is enforced on the server</strong> — hiding a field removes it
              completely from the public response, not just from the display.
            </p>
          </div>

          {/* Toggles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {VISIBILITY_FIELDS.map((field) => (
              <VisibilityToggle
                key={field.key}
                field={field}
                checked={visibility[field.key]}
                onChange={(v) => handleChange(field.key, v)}
              />
            ))}
          </div>

          {/* Feedback */}
          {error && (
            <p className="text-sm text-destructive flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              {error}
            </p>
          )}
          {saved && (
            <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Visibility settings saved.
            </p>
          )}

          {/* Save button */}
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Save visibility settings
                </>
              )}
            </Button>
            {collapsible && (
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
