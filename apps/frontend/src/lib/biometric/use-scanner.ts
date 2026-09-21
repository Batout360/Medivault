'use client';

import * as React from 'react';
import {
  BiometricScannerClient,
  biometricScanner,
  BridgeStatus,
  CapturedData,
  EnrollResult,
  MatchResult,
  ScannerState,
} from './scanner-client';

export type ScannerConnectionState =
  | 'connecting' // attempting to reach the local bridge
  | 'connected' // bridge reachable (scanner may or may not be ready)
  | 'no_device' // bridge reachable but no scanner detected
  | 'disconnected'; // bridge unreachable

export type ScannerStatus = 'idle' | 'scanning' | 'enrolling' | 'captured' | 'matched' | 'no_match' | 'error';

export interface UseScannerResult {
  /** Whether the local bridge is reachable */
  connectionState: ScannerConnectionState;
  /** Latest bridge status (scanner name, id, ready, etc.) */
  bridgeStatus: BridgeStatus | null;
  /** Whether the scanner is connected and ready */
  isScannerReady: boolean;
  /** Current operation status */
  status: ScannerStatus;
  /** Latest scanner state broadcast from the bridge (finger progress, etc.) */
  scannerState: ScannerState | null;
  /** Latest capture quality (0–100) when known */
  quality: number | null;
  /** "Place finger now" hint driven by finger_detected broadcasts */
  fingerDetected: boolean;
  /** Last captured template (set after a successful capture) */
  currentCapture: CapturedData | null;
  /** Error message from last failed operation */
  error: string | null;
  /** Whether a capture is in progress */
  scanning: boolean;
  /** Trigger a fingerprint capture */
  capture: () => Promise<CapturedData>;
  /** Multi-sample enrollment */
  enroll: (samples?: number) => Promise<EnrollResult>;
  /** 1:1 verification against a reference template */
  verify: (referenceTemplate: { templatePayload: string; format: string } | null) => Promise<MatchResult>;
  /** 1:N identification (bridge captures only; backend matches) */
  identify: () => Promise<MatchResult>;
  /** Start an interactive capture that streams scanner state events */
  startCapture: () => Promise<void>;
  /** Cancel an interactive capture */
  stopCapture: () => Promise<void>;
  /** Re-detect connected scanners */
  refresh: () => Promise<void>;
  /** Connect to the bridge (starts automatically) */
  connect: () => void;
  /** Manually disconnect from the bridge */
  disconnect: () => void;
}

/**
 * Hook to control the local fingerprint scanner via the biometric bridge.
 *
 * Usage:
 *   const scanner = useScanner();
 *   const template = await scanner.capture();
 *   // forward template to backend /biometric/identify (or /enroll)
 */
