# syntax=docker/dockerfile:1
#
# Build context is the REPOSITORY ROOT, not apps/backend — this is an npm
# workspaces monorepo and both the build and the runtime need packages/* present.
#
# ─── Base ──────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
# python3/make/g++ are required to compile native addons (argon2, koffi) when no
# prebuilt binary matches the target platform.
RUN apk add --no-cache python3 make g++ libc6-compat openssl
WORKDIR /app

# ─── Dependencies ─────────────────────────────────────────────────────────────
FROM base AS deps
# Every workspace manifest must exist before `npm install`, otherwise the
# workspace globs in the root package.json resolve to a partial tree.
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/mfs100-sdk/package.json ./packages/mfs100-sdk/
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/
COPY apps/biometric-bridge/package.json ./apps/biometric-bridge/
# `npm ci` cannot be used: the root package.json declares an `overrides` block
# that the committed lockfile was not resolved against.
RUN npm install --include=dev

# ─── Development ─────────────────────────────────────────────────────────────
FROM base AS development
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY packages ./packages
COPY apps/backend ./apps/backend
WORKDIR /app/apps/backend
EXPOSE 3001
# The dev script is `dev`; there is no `start:dev` in apps/backend/package.json.
CMD ["npm", "run", "dev"]

# ─── Builder ──────────────────────────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY packages ./packages
COPY apps/backend ./apps/backend

# The compiled backend still emits `require("@medivault/shared")` and
# `require("@medivault/mfs100-sdk")`, which Node resolves at runtime through the
# workspace symlinks into packages/*/dist. Both packages must be compiled first or
# the image builds fine and then throws MODULE_NOT_FOUND on boot.
WORKDIR /app
RUN npm run build:shared && npm run build:sdk

WORKDIR /app/apps/backend
RUN npm run build

# ─── Production ───────────────────────────────────────────────────────────────
FROM base AS production
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/mfs100-sdk/package.json ./packages/mfs100-sdk/
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/
COPY apps/biometric-bridge/package.json ./apps/biometric-bridge/
RUN npm install --omit=dev

# node_modules holds the @medivault/* symlinks; the packages themselves must be
# copied alongside it or those symlinks dangle.
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/mfs100-sdk/dist ./packages/mfs100-sdk/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/mfs100-sdk/package.json ./packages/mfs100-sdk/

# nest build infers the monorepo root as rootDir (the backend tsconfig `paths`
# point outside apps/backend), so the entry point is nested rather than at the
# root of dist.
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs && \
    mkdir -p /app/uploads && \
    chown -R nestjs:nodejs /app/uploads
USER nestjs

WORKDIR /app/apps/backend
EXPOSE 3001
CMD ["node", "dist/apps/backend/src/main"]
