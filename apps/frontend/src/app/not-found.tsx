'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileQuestion, ArrowLeft, LayoutDashboard } from 'lucide-react';

export default function NotFound() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-muted">
            <FileQuestion className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          </div>
        </div>

        {/* Error code */}
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
          Error 404
        </p>

        {/* Heading */}
        <h1 className="text-2xl font-semibold tracking-tight mb-3">
          Page not found
        </h1>

        {/* Description */}
        <p className="text-sm text-muted-foreground leading-relaxed mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
          If you followed a link from within Medivault, please report it.
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Go back
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
