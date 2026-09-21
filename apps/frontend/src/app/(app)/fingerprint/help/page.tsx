'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Fingerprint,
  Plug,
  Shield,
  TerminalSquare,
  Usb,
  Wifi,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// ─── Prerequisite row ─────────────────────────────────────────────────────────
function Requirement({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-muted">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <div className="text-sm text-muted-foreground mt-0.5 space-y-1">{children}</div>
      </div>
    </div>
  );
}

// ─── Code block ───────────────────────────────────────────────────────────────
function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{children}</code>
  );
}

export default function FingerprintHelpPage() {
  const [showWarnings, setShowWarnings] = React.useState(false);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/fingerprint" className="flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" />
            Back to Scanner
          </Link>
        </Button>
      </div>

      <div className="space-y-1">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Fingerprint className="h-6 w-6" />
          Fingerprint Scanner Setup
        </h1>
        <p className="text-sm text-muted-foreground">
          How to connect a USB fingerprint scanner to Medivault.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <TerminalSquare className="h-4 w-4 text-primary" />
            How it works
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            Medivault captures fingerprints through a <strong>local bridge
            service</strong> that runs on the workstation where the scanner is
            physically connected. The browser talks to the bridge over a local
            WebSocket; the bridge talks to the scanner over USB via its SDK
            adapter.
          </p>
          <div className="rounded-lg bg-muted p-4 font-mono text-xs flex items-center gap-2 overflow-x-auto">
            <span>Scanner</span>
            <span>→</span>
            <Usb className="h-3.5 w-3.5" />
            <span>Biometric Bridge (local)</span>
            <span>→</span>
            <Wifi className="h-3.5 w-3.5" />
            <span>Browser (ws://localhost:9876)</span>
            <span>→</span>
            <Shield className="h-3.5 w-3.5" />
            <span>Medivault API</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Prerequisites
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          <Requirement icon={Usb} title="1. USB fingerprint scanner">
            <p>
              Any USB fingerprint reader. Supported adapters include Futronic,
              SecuGen, DigitalPersona and generic USB readers.
            </p>
          </Requirement>
          <Requirement icon={Download} title="2. Drivers / SDK">
            <p>
              Install the vendor-supplied drivers for your scanner so the
              operating system recognises it. The bridge uses vendor SDK
              adapters under the hood.
            </p>
          </Requirement>
          <Requirement icon={Wifi} title="3. Biometric bridge service">
            <p>
              The bridge runs locally. From the repository root:
            </p>
            <Code>npm run dev --workspace=apps/biometric-bridge</Code>
            <p className="text-xs text-muted-foreground">
              You should see <em>“Biometric bridge listening on ws://127.0.0.1:9876”</em>.
              Leave the terminal open while using the scanner.
            </p>
          </Requirement>
          <Requirement icon={Plug} title="4. Connect and test">
            <p>
              Plug the scanner into USB, then on the{' '}
              <Link href="/fingerprint" className="text-primary hover:underline">
                Fingerprint ID
              </Link>{' '}
              page tap the refresh icon. The status badge will show the detected
              scanner.
            </p>
          </Requirement>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            {showWarnings ? (
              <XCircle className="h-4 w-4 text-amber-600" />
            ) : (
              <Fingerprint className="h-4 w-4 text-primary" />
            )}
            Troubleshooting
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-3">
          <div className="space-y-2">
            <p className="font-medium text-foreground">
              “Scanner not connected”
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>Confirm the bridge service is running (step 3).</li>
              <li>Tap the refresh icon to re-run USB detection.</li>
              <li>Reconnect the scanner and wait for the OS driver prompt.</li>
            </ul>
          </div>

          <button
            type="button"
            onClick={() => setShowWarnings((v) => !v)}
            className="text-xs text-primary hover:underline"
          >
            {showWarnings ? 'Hide' : 'Show'} development notes
          </button>

          {showWarnings && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 p-3 text-xs space-y-1.5">
              <p>
                <strong>Real hardware only:</strong> the frontend does not ship
                any simulated scanner. Captures come exclusively from the local
                bridge (<Code>apps/biometric-bridge</Code>) with an MFS100
                scanner attached.
              </p>
              <p>
                <strong>No scanner detected:</strong> ensure a real MFS100 device
                is listed by <Code>GET /scanner/detect</Code> on the bridge.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}