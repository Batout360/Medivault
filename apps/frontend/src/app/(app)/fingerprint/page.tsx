'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Fingerprint,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RotateCcw,
  ArrowRight,
  Shield,
  WifiOff,
  Info,
  Loader2,
  Usb,
  RefreshCw,
} from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { apiClient } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { useScanner } from '@/lib/biometric/use-scanner';
import type { CapturedData } from '@/lib/biometric/scanner-client';

// ─── Scanner States ────────────────────────────────────────────────────────────
type ScanState =
  | 'idle' // Waiting for scan
  | 'scanning' // Actively scanning
  | 'processing' // Template captured — sending to backend for matching
  | 'found' // Match found — patient ID returned
  | 'not_found' // No match
  | 'error' // Error during scan or match
  | 'enrolling' // Biometric enrollment mode
  | 'enrolled'; // Enrollment complete

// ─── API response types ───────────────────────────────────────────────────────
interface IdentifyResponse {
  matched: boolean;
  patientId?: string;
  confidence?: number;
  message?: string;
}

interface EnrollResponse {
  success: boolean;
  quality?: number;
  templateType?: string;
  message?: string;
}

// ─── Animated fingerprint SVG icon ────────────────────────────────────────────
function FingerprintIcon({
  state,
  className,
}: {
  state: ScanState;
  className?: string;
}) {
  const isScanning = state === 'scanning' || state === 'processing';
  const isFound = state === 'found' || state === 'enrolled';
  const isError = state === 'not_found' || state === 'error';

  return (
    <div
      className={cn(
        'relative flex items-center justify-center transition-all duration-500',
        className,
      )}
    >
      {/* Pulse rings when scanning */}
      {isScanning && (
        <>
          <span className="absolute inline-flex h-40 w-40 animate-ping rounded-full bg-primary/20 opacity-75" />
          <span
            className="absolute inline-flex h-32 w-32 animate-ping rounded-full bg-primary/15 opacity-50"
            style={{ animationDelay: '300ms' }}
          />
        </>
      )}

      {/* Main icon */}
      <div
        className={cn(
          'relative flex h-28 w-28 items-center justify-center rounded-full transition-all duration-500',
          state === 'idle' && 'bg-muted',
          isScanning && 'bg-primary/10 ring-4 ring-primary/30',
          isFound && 'bg-emerald-100 dark:bg-emerald-900/30',
          isError && 'bg-red-100 dark:bg-red-900/20',
          state === 'enrolling' && 'bg-violet-100 dark:bg-violet-900/30',
        )}
      >
        {state === 'found' || state === 'enrolled' ? (
          <CheckCircle className="h-14 w-14 text-emerald-600 dark:text-emerald-400" />
        ) : state === 'not_found' ? (
          <XCircle className="h-14 w-14 text-red-600 dark:text-red-400" />
        ) : state === 'error' ? (
          <AlertTriangle className="h-14 w-14 text-amber-600 dark:text-amber-400" />
        ) : (
          <Fingerprint
            className={cn(
              'h-14 w-14 transition-colors duration-300',
              state === 'idle' && 'text-muted-foreground/40',
              isScanning && 'text-primary',
              state === 'enrolling' && 'text-violet-600 dark:text-violet-400',
            )}
          />
        )}
      </div>
    </div>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────
function ScanProgress({ active }: { active: boolean }) {
  const [progress, setProgress] = React.useState(0);

  React.useEffect(() => {
    if (!active) {
      setProgress(0);
      return;
    }
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 90) return p;
        return p + Math.random() * 12;
      });
    }, 300);
    return () => clearInterval(interval);
  }, [active]);

  if (!active && progress === 0) return null;

  return (
    <div
      className="w-full max-w-xs mx-auto"
      role="progressbar"
      aria-valuenow={Math.round(progress)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Scanning progress"
    >
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
          style={{ width: `${Math.min(progress, 90)}%` }}
        />
      </div>
    </div>
  );
}

// ─── Status message ───────────────────────────────────────────────────────────
function StatusMessage({ state }: { state: ScanState }) {
  const messages: Record<
    ScanState,
    { title: string; description: string; color: string }
  > = {
    idle: {
      title: 'Ready to scan',
      description: 'Place your finger on the scanner to begin identification',
      color: 'text-muted-foreground',
    },
    scanning: {
      title: 'Scanning…',
      description: 'Hold your finger steady on the scanner',
      color: 'text-primary',
    },
    processing: {
      title: 'Verifying fingerprint…',
      description: 'Matching against biometric database',
      color: 'text-primary',
    },
    found: {
      title: 'User found',
      description: 'Fingerprint matched successfully',
      color: 'text-emerald-600 dark:text-emerald-400',
    },
    not_found: {
      title: 'No match found',
      description: 'Fingerprint could not be matched in the database',
      color: 'text-red-600 dark:text-red-400',
    },
    error: {
      title: 'Scan error',
      description: 'An error occurred. Please try again.',
      color: 'text-amber-600 dark:text-amber-400',
    },
    enrolling: {
      title: 'Enrollment mode',
      description: 'Scan the user\u2019s fingerprint to enroll',
      color: 'text-violet-600 dark:text-violet-400',
    },
    enrolled: {
      title: 'Enrollment complete',
      description: 'Fingerprint enrolled successfully',
      color: 'text-emerald-600 dark:text-emerald-400',
    },
  };

  const msg = messages[state];

  return (
    <div className="text-center">
      <p className={cn('text-base font-semibold', msg.color)}>{msg.title}</p>
      <p className="text-sm text-muted-foreground mt-1">{msg.description}</p>
    </div>
  );
}

