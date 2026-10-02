# Biometric Hardware Setup — Idemia MSO 1300 E3

Production fingerprint verification runs as:

```
[MSO 1300 E3 USB scanner]
   │ USB (VID 0x1DCF / PID 0x0007)
   ▼
[biometric-bridge (local workstation)]                     apps/biometric-bridge
   │ HTTP 127.0.0.1:9876 + WS  /ws
   │ opaque "MV1:" AES-256-GCM ciphertext + HMAC
   ▼
[backend  /api/biometrics/*]                               apps/backend
   │ BIOMETRIC_PROVIDER=mso1300 → MSO1300BiometricProvider
   │ MorphoSmartCST.dll (MINEX-compliant matching)
   │ templates stored encrypted in MongoDB (select:false)
   ▼
[frontend /fingerprint  (use-scanner hook)]                apps/frontend
```

The bridge never exposes raw fingerprint data over the wire. Captured minutiae
templates are encrypted with the shared `BIOMETRIC_ENCRYPTION_KEY` (AES-256-GCM,
prefix `MV1:`), and HMAC-signed with `BIOMETRIC_BRIDGE_SECRET`. The backend
rejects plain payloads in `NODE_ENV=production`.

---

## 1. Install the Idemia hardware + SDK (Windows)

1. Obtain the **Idemia MSO SDK** from your Idemia reseller or the
   [Idemia biometric devices portal](https://biometricdevices.idemia.com).
   The package contains `MorphoSmartCST.dll` and a USB driver installer.

2. Run the USB driver installer (`MSOSetup.exe` or equivalent) **as Administrator**.

3. Plug the **MSO 1300 E3** into a USB 2.0 or USB 3.0 port. Confirm the device
   appears in Device Manager as **"IDEMIA Fingerprint Scanner"**
   (vendor `0x1DCF`, product `0x0007`).

4. Obtain a **license key** from Idemia for this device serial number.
   (This is required for production. During initial integration testing you may
   omit it — some SDK builds operate without a key in eval mode.)

5. Verify the scanner works with the Idemia bundled demo application before
   integrating with Medivault.

---

## 2. Configure the bridge (the workstation with the scanner)

Copy `apps/biometric-bridge/.env.example` to `apps/biometric-bridge/.env` and
edit:

```env
# Force the MSO 1300 adapter (or use "auto" to auto-detect)
BIOMETRIC_ADAPTER=mso1300

# Path to MorphoSmartCST.dll (auto-probed if left unset)
MSO_SDK_DLL=C:\Program Files\Idemia\MSO SDK\MorphoSmartCST.dll

# License key issued by Idemia for this device serial
MSO_LICENSE_KEY=<license-from-idemia>

# AES-256 encryption key — MUST match backend BIOMETRIC_ENCRYPTION_KEY
BIOMETRIC_ENCRYPTION_KEY=<generate: openssl rand -hex 32>

# HMAC signing secret — MUST match backend BIOMETRIC_BRIDGE_SECRET
BIOMETRIC_BRIDGE_SECRET=<generate: openssl rand -hex 32>
```

Build and start the bridge:

```bash
# Build SDK packages first (run from the monorepo root)
npm run build:sdk

# Dev mode (auto-restarts on change)
npm run dev:bridge

# Or production
npm run build:bridge
npm run start:bridge
```

Smoke-test with no scanner needed:

```bash
curl -s http://127.0.0.1:9876/health
# → {"ok":true,"adapter":"mso1300","connected":false}
```

With the scanner plugged in:

```bash
curl -s http://127.0.0.1:9876/scanner/status
# → {"connected":true,"ready":true,"scannerName":"MSO 1300 E3","adapterId":"mso1300",...}
```

---

## 3. Configure the backend

`apps/backend/.env` — match the encryption/secret keys to the bridge:

```env
BIOMETRIC_PROVIDER=mso1300

# Must be identical to bridge BIOMETRIC_ENCRYPTION_KEY
BIOMETRIC_ENCRYPTION_KEY=<same 32+ chars as bridge>

# Must be identical to bridge BIOMETRIC_BRIDGE_SECRET
BIOMETRIC_BRIDGE_SECRET=<same 32+ chars as bridge>

# Optional: only accept captures from these device serials (empty = any)
BIOMETRIC_ALLOWED_DEVICES=

# Raw SDK match score 0–100000. Lower = stricter. Default 14000.
MSO_MATCH_THRESHOLD=14000

# If the backend server also has MorphoSmartCST.dll installed (for server-side
# matching), set these; otherwise the bridge handles all SDK I/O.
# MSO_SDK_DLL=C:\Program Files\Idemia\MSO SDK\MorphoSmartCST.dll
# MSO_LICENSE_KEY=<license-from-idemia>
```

---

## 4. Configure the frontend

`apps/frontend/.env.local`:

```env
NEXT_PUBLIC_BIOMETRIC_BRIDGE_URL=ws://localhost:9876/ws

# Must match BIOMETRIC_BRIDGE_TOKEN in bridge .env (leave blank if auth is off)
NEXT_PUBLIC_BIOMETRIC_BRIDGE_TOKEN=
```

---

## 5. Functional test with hardware

1. Open the Medivault frontend and navigate to **Fingerprint** (`/fingerprint`).
2. The status indicator should report **"Scanner ready — MSO 1300 E3"**.
3. Click **Enroll** to register a patient's fingerprint (3 samples required).
4. Click **Identify** and place the same finger; the patient record should match.

---

## 6. Adapter selection reference

| `BIOMETRIC_ADAPTER` (bridge) | `BIOMETRIC_PROVIDER` (backend) | Scanner |
|---|---|---|
| `mso1300` | `mso1300` | Idemia MSO 1300 E3 ← **production default** |
| `mfs100` | `mfs100` | Mantra MFS100 (legacy fallback) |
| `auto` | _(reads BIOMETRIC_PROVIDER)_ | Auto-detect: MSO 1300 > MFS100 > generic-usb |

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `MorphoSmartCST.dll not found` | Set `MSO_SDK_DLL` to the correct path, or install the Idemia MSO SDK |
| `No supported fingerprint scanner detected` | Confirm device appears in Device Manager under VID 0x1DCF; re-run USB driver setup |
| Bridge health returns `"connected":false` | Scanner not plugged in or driver not installed |
| `Invalid bridge signature` | `BIOMETRIC_BRIDGE_SECRET` mismatch between bridge and backend |
| `Plain biometric payload rejected in production` | `BIOMETRIC_ENCRYPTION_KEY` not set on the bridge |
| `Unable to decrypt payload` | `BIOMETRIC_ENCRYPTION_KEY` mismatch or key shorter than 32 chars |
| `Device is not in the allowed list` | Add the scanner serial to backend `BIOMETRIC_ALLOWED_DEVICES` |
| MSO error `-17 / E_LICENSE_INVALID` | Set `MSO_LICENSE_KEY` (obtain from Idemia for this device serial) |
| MSO error `-9 / E_TIMEOUT` | Finger not placed in time; ensure the sensor surface is clean and dry |
| MSO error `-11 / E_LIVENESS_FAILED` | Spoof detected by the E3 PAD sensor; use a real finger |
| Bridge WS connects but no captures | Enable `LOG_LEVEL=debug` on the bridge; verify the Idemia demo app works |

---

## Security notes

- The bridge binds to `127.0.0.1` only. **Never expose it on a public interface.**
- Raw fingerprint images are memory-only inside the bridge process and zeroed
  immediately after the ISO 19794-2 minutiae template is extracted.
- Encrypted templates (`MV1:…`) relay through the browser opaquely — the
  frontend forwards bytes only and never decodes them.
- The E3 liveness sensor detects spoofs (latex, film, Plasticine, rubber, etc.)
  and returns `E_LIVENESS_FAILED (-11)`. These events are written to the audit log.
- Audit log records `BIOMETRIC_ENROLL`, `BIOMETRIC_VERIFY`, `BIOMETRIC_REVOKE`
  successes and `BIOMETRIC_SECURITY_FAILURE` rejections (invalid signatures,
  anti-replay window violations, spoof attempts).

---

## Legacy scanner (Mantra MFS100)

The MFS100 adapter and `@medivault/mfs100-sdk` package are retained as a fallback.
To switch back:

```env
# apps/biometric-bridge/.env
BIOMETRIC_ADAPTER=mfs100
MFS100_SDK_DLL=C:\Program Files\Mantra\MFS100\MFS100.dll
MFS100_LICENSE_KEY=<license-from-mantra>

# apps/backend/.env
BIOMETRIC_PROVIDER=mfs100
MFS100_MATCH_THRESHOLD=14000
```
