# Medivault — Medical Records Management System

A production-grade Electronic Medical Records (EMR) system for hospitals and clinics with fingerprint biometric patient identification.

---

## ⚠ Important Notices

**Security**: This application handles Protected Health Information (PHI). Review all security configurations before any production deployment.

**Regulatory**: Implementing these technical controls does not automatically constitute compliance with HIPAA, India's DPDP Act, ABDM, or any other healthcare regulation. Regulatory compliance requires appropriate legal, organizational, operational, and technical measures. Consult qualified legal and compliance professionals.

**Biometrics**: The development mode uses a mock biometric provider. Production deployments must integrate a certified biometric scanner SDK. See [Biometric Configuration](#biometric-configuration).

---

## Architecture

```
                    ┌─────────────────┐
                    │  Frontend       │
                    │  Next.js 14     │
                    │  TypeScript     │
                    └────────┬────────┘
                             │ HTTPS
                             ▼
                    ┌─────────────────┐
                    │  Backend API    │
                    │  NestJS         │
                    │  TypeScript     │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        ┌──────────┐   ┌──────────┐   ┌──────────────┐
        │PostgreSQL│   │  Redis   │   │Object Storage│
        │  (data)  │   │(sessions │   │(MinIO / S3)  │
        └──────────┘   │rate-lim) │   └──────────────┘
                       └──────────┘

Fingerprint flow:
  Scanner → Biometric Bridge → Backend BiometricService
         → Patient ID → Authorization → Medical Records
```

---

## Tech Stack

| Layer       | Technology                                      |
|-------------|-------------------------------------------------|
| Frontend    | Next.js 14, React 18, TypeScript, Tailwind CSS  |
| Backend     | NestJS, TypeScript, Passport.js                 |
| Database    | PostgreSQL 16 + Prisma ORM                      |
| Cache       | Redis 7                                         |
| Storage     | MinIO (dev) / S3-compatible (prod)              |
| Auth        | JWT (access) + rotating refresh tokens          |
| Passwords   | Argon2id                                        |
| Validation  | Zod (frontend) + class-validator (backend)      |

---

## Project Structure

```
medivault/
├── apps/
│   ├── backend/             NestJS API
│   │   ├── prisma/          Database schema + migrations + seed
│   │   └── src/
│   │       ├── auth/        Authentication (JWT, Argon2, refresh tokens)
│   │       ├── common/      Guards, interceptors, pipes, decorators
│   │       ├── config/      Environment config
│   │       ├── modules/
│   │       │   ├── audit-logs/
│   │       │   ├── biometric/    Biometric service + providers
│   │       │   ├── documents/    File upload/download
│   │       │   ├── medical-records/
│   │       │   ├── patients/
│   │       │   └── users/
│   │       └── main.ts      Server bootstrap
│   └── frontend/            Next.js app
│       └── src/
│           ├── app/
│           │   ├── (auth)/  Login, forgot password
│           │   └── (app)/   Protected pages
│           ├── components/
│           │   ├── layout/  Sidebar, Header, AppShell
│           │   └── ui/      Button, Input, Card, Badge, etc.
│           └── lib/
│               ├── api/     Axios client
│               ├── hooks/   React Query hooks
│               └── stores/  Zustand auth store
└── packages/
    └── shared/              Shared TypeScript types + DTOs
```

---

## Quick Start (Development)

### Prerequisites

- Node.js 20+
- Docker Desktop
- pnpm or npm

### 1. Clone and install

```bash
git clone <repo-url> medivault
cd medivault
npm install
```

### 2. Configure environment

```bash
# Backend
cp apps/backend/.env.example apps/backend/.env

# Frontend
cp apps/frontend/.env.example apps/frontend/.env.local
```

Edit `apps/backend/.env` — at minimum set unique JWT secrets:
```env
JWT_SECRET=<generate with: openssl rand -hex 32>
JWT_REFRESH_SECRET=<generate with: openssl rand -hex 32>
```

### 3. Start infrastructure

```bash
docker compose up postgres redis minio -d
```

### 4. Database setup

```bash
cd apps/backend
npx prisma migrate dev    # Apply migrations
npm run prisma:seed       # Seed test data
```

### 5. Start services

**Backend:**
```bash
cd apps/backend
npm run dev
# API: http://localhost:3001/api/v1
# Swagger: http://localhost:3001/api/docs
```

**Frontend:**
```bash
cd apps/frontend
npm run dev
# App: http://localhost:3000
```

### 6. Full stack with Docker Compose

```bash
docker compose up
```

This starts all services including the app. Visit http://localhost:3000.

---

## Test Credentials (Development Only)

> ⚠ **These are for development only. Change all passwords before any real deployment.**

All accounts use the password: `Medivault@Dev2024!`

| Role            | Email                            |
|-----------------|----------------------------------|
| Super Admin     | superadmin@medivault.dev         |
| Admin           | admin@citygeneral.dev            |
| Doctor          | dr.sharma@citygeneral.dev        |
| Nurse           | nurse.priya@citygeneral.dev      |
| Receptionist    | reception@citygeneral.dev        |

---

## User Roles

| Role           | Capabilities                                                   |
|----------------|----------------------------------------------------------------|
| `SUPER_ADMIN`  | Full system access, user management, audit logs               |
| `ADMIN`        | Staff management, patient records, audit logs                 |
| `DOCTOR`       | Patient records, diagnoses, prescriptions, clinical notes     |
| `NURSE`        | Patient info, vitals, nursing notes                           |
| `RECEPTIONIST` | Patient registration, search, fingerprint identification      |
| `PATIENT`      | Own records, appointments, prescriptions (read only)          |

---

## Biometric Configuration

### Development (Mock)
The mock provider simulates biometric scanning. Enable it:
```env
# apps/backend/.env
BIOMETRIC_PROVIDER=mock

# apps/frontend/.env.local
NEXT_PUBLIC_BIOMETRIC_MOCK=true
```

### Production (Real Scanner)
The `BiometricProvider` interface (`apps/backend/src/modules/biometric/providers/biometric-provider.interface.ts`) defines the contract. Implement a vendor-specific adapter:

```typescript
// apps/backend/src/modules/biometric/providers/my-vendor.provider.ts
export class MyVendorBiometricProvider implements BiometricProvider {
  async enrollFingerprint(patientId, captureSessionToken) { ... }
  async identifyFingerprint(captureSessionToken) { ... }
  async verifyFingerprint(patientId, captureSessionToken) { ... }
  async deleteTemplate(patientId) { ... }
}
```

Set in `.env`:
```env
BIOMETRIC_PROVIDER=my-vendor
```

The frontend biometric page expects a local **biometric bridge** running on the workstation (a small background process provided by the scanner vendor SDK) that captures the fingerprint and returns a session token. This token is sent to the backend for matching — the raw fingerprint never reaches the application server.

---

## API Documentation

Interactive Swagger docs available in development:
```
http://localhost:3001/api/docs
```

Key endpoints:
```
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout

GET    /api/v1/patients
POST   /api/v1/patients
GET    /api/v1/patients/:id
PATCH  /api/v1/patients/:id

POST   /api/v1/biometrics/enroll
POST   /api/v1/biometrics/identify

GET    /api/v1/patients/:id/records/diagnoses
POST   /api/v1/patients/:id/records/diagnoses

GET    /api/v1/patients/:id/prescriptions
POST   /api/v1/patients/:id/prescriptions

GET    /api/v1/patients/:id/records/vitals
POST   /api/v1/patients/:id/records/vitals

GET    /api/v1/audit-logs
GET    /api/v1/users
```

---

## Security Features

- **Authentication**: JWT access tokens (15 min) + rotating refresh tokens (7 days), Argon2id password hashing
- **Authorization**: Role-Based Access Control (RBAC), resource-level checks, organization isolation
- **Rate limiting**: Redis-backed, stricter limits on auth and biometric endpoints
- **Audit logging**: Immutable audit trail for all sensitive actions
- **Security headers**: Helmet, CSP, HSTS, X-Frame-Options, CSRF protection
- **Input validation**: class-validator (backend), Zod (frontend), whitelist-only DTOs
- **Biometric security**: Templates stored encrypted at rest, never exposed via API, separate storage
- **Token security**: Access tokens in memory only (not localStorage), refresh tokens in HttpOnly cookies

---

## Environment Variables

### Backend (`apps/backend/.env`)

```env
# Application
NODE_ENV=development
PORT=3001

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/medivault

# Redis
REDIS_URL=redis://localhost:6379

# JWT (generate with: openssl rand -hex 32)
JWT_SECRET=<CHANGE_ME>
JWT_REFRESH_SECRET=<CHANGE_ME>
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Cookies
COOKIE_SECRET=<CHANGE_ME>

# CORS
CORS_ALLOWED_ORIGINS=http://localhost:3000

# Object Storage
STORAGE_PROVIDER=minio   # or: s3
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=<key>
MINIO_SECRET_KEY=<secret>
MINIO_BUCKET=medivault-documents

# Biometrics
BIOMETRIC_PROVIDER=mock  # Change to real vendor in production

# Argon2 (increase costs for production)
ARGON2_MEMORY_COST=65536
ARGON2_TIME_COST=3
ARGON2_PARALLELISM=4
```

### Frontend (`apps/frontend/.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
BACKEND_API_URL=http://localhost:3001/api/v1
NEXT_PUBLIC_BIOMETRIC_MOCK=true
```

---

## Running Tests

```bash
# Backend unit tests
cd apps/backend && npm test

# Backend with coverage
cd apps/backend && npm run test:cov

# Frontend
cd apps/frontend && npm test
```

---

## Production Checklist

Before deploying to production:

- [ ] Generate unique `JWT_SECRET` and `JWT_REFRESH_SECRET` (min 32 chars, random)
- [ ] Generate unique `COOKIE_SECRET`
- [ ] Set `NODE_ENV=production`
- [ ] Configure real CORS `CORS_ALLOWED_ORIGINS`
- [ ] Enable HTTPS/TLS (reverse proxy or load balancer)
- [ ] Replace MinIO with production S3 or equivalent
- [ ] Configure real `BIOMETRIC_PROVIDER` with vendor SDK
- [ ] Enable database backups and point-in-time recovery
- [ ] Increase Argon2 cost parameters for production hardware
- [ ] Set up log aggregation and alerting
- [ ] Review and restrict database user permissions
- [ ] Set up secrets management (AWS Secrets Manager, Vault, etc.)
- [ ] Run security scan on Docker images
- [ ] Configure network security groups / firewall rules
- [ ] Test restore from backup

---

## License

Proprietary. All rights reserved.
