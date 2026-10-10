'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Lock, Shield, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api/client';

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

export default function ResetPasswordPage() {
  return (
    <React.Suspense fallback={null}>
      <ResetPasswordContent />
    </React.Suspense>
  );
}

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirm, setShowConfirm] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [success, setSuccess] = React.useState(false);

  const { register, handleSubmit, formState: { errors }, setError } = useForm<ResetFormValues>({
    resolver: zodResolver(resetSchema),
  });

  const onSubmit = async (data: ResetFormValues) => {
    if (!token) {
      setError('root', { message: 'Reset token is missing. Check your email link and try again.' });
      return;
    }
    setIsSubmitting(true);
    try {
      await apiClient.post('/auth/reset-password', { token, newPassword: data.newPassword });
      setSuccess(true);
      toast.success('Password reset successful. Please sign in.');
    } catch (err: unknown) {
      const msg = isErrorLike(err) && err.message ? err.message : 'Reset failed. The token may be invalid or expired.';
      setError('root', { message: msg });
      toast.warning(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputCls = (hasError: boolean) =>
    cn(
      'flex h-10 w-full rounded-md border bg-sidebar/60 pl-10 pr-10 text-sm text-sidebar-foreground',
      'placeholder:text-sidebar-foreground/30 transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
      hasError
        ? 'border-alert-red-600 focus-visible:ring-alert-red-600'
        : 'border-sidebar-border hover:border-sidebar-foreground/30',
    );

  return (
    <div className="w-full">
      <Card className="border-sidebar-border bg-sidebar-accent shadow-2xl">
        <CardHeader className="pb-4">
          <div className="flex flex-col items-center gap-3">
            <Image src="/medivault-logo.png" alt="Medivault" width={1392} height={1130} priority className="h-14 w-auto brightness-0 invert" />
            <p className="text-sm text-sidebar-foreground/60">Set a new password</p>
          </div>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="flex flex-col items-center gap-4 text-center py-2">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-clinical-green-900/30 ring-1 ring-clinical-green-600/40">
                <CheckCircle2 className="h-8 w-8 text-clinical-green-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-sidebar-foreground">Password reset successful!</h2>
                <p className="mt-1 text-sm text-sidebar-foreground/60">Sign in with your new password to continue.</p>
              </div>
              <Button size="lg" className="mt-2 w-full bg-sidebar-primary hover:bg-sidebar-primary/90 text-white font-semibold" onClick={() => router.push('/login')}>
                Back to sign in
              </Button>
            </div>
          ) : (
            <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} noValidate className="space-y-4">
              <p className="text-sm text-sidebar-foreground/60 leading-relaxed">
                Choose a new password for your account. Your other active sessions will be signed out for security.
              </p>

              {!token && (
                <div role="alert" className="flex items-start gap-2 rounded-lg bg-warning-amber-950/50 border border-warning-amber-700/40 px-3 py-3 text-sm text-warning-amber-300">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  No reset token found in this link. Request a fresh reset link from the forgot password page.
                </div>
              )}

              {errors.root && (
                <div role="alert" className="flex items-start gap-2 rounded-lg bg-alert-red-950/60 border border-alert-red-700/40 px-3 py-3 text-sm text-alert-red-300">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  {errors.root.message}
                </div>
              )}

              {/* New password */}
              <div>
                <label htmlFor="rp-newPassword" className="block text-sm font-medium text-sidebar-foreground mb-1.5">New password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sidebar-foreground/40 pointer-events-none" aria-hidden="true" />
                  <input id="rp-newPassword" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="••••••••••••"
                    {...register('newPassword')}
                    className={inputCls(!!errors.newPassword)}
                    aria-invalid={!!errors.newPassword}
                    aria-describedby={errors.newPassword ? 'rp-new-pw-error' : 'rp-new-pw-hint'}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-sidebar-foreground/40 hover:text-sidebar-foreground transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.newPassword
                  ? <p id="rp-new-pw-error" role="alert" className="mt-1 text-xs text-alert-red-400 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{errors.newPassword.message}</p>
                  : <p id="rp-new-pw-hint" className="mt-1 text-xs text-sidebar-foreground/40">12+ characters with uppercase, lowercase, digit and special character.</p>
                }
              </div>

              {/* Confirm password */}
              <div>
                <label htmlFor="rp-confirmPassword" className="block text-sm font-medium text-sidebar-foreground mb-1.5">Confirm new password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sidebar-foreground/40 pointer-events-none" aria-hidden="true" />
                  <input id="rp-confirmPassword" type={showConfirm ? 'text' : 'password'} autoComplete="new-password" placeholder="••••••••••••"
                    {...register('confirmPassword')}
                    className={inputCls(!!errors.confirmPassword)}
                    aria-invalid={!!errors.confirmPassword}
                    aria-describedby={errors.confirmPassword ? 'rp-confirm-pw-error' : undefined}
                  />
                  <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-sidebar-foreground/40 hover:text-sidebar-foreground transition-colors"
                    aria-label={showConfirm ? 'Hide password' : 'Show password'}>
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.confirmPassword && (
                  <p id="rp-confirm-pw-error" role="alert" className="mt-1 text-xs text-alert-red-400 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />{errors.confirmPassword.message}
                  </p>
                )}
              </div>

              <div className="flex items-start gap-2 text-xs text-sidebar-foreground/40">
                <Shield className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <p>Creating a new password will revoke access on all other devices.</p>
              </div>

              <Button type="submit" size="lg" loading={isSubmitting} disabled={!token}
                className="w-full mt-2 bg-sidebar-primary hover:bg-sidebar-primary/90 text-white font-semibold">
                {isSubmitting ? 'Resetting…' : 'Set new password'}
              </Button>

              <Link href="/login" className="flex items-center justify-center gap-1.5 text-sm text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors">
                <ArrowLeft className="h-3.5 w-3.5" />Back to sign in
              </Link>
            </form>
          )}
        </CardContent>
      </Card>
      <p className="mt-4 text-center text-xs text-sidebar-foreground/30">
        © {new Date().getFullYear()} Medivault. All rights reserved.
      </p>
    </div>
  );
}

function isErrorLike(err: unknown): err is { message: string } {
  return typeof err === 'object' && err !== null && 'message' in err;
}