// ─── Scanner device status badge ─────────────────────────────────────────────
interface ScannerDeviceBadgeProps {
  isConnecting: boolean;
  isConnected: boolean;
  scannerName: string | null;
  onRefresh: () => void;
}

function ScannerDeviceBadge({
  isConnecting,
  isConnected,
  scannerName,
  onRefresh,
}: ScannerDeviceBadgeProps) {
  if (isConnecting) {
    return (
      <Badge variant="warning" dot>
        <Loader2 className="h-3 w-3 animate-spin mr-1" />
        Connecting to scanner…
      </Badge>
    );
  }

  if (isConnected) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="success" dot>
          <Usb className="h-3 w-3 mr-1" />
          Scanner connected
        </Badge>
        <span className="text-xs text-muted-foreground max-w-[200px] truncate">
          {scannerName ?? ''}
        </span>
        <Button variant="ghost" size="icon-sm" onClick={onRefresh} aria-label="Re-detect scanner">
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Badge variant="destructive" dot>
        <WifiOff className="h-3 w-3 mr-1" />
        Scanner not connected
      </Badge>
      <Button variant="ghost" size="icon-sm" onClick={onRefresh} aria-label="Re-detect scanner">
        <RefreshCw className="h-3 w-3" />
      </Button>
    </div>
  );
}

