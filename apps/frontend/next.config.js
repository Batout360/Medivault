// @ts-check

const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // ─── TypeScript & ESLint ──────────────────────────────────────────────────
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    // TypeScript is still fully checked at build time; ESLint has many
    // pre-existing rule violations across src/ — gate them on `npm run lint`
    // (and commit hooks) instead of failing production builds on Vercel/Docker.
    ignoreDuringBuilds: true,
    dirs: ['src'],
  },

  // ─── Output ──────────────────────────────────────────────────────────────
  // `standalone` is used for Docker deployments. Vercel ignores it (and it can
  // confuse the Vercel builder), so only enable it when NOT building on Vercel.
  output: process.env.VERCEL === '1' ? undefined : 'standalone',

  // ─── Experimental Features ───────────────────────────────────────────────
  experimental: {
    typedRoutes: true,
    serverComponentsExternalPackages: ['@node-rs/argon2', 'bcrypt'],
    // Pin file-tracing to the monorepo root so packages/shared/dist (aliased via
    // @medivault/shared in webpack below) is included in standalone output.
    // Without this, standalone/Docker builds crash at runtime with MODULE_NOT_FOUND.
    outputFileTracingRoot: path.resolve(__dirname, '../../'),
  },

  // ─── Allowed Image Domains ───────────────────────────────────────────────
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.medivault.internal',
        pathname: '/avatars/**',
      },
      {
        protocol: 'https',
        hostname: 's3.amazonaws.com',
        pathname: '/medivault-*/**',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '3001',
        pathname: '/uploads/**',
      },
    ],
    formats: ['image/avif', 'image/webp'],
  },

  // ─── Security Headers ────────────────────────────────────────────────────
  async headers() {
    const isDev = process.env.NODE_ENV === 'development';
    // NEXT_PUBLIC_API_URL may be a relative path on Vercel ("/api/v1", proxied
    // same-origin via rewrites) — only extract an origin for absolute URLs.
    const apiOrigin = (() => {
      const url = process.env.NEXT_PUBLIC_API_URL;
      if (!url) return 'http://localhost:3001';
      try {
        return new URL(url).origin;
      } catch {
        return '';
      }
    })();
    const connectSrc = ["'self'", apiOrigin, 'wss://localhost:*', 'ws://localhost:*']
      .filter(Boolean)
      .join(' ');

    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: [
              'camera=(self)',          // Needed for biometric capture
              'microphone=()',
              'geolocation=()',
              'payment=()',
              'usb=(self)',             // Fingerprint scanner USB access
              'serial=(self)',
            ].join(', '),
          },
          // HSTS — only in production
          ...(isDev
            ? []
            : [
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=63072000; includeSubDomains; preload',
                },
              ]),
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              isDev ? "script-src 'self' 'unsafe-eval' 'unsafe-inline'" : "script-src 'self'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              `connect-src ${connectSrc}`,
              "img-src 'self' data: blob: https:",
              "media-src 'self' blob:",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
              isDev ? '' : 'upgrade-insecure-requests',
            ]
              .filter(Boolean)
              .join('; '),
          },
        ],
      },
    ];
  },

  // ─── API Rewrites ────────────────────────────────────────────────────────
  async rewrites() {
    const apiBaseUrl =
      process.env.BACKEND_API_URL ??
      process.env.NEXT_PUBLIC_API_URL ??
      'http://localhost:3001';

    return [
      {
        source: '/api/:path*',
        destination: `${apiBaseUrl}/api/:path*`,
      },
    ];
  },

  // ─── Redirects ───────────────────────────────────────────────────────────
  // Root redirect is handled server-side in app/page.tsx (checks cookie presence
  // before deciding whether to go to /dashboard or /login).
  // Defining it here too would cause a double redirect on every page load.
  async redirects() {
    return [];
  },

  // ─── Webpack / Bundle Analyzer ───────────────────────────────────────────
  webpack: (config, { buildId: _buildId, dev, isServer, defaultLoaders: _defaultLoaders }) => {
    // Bundle analyzer — run with ANALYZE=true next build
    if (process.env.ANALYZE === 'true') {
      const { BundleAnalyzerPlugin } = require('@next/bundle-analyzer')();
      if (!isServer) {
        config.plugins.push(
          new BundleAnalyzerPlugin({
            analyzerMode: 'static',
            reportFilename: `../.bundle-analysis/${dev ? 'dev' : 'prod'}.html`,
            openAnalyzer: false,
          }),
        );
      }
    }

    // Resolve shared package from monorepo — use compiled dist to avoid
    // accidentally pulling in backend-only dependencies (e.g. @nestjs/swagger)
    // that may exist in source files with decorators.
    config.resolve.alias = {
      ...config.resolve.alias,
      '@medivault/shared': path.resolve(__dirname, '../../packages/shared/dist'),
    };

    return config;
  },

  // ─── Environment Variables (exposed to the browser) ──────────────────────
  env: {
    NEXT_PUBLIC_APP_NAME: 'Medivault',
    NEXT_PUBLIC_APP_VERSION: process.env.npm_package_version ?? '1.0.0',
  },
};

module.exports = nextConfig;
