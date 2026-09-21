# Biometric Hardware Setup

Production fingerprint verification runs as:

```
[MFS100 USB scanner]
   │ USB
   ▼
[biometric-bridge (local workstation)]                     apps/biometric-bridge
   │ HTTP 127.0.0.1:9876 + WS  /ws
   │ opaque "MV1:" AES-256-GCM ciphertext + HMAC
   ▼
[backend  /api/biometrics/*]                               apps/backend
   │ BIOMETRIC_PROVIDER=mfs100 → MFS100 SDK matcher
   │ decrypted templates stored encrypted in Mongo (select:false)
   ▼
[frontend use-scanner hook  /ws]                           apps/frontend
```

The bridge never exposes raw fingerprint data over the wire. Captured minutiae
templates are encrypted with the shared `BIOMETRIC_ENCRYPTION_KEY`, prefixed
`MV1:`, and HMAC-signed with `BIOMETRIC_BRIDGE_SECRET`. The backend rejects
plain payloads in `NODE_ENV=production`.

## 1. Install the Mantra hardware + SDK (Windows)

1. Install the **MFS100 USB fingerprint scanner driver** from Mantra (included
   with the device or https://www.mantratec.com).
2. Plug the scanner into USB and confirm it appears in Device Manager under
   "Mantra ..." (vendor `0x04b4`, products `0x8613` / `0x1005`).
3. Install the **Mantra Biometric SDK** so `MFS100.dll` / `fidcl.dll` is on the
   system PATH (or place it next to the Node process). Optional: license key
   via `MFS100_LICENSE_KEY`.
4. Verify the scanner works with Mantra's own demo app before continuing.

## 2. Configure the bridge (the machine with the scanner)

Copy `apps/biometric-bridge/.env.example` to `apps/biometric-bridge/.env`:

```env
BIOMETRIC_ADAPTER=auto
BIOMETRIC_BRIDGE_TOKEN=<long random>  # keep empty if the workstation is trusted
BIOMETRIC_ENCRYPTION_KEY=<32+ random chars>   # SAME as backend
BIOMETRIC_BRIDGE_SECRET=<32+ random chars>    # SAME as backend
```

Then:

```bash
npm run build --workspace=@medivault/mfs100-sdk   # build the shared SDK first
cd apps/biometric-bridge
npm run dev                           # or: npm run build ; npm start
```

Smoke test (no scanner):

```bash
curl -s http://127.0.0.1:9876/health
# → {"ok":true,"adapter":"mfs100","connected":false}
```

## 3. Configure the backend

`apps/backend/.env` (match keys between bridge and backend):

```env
BIOMETRIC_PROVIDER=mfs100
BIOMETRIC_ENCRYPTION_KEY=<same 32+ random chars>
BIOMETRIC_BRIDGE_SECRET=<same 32+ random chars>
BIOMETRIC_ALLOWED_DEVICES=<scanner serials, comma-separated>   # optional
MFS100_MATCH_THRESHOLD=14000         # raw SDK score; lower = stricter
```

The matcher provider looks for `@medivault/mfs100-sdk` at runtime; when the
back end runs from `ts-node`/Nest dev the package must be built first (the
monorepo resolves the `src` path via tsconfig `paths`; the production build
emits the SDK sources into `dist/` alongside the app).

## 4. Configure the frontend

`apps/frontend/.env.local`:

```env
NEXT_PUBLIC_BIOMETRIC_BRIDGE_URL=ws://localhost:9876/ws
NEXT_PUBLIC_BIOMETRIC_BRIDGE_TOKEN=<same as bridge BIOMETRIC_BRIDGE_TOKEN>
```

The scan page (`/fingerprint` demo) now uses the bridge enroll path with the
real adapter; backend routes are `/api/biometrics/*` (alias `/api/biometric/*`).

## 5. Functional test with no hardware

The bridge requires real hardware (MFS100 SDK + scanner) to capture a
fingerprint. With no scanner attached, `GET /scanner/status` reports
`connected: false` and capture requests fail with `NO_DEVICE` — the bridge
never fabricates fingerprint data.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `No supported fingerprint scanner detected` | Check driver/device; `BIOMETRIC_ADAPTER`; confirm the scanner is listed by `GET /scanner/detect` |
| `Invalid bridge signature` (backend rejects capture) | `BIOMETRIC_BRIDGE_SECRET` mismatch bridge↔backend |
| `Plain biometric payload rejected in production` | Bridge not encrypting; check `BIOMETRIC_ENCRYPTION_KEY` is set on the bridge |
| `Unable to decrypt payload` | `BIOMETRIC_ENCRYPTION_KEY` mismatch or key shorter than 32 chars |
| `Device is not in the allowed list` | Add scanner serial to backend `BIOMETRIC_ALLOWED_DEVICES` |
| Bridge WS connects but no scans | Confirm `Port` action from Mantra SDK demo works; watch bridge `LOG_LEVEL=debug` |

## Security notes

- The bridge binds to `127.0.0.1` only. Never expose it on a public interface.
- Raw templates never leave the bridge; they are encrypted before the HTTP/WS
  response is formed.
- Bridges do not need network access to the backend.
- Audit log records `BIOMETRIC_ENROLL` / `BIOMETRIC_VERIFY` / `BIOMETRIC_REVOKE`
  successes and `BIOMETRIC_SECURITY_FAILURE` / `BIOMETRIC_SPOOF_ATTEMPT`
  rejections (including invalid signatures and freshness/anti-replay window).