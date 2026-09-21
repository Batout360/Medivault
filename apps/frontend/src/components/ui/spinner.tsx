import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const spinnerVariants = cva('animate-spin text-primary', {
  variants: {
    size: {
      xs:  'h-3 w-3',
      sm:  'h-4 w-4',
      md:  'h-6 w-6',
      lg:  'h-8 w-8',
      xl:  'h-12 w-12',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

interface SpinnerProps
  extends React.SVGAttributes<SVGSVGElement>,
    VariantProps<typeof spinnerVariants> {
  label?: string;
}

function Spinner({ size, className, label = 'Loading…', ...props }: SpinnerProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      className={cn(spinnerVariants({ size }), className)}
      aria-label={label}
      role="status"
      {...props}
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

/**
 * Full-screen loading overlay
 */
function SpinnerOverlay({ label = 'Loading…' }: { label?: string }) {
  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-background/80 backdrop-blur-sm"
      role="status"
      aria-label={label}
    >
      <div className="flex flex-col items-center gap-3">
        <Spinner size="xl" />
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

/**
 * Centered loading state within a container
 */
function SpinnerCenter({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16" role="status">
      <Spinner size="lg" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

export { Spinner, SpinnerOverlay, SpinnerCenter };
