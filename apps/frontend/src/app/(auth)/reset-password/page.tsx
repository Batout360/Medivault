'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Shield,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api/client';

// ─── Validation schema ────────────────────────────────────────────────────────
const resetSchema = z
  .object({
    newPassword: z
      .string()
      .min(12, 'Password must be at least 12 characters')
      .max(128, 'Password must not exceed 128 characters')
      .regex(/[a-z]/, 'Must include at least one lowercase letter')
      .regex(/[A-Z]/, 'Must include at least one uppercase letter')
      .regex(/\d/, 'Must include at least one digit')
      .regex(/[^A-Za-z\d]/, 'Must include at least one special character'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type ResetFormValues = z.infer<typeof resetSchema>;

// ─── Reset Password Page ──────────────────────────────────────────────────────
// useSearchParams() must be rendered under a Suspense boundary or static
// generation fails (missing-suspense-with-csr-bailout).
export default function ResetPasswordPage() {
  return (
    <React.Suspense fallback={null}>
      <ResetPasswordForm />
    </React.Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirm, setShowConfirm] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [success, setSuccess] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<ResetFormValues>({
    resolver: zodResolver(resetSchema),
  });

  const onSubmit = async (data: ResetFormValues) => {
    if (!token) {
      setError('root', {
        message: 'Reset token is missing. Check your email link and try again.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.post('/auth/reset-password', {
        token,
        newPassword: data.newPassword,
      });
      setSuccess(true);
      toast.success('Password reset successful. Please sign in.');
    } catch (err: unknown) {
      const msg =
        isErrorLike(err) && err.message
          ? err.message
          : 'Reset failed. The token may be invalid or expired.';
      setError('root', { message: msg });
      toast.warning(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Success state ───────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="flex flex-col items-center gap-4 text-center py-2">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 ring-1 ring-emerald-500/40">
          <CheckCircle2 className="h-8 w-8 text-emerald-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Password reset successful!</h2>
          <p className="mt-1 text-sm text-blue-200/70">
            Sign in with your new password to continue.
          </p>
        </div>
        <Button
          size="lg"
          className="mt-2 w-full bg-primary hover:bg-primary/90 text-white font-semibold"
          onClick={() => router.push('/login')}
        >
          Back to sign in
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(onSubmit)(e)}
      noValidate
      className="space-y-4"
    >
      <p className="text-sm text-blue-200/70 leading-relaxed">
        Choose a new password for your account. Your other active sessions will
        be signed out for security.
      </p>

      {!token && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-3 text-sm text-amber-300"
        >
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          No reset token found in this link. Request a fresh reset link from the
          forgot password page.
        </div>
      )}

      {errors.root && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-3 text-sm text-destructive"
        >
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          {errors.root.message}
        </div>
      )}

      {/* New password */}
      <div>
        <label
          htmlFor="newPassword"
          className="block text-sm font-medium text-blue-100 mb-1.5"
        >
          New password
        </label>
        <div className="relative">
          <Lock
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-300/60 pointer-events-none"
            aria-hidden="true"
          />
          <input
            id="newPassword"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="••••••••••••"
            {...register('newPassword')}
            className={cn(
              'flex h-10 w-full rounded-lg border bg-white/5 pl-10 pr-10 text-sm text-white',
              'placeholder:text-blue-300/30',
              'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              errors.newPassword
                ? 'border-destructive focus-visible:ring-destructive'
                : 'border-white/10 hover:border-white/20',
            )}
            aria-invalid={!!errors.newPassword}
            aria-describedby={errors.newPassword ? 'new-password-error' : undefined}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-300/60 hover:text-blue-300 transition-colors"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {errors.newPassword ? (
          <p
            id="new-password-error"
            role="alert"
            className="mt-1 text-xs text-destructive flex items-center gap-1"
          >
            <AlertTriangle className="h-3 w-3" />
            {errors.newPassword.message}
          </p>
        ) : (
          <p className="mt-1 text-xs text-blue-300/50">
            12+ characters with uppercase, lowercase, digit and special character.
          </p>
        )}
      </div>

      {/* Confirm password */}
      <div>
        <label
          htmlFor="confirmPassword"
          className="block text-sm font-medium text-blue-100 mb-1.5"
        >
          Confirm new password
        </label>
        <div className="relative">
          <Lock
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-300/60 pointer-events-none"
            aria-hidden="true"
          />
          <input
            id="confirmPassword"
            type={showConfirm ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="••••••••••••"
            {...register('confirmPassword')}
            className={cn(
              'flex h-10 w-full rounded-lg border bg-white/5 pl-10 pr-10 text-sm text-white',
              'placeholder:text-blue-300/30',
              'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              errors.confirmPassword
                ? 'border-destructive focus-visible:ring-destructive'
                : 'border-white/10 hover:border-white/20',
            )}
            aria-invalid={!!errors.confirmPassword}
            aria-describedby={
              errors.confirmPassword ? 'confirm-password-error' : undefined
            }
          />
          <button
            type="button"
            onClick={() => setShowConfirm(!showConfirm)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-300/60 hover:text-blue-300 transition-colors"
            aria-label={showConfirm ? 'Hide password' : 'Show password'}
          >
            {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {errors.confirmPassword && (
          <p
            id="confirm-password-error"
            role="alert"
            className="mt-1 text-xs text-destructive flex items-center gap-1"
          >
            <AlertTriangle className="h-3 w-3" />
            {errors.confirmPassword.message}
          </p>
        )}
      </div>

      <div className="mt-3 flex items-start gap-2 text-xs text-blue-300/50">
        <Shield className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
        <p>Creating a new password will revoke access on all other devices.</p>
      </div>

      <Button
        type="submit"
        size="lg"
        loading={isSubmitting}
        disabled={!token}
        className="w-full mt-2 bg-primary hover:bg-primary/90 text-white font-semibold shadow-lg shadow-primary/20"
      >
        {isSubmitting ? 'Resetting…' : 'Set new password'}
      </Button>

      <Link
        href="/login"
        className="flex items-center justify-center gap-1.5 text-sm text-blue-200/60 hover:text-blue-200 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to sign in
      </Link>
    </form>
  );
}

function isErrorLike(err: unknown): err is { message: string } {
  return typeof err === 'object' && err !== null && 'message' in err;
}