export function useScanner(client: BiometricScannerClient = biometricScanner): UseScannerResult {
  const [connectionState, setConnectionState] = React.useState<ScannerConnectionState>(
    client.isConnected ? 'connected' : 'connecting',
  );
  const [bridgeStatus, setBridgeStatus] = React.useState<BridgeStatus | null>(null);
  const [status, setStatus] = React.useState<ScannerStatus>('idle');
  const [scannerState, setScannerState] = React.useState<ScannerState | null>(null);
  const [quality, setQuality] = React.useState<number | null>(null);
  const [fingerDetected, setFingerDetected] = React.useState(false);
  const [currentCapture, setCurrentCapture] = React.useState<CapturedData | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const unsubscribe = client.subscribe((event) => {
      if (event.type === 'status') {
        setBridgeStatus(event.data);
        if (event.data.connected && event.data.ready) {
          setConnectionState('connected');
          setError(null);
        } else if (event.data.connected) {
          setConnectionState('no_device');
          setError(event.data.error ?? 'No fingerprint scanner detected.');
        } else {
          setConnectionState('no_device');
        }
      } else if (event.type === 'state') {
        setScannerState(event.state);
        switch (event.state) {
          case 'capturing':
            setStatus('scanning');
            setError(null);
            break;
          case 'finger_detected':
            setFingerDetected(true);
            break;
          case 'finger_removed':
            setFingerDetected(false);
            break;
          case 'captured':
            setFingerDetected(false);
            setStatus('idle');
            break;
          case 'match_found':
            setStatus('matched');
            break;
          case 'no_match':
            setStatus('no_match');
            break;
          case 'enrollment_sample':
          case 'enrollment_complete':
            setStatus('enrolling');
            break;
          case 'capture_failed':
          case 'error':
            setStatus('error');
            setFingerDetected(false);
            break;
          default:
            break;
        }
      }
    });

    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  // Track whether this effect invocation has been cleaned up (StrictMode-safe).
  const mountedRef = React.useRef(false);

  React.useEffect(() => {
    mountedRef.current = true;

    client.connect();

    const timer = setInterval(() => {
      if (!client.isConnected && mountedRef.current) {
        setConnectionState((prev) => (prev === 'disconnected' ? prev : 'connecting'));
      }
    }, 2000);

    const deferredDisconnectRef: {
      handle: ReturnType<typeof setTimeout> | undefined;
    } = { handle: undefined };

    return () => {
      mountedRef.current = false;
      clearInterval(timer);
      clearTimeout(deferredDisconnectRef.handle);
      deferredDisconnectRef.handle = setTimeout(() => {
        if (!mountedRef.current) {
          client.disconnect();
        }
      }, 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  const capture = React.useCallback(async () => {
    setStatus('scanning');
    setCurrentCapture(null);
    setError(null);
    setScannerState('capturing');

    try {
      await client.refresh().catch(() => null);

      if (client.isConnected) {
        const data = await client.capture();
        setStatus('captured');
        setCurrentCapture(data);
        setQuality(data.quality);
        return data;
      }

      setStatus('error');
      setError('Biometric bridge is not connected. Start the bridge and reconnect the scanner.');
      throw new Error('Biometric bridge is not connected');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Fingerprint capture failed');
      throw err;
    }
  }, [client]);

  const enroll = React.useCallback(
    async (samples = 3) => {
      setStatus('enrolling');
      setCurrentCapture(null);
      setError(null);

      try {
        await client.refresh().catch(() => null);
        const result = await client.enroll(samples);
        if (result.templatePayload && result.quality) {
          setQuality(result.quality);
        }
        setStatus('idle');
        return result;
      } catch (err) {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Enrollment failed');
        throw err;
      }
    },
    [client],
  );

  const verify = React.useCallback(
    async (referenceTemplate: { templatePayload: string; format: string } | null) => {
      setStatus('scanning');
      setError(null);
      try {
        await client.refresh().catch(() => null);
        const result = await client.verify(referenceTemplate);
        setStatus(result.matched ? 'matched' : 'no_match');
        if (result.captured?.quality) setQuality(result.captured.quality);
        return result;
      } catch (err) {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Verification failed');
        throw err;
      }
    },
    [client],
  );

  const identify = React.useCallback(async () => {
    setStatus('scanning');
    setError(null);
    try {
      await client.refresh().catch(() => null);
      const result = await client.identify();
      setStatus(result.matched ? 'matched' : 'no_match');
      if (result.captured?.quality) setQuality(result.captured.quality);
      return result;
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Identification failed');
      throw err;
    }
  }, [client]);

  const startCapture = React.useCallback(async () => {
    setStatus('scanning');
    setError(null);
    try {
      await client.refresh().catch(() => null);
      await client.startCapture();
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Capture could not start');
      throw err;
    }
  }, [client]);

  const stopCapture = React.useCallback(async () => {
    await client.stopCapture().catch(() => undefined);
    setFingerDetected(false);
    setStatus('idle');
  }, [client]);

  const refresh = React.useCallback(async () => {
    try {
      client.connect();
      const statusData = await client.refresh();
      setBridgeStatus(statusData);
      setConnectionState(statusData.ready ? 'connected' : 'no_device');
    } catch {
      setConnectionState('disconnected');
    }
  }, [client]);

  const connect = React.useCallback(() => client.connect(), [client]);
  const disconnect = React.useCallback(() => client.disconnect(), [client]);

  const isScannerReady =
    bridgeStatus?.connected === true &&
    bridgeStatus?.ready === true &&
    connectionState === 'connected';

  return {
    connectionState,
    bridgeStatus,
    isScannerReady,
    status,
    scannerState,
    quality,
    fingerDetected,
    currentCapture,
    error,
    scanning: status === 'scanning' || status === 'enrolling',
    capture,
    enroll,
    verify,
    identify,
    startCapture,
    stopCapture,
    refresh,
    connect,
    disconnect,
  };
}