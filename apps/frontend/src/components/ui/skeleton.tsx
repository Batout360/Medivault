import * as React from 'react';
import { cn } from '@/lib/utils';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Width. Defaults to full. */
  w?: string;
  /** Height class. Defaults to h-4. */
  h?: string;
  /** If true, renders as a circle. */
  circle?: boolean;
}

function Skeleton({ className, w, h, circle, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-muted',
        circle ? 'rounded-full' : 'rounded-md',
        !w && 'w-full',
        !h && 'h-4',
        className,
      )}
      style={{ width: w, height: h }}
      aria-hidden="true"
      {...props}
    />
  );
}

// ─── Skeleton variants for common UI patterns ─────────────────────────────────

function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className={i === lines - 1 ? 'w-4/5' : 'w-full'}
          h="14px"
        />
      ))}
    </div>
  );
}

function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-xl border border-border p-6 space-y-4', className)} aria-hidden="true">
      <div className="flex items-center gap-3">
        <Skeleton circle w="40px" h="40px" />
        <div className="flex-1 space-y-2">
          <Skeleton h="14px" className="w-1/3" />
          <Skeleton h="12px" className="w-1/2" />
        </div>
      </div>
      <SkeletonText lines={2} />
    </div>
  );
}

function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2" aria-hidden="true">
      {/* Header */}
      <div className="flex gap-4 px-4 py-2 border-b border-border">
        {Array.from({ length: cols }, (_, i) => (
          <Skeleton key={i} h="14px" className="flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-4 px-4 py-3">
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} h="14px" className="flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export { Skeleton, SkeletonText, SkeletonCard, SkeletonTable };