// ─── Fingerprint Page ─────────────────────────────────────────────────────────
export default function FingerprintPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const enrollPatientId = searchParams.get('enroll');
  const isEnrollMode = !!enrollPatientId;

  // Real scanner via local biometric bridge
  const {
    connectionState,
    bridgeStatus,
    isScannerReady,
    capture: captureFromScanner,
    enroll: enrollFromScanner,
    refresh: refreshScanner,
    error: scannerError,
    fingerDetected,
    quality: captureQuality,
    scannerState,
  } = useScanner();

  const [scanState, setScanState] = React.useState<ScanState>(
    isEnrollMode ? 'enrolling' : 'idle',
  );
  const [retryCount, setRetryCount] = React.useState(0);
  const [matchedPatient, setMatchedPatient] = React.useState<IdentifyResponse | null>(null);
  const MAX_RETRIES = 3;

  // Live scanner progress hints (bridge state broadcasts)
  const isCapturingLive =
    connectionState === 'connected' &&
    isScannerReady &&
    (scannerState === 'capturing' || scanState === 'scanning');

  // ─── Identify mutation ─────────────────────────────────────────────────────
  const identifyMutation = useMutation({
    mutationFn: async (template: CapturedData) => {
      const res = await apiClient.post<IdentifyResponse>('/biometric/identify', {
        templatePayload: template.templatePayload,
        format: template.format,
        quality: template.quality,
        deviceId: template.deviceId,
        capturedAt: template.capturedAt,
        bridgeSignature: template.bridgeSignature,
      });
      return res.data;
    },
    onSuccess: (data) => {
      if (!data.matched) {
        setMatchedPatient(null);
        setScanState('not_found');
        return;
      }
      setMatchedPatient(data);
      setScanState('found');
    },
    onError: (err: unknown) => {
      const message = isErrorLike(err) ? err.message : 'Identification failed';
      if (message.toLowerCase().includes('no match') || message.toLowerCase().includes('not found')) {
        setScanState('not_found');
      } else {
        setScanState('error');
      }
    },
  });

  // ─── Enroll mutation ───────────────────────────────────────────────────────
  const enrollMutation = useMutation({
    mutationFn: async (template: CapturedData) => {
      const res = await apiClient.post<EnrollResponse>('/biometric/enroll', {
        patientId: enrollPatientId,
        templateType: 'FINGERPRINT',
        templatePayload: template.templatePayload,
        format: template.format,
        quality: template.quality,
        deviceId: template.deviceId,
        capturedAt: template.capturedAt,
        bridgeSignature: template.bridgeSignature,
      });
      return res.data;
    },
    onSuccess: () => {
      setScanState('enrolled');
      toast.success('Fingerprint enrolled successfully');
    },
    onError: (err: unknown) => {
      setScanState('error');
      const msg = isErrorLike(err) ? err.message : 'Enrollment failed';
      toast.error(msg);
    },
  });

  // ─── Check scanner readiness on mount ──────────────────────────────────────
  React.useEffect(() => {
    void refreshScanner();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Handle scan button ────────────────────────────────────────────────────
  const handleScan = async () => {
    if (!isScannerReady) {
      toast.error(
        'No fingerprint scanner connected. Start the biometric bridge service and connect the scanner via USB.',
      );
      return;
    }

    setScanState('scanning');

    try {
      if (isEnrollMode) {
        // Real hardware: multi-sample enrollment through the bridge.
        const result = await enrollFromScanner(3);
        if (!result.success) {
          throw new Error(result.message ?? 'Enrollment failed');
        }
        setScanState('processing');
        await enrollMutation.mutateAsync({
          templatePayload: result.templatePayload ?? '',
          format: result.format ?? 'ISO_19794_2',
          quality: result.quality,
          deviceId: result.deviceId ?? 'MFS100',
          capturedAt: result.capturedAt ?? new Date().toISOString(),
          bridgeSignature: result.bridgeSignature,
        });
        return;
      }

      // Identification: capture from the real scanner via the bridge, then
      // let the backend match.
      const template = await captureFromScanner();

      setScanState('processing');
      await identifyMutation.mutateAsync(template);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Scan failed';
      // Transient scan errors (finger removed, no finger) → return to ready
      setScanState('idle');
      toast.error(message);
    }
  };

  const handleReset = () => {
    setScanState(isEnrollMode ? 'enrolling' : 'idle');
    setMatchedPatient(null);
    setRetryCount((c) => c + 1);
    identifyMutation.reset();
    enrollMutation.reset();
  };

  const isScanning = scanState === 'scanning' || scanState === 'processing';
  const isDone =
    scanState === 'found' ||
    scanState === 'not_found' ||
    scanState === 'error' ||
    scanState === 'enrolled';
  const canRetry = isDone && retryCount < MAX_RETRIES;
  const canScan = isScannerReady;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* ─── Header ──────────────────────────────────────────────────── */}
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold">
          {isEnrollMode ? 'Fingerprint Enrollment' : 'User Identification'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isEnrollMode
            ? "Register the user's fingerprint for future identification"
            : 'Identify a user using their fingerprint biometric'}
        </p>
      </div>

      {/* ─── Device status ────────────────────────────────────────────── */}
      <div className="flex items-center justify-center gap-2 min-h-[32px]">
        <ScannerDeviceBadge
          isConnecting={connectionState === 'connecting'}
          isConnected={isScannerReady}
          scannerName={bridgeStatus?.scannerName ?? null}
          onRefresh={() => void refreshScanner()}
        />
      </div>

      {/* ─── Main scanner card ────────────────────────────────────────── */}
      <Card
        className={cn(
          'transition-all duration-500',
          scanState === 'found' || scanState === 'enrolled'
            ? 'border-emerald-200 dark:border-emerald-800'
            : '',
          scanState === 'not_found' || scanState === 'error'
            ? 'border-red-200 dark:border-red-800'
            : '',
        )}
      >
        <CardContent className="p-8 flex flex-col items-center gap-8">
          {/* Fingerprint animation */}
          <FingerprintIcon state={scanState} className="h-44 w-44" />

          {/* Status text */}
          <StatusMessage state={scanState} />

          {/* Live finger hint from bridge state broadcasts */}
          {isCapturingLive && (
            <div
              className={cn(
                'flex items-center gap-2 text-sm font-medium transition-opacity',
                fingerDetected ? 'text-emerald-600 dark:text-emerald-400' : 'text-primary',
              )}
              role="status"
            >
              {fingerDetected ? (
                <>
                  <Fingerprint className="h-4 w-4" />
                  Finger detected — hold steady
                </>
              ) : (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Place finger on the scanner…
                </>
              )}
            </div>
          )}

          {/* Capture quality readout */}
          {captureQuality != null && (scanState === 'found' || scanState === 'enrolled' || scanState === 'processing') && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              Capture quality: {captureQuality}%
            </p>
          )}

          {/* Progress bar */}
          <ScanProgress active={isScanning} />

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-xs">
            {scanState === 'idle' || scanState === 'enrolling' ? (
              <Button
                size="xl"
                className="w-full"
                onClick={() => void handleScan()}
                disabled={!canScan || isScanning}
                aria-label="Start fingerprint scan"
              >
                <Fingerprint className="h-5 w-5" />
                {isEnrollMode ? 'Start Enrollment' : 'Scan Fingerprint'}
              </Button>
            ) : isScanning ? (
              <Button size="xl" className="w-full" disabled>
                <Loader2 className="h-5 w-5 animate-spin" />
                {scanState === 'scanning' ? 'Scanning…' : 'Matching…'}
              </Button>
            ) : null}

            {/* Retry button after failure */}
            {(scanState === 'not_found' || scanState === 'error') && canRetry && (
              <div className="flex flex-col items-center gap-2 w-full">
                <Button
                  size="xl"
                  className="w-full"
                  onClick={() => void handleScan()}
                >
                  <Fingerprint className="h-5 w-5" />
                  Try Again
                </Button>
                <Button variant="ghost" size="sm" onClick={handleReset}>
                  <RotateCcw className="h-4 w-4" />
                  Reset
                </Button>
                <p className="text-xs text-muted-foreground">
                  Attempt {retryCount + 1} of {MAX_RETRIES + 1}
                </p>
              </div>
            )}

            {retryCount >= MAX_RETRIES && isDone && scanState !== 'found' && (
              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                  Maximum retry attempts reached.
                </p>
                <Button
                  variant="outline"
                  onClick={() => router.push('/patients')}
                >
                  Search Manually
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ─── FOUND: Show confirmation — NOT the full record ─────────────
           Per the spec: fingerprint → identify → authorize → records.
           We show only the user ID here and require navigating to
           the patient profile (which enforces its own authorization).
      ────────────────────────────────────────────────────────────────── */}
      {scanState === 'found' && matchedPatient && (
        <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/5">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
                <CheckCircle className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="font-semibold text-emerald-800 dark:text-emerald-300">
                  User Identified
                </p>
                <p className="text-sm text-emerald-700/80 dark:text-emerald-400/80">
                  Confidence: {Math.round(matchedPatient.confidence ?? 0)}%
                </p>
              </div>
            </div>

            <div className="rounded-lg bg-white/80 dark:bg-black/20 border border-emerald-100 dark:border-emerald-800 p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                User ID
              </p>
              <p className="text-lg font-mono font-bold mt-1">
                {matchedPatient.patientId}
              </p>
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                <Shield className="h-3 w-3" />
                Full records require authorization. Access is logged.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <Button className="flex-1" asChild>
                <Link href={`/patients/${matchedPatient.patientId}`}>
                  View User Record
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button variant="outline" onClick={handleReset}>
                Scan Another
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── ENROLLED: Confirm enrollment ─────────────────────────────── */}
      {scanState === 'enrolled' && (
        <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/5">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-emerald-600" />
              <p className="font-semibold text-emerald-800 dark:text-emerald-300">
                Fingerprint enrolled successfully
              </p>
            </div>
            <div className="flex gap-2">
              {enrollPatientId && (
                <Button asChild>
                  <Link href={`/patients/${enrollPatientId}`}>
                    View User Profile
                  </Link>
                </Button>
              )}
              <Button variant="outline" onClick={handleReset}>
                Enroll Another Finger
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── NOT FOUND state ──────────────────────────────────────────── */}
      {scanState === 'not_found' && !canRetry && (
        <Card className="border-amber-200 dark:border-amber-800">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-800 dark:text-amber-300">
                  User not found
                </p>
                <p className="text-sm text-amber-700/80 dark:text-amber-400/80">
                  The fingerprint could not be matched. The user may not be
                  registered, or their fingerprint may not be enrolled.
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" asChild>
                <Link href="/patients">Search by Name / ID</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/patients/new">Register New User</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Scanner not connected warning ────────────────────────────── */}
      {!canScan && connectionState === 'disconnected' && (
        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/5">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-start gap-3">
              <Info className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  Fingerprint scanner not detected
                </p>
                <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-1">
                  Start the Medivault Biometric Bridge on this workstation and
                  connect the fingerprint scanner via USB.
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <Button size="sm" variant="outline" onClick={() => void refreshScanner()}>
                    <RefreshCw className="h-3.5 w-3.5 mr-1" />
                    Re-detect scanner
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    asChild
                  >
                    <Link href="/fingerprint/help">Need help?</Link>
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Bridge error warning ─────────────────────────────────────── */}
      {scannerError && connectionState !== 'disconnected' && !isScanning && scanState === 'idle' && (
        <Card className="border-amber-200 dark:border-amber-800">
          <CardContent className="p-4">
            <p className="text-xs text-amber-700 dark:text-amber-400">{scannerError}</p>
          </CardContent>
        </Card>
      )}

      {/* ─── Security note ────────────────────────────────────────────── */}
      <p className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1.5">
        <Shield className="h-3.5 w-3.5" />
        All biometric scans are logged. Templates are encrypted at rest; raw
        fingerprint images are never stored.
      </p>
    </div>
  );
}

function isErrorLike(err: unknown): err is { message: string } {
  return typeof err === 'object' && err !== null && 'message' in err;
}