'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  Shield,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api/client';

// ─── Validation schemas ────────────────────────────────────────────────────────
const requestSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
});

const resetSchema = z
  .object({
    token: z.string().min(1, 'Reset token is required'),
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

type RequestFormValues = z.infer<typeof requestSchema>;
type ResetFormValues = z.infer<typeof resetSchema>;

type Stage = 'request' | 'sent' | 'reset';

// ─── Forgot Password Page ──────────────────────────────────────────────────────
export default function ForgotPasswordPage() {
  return (
    <div className="w-full">
      <Card className="border-white/10 bg-white/5 backdrop-blur-md shadow-2xl">
        <CardHeader className="pb-4">
          <div className="flex flex-col items-center gap-3">
            <Image
              src="/medivault-logo.png"
              alt="Medivault"
              width={1392}
              height={1130}
              priority
              className="h-14 w-auto"
            />
            <div className="text-center">
              <p className="text-sm text-blue-200/70">Reset your password</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ForgotPasswordForm />
        </CardContent>
      </Card>

      <p className="mt-4 text-center text-xs text-blue-300/30">
        © {new Date().getFullYear()} Medivault. All rights reserved.
      </p>
    </div>
  );
}

function ForgotPasswordForm() {
  const router = useRouter();
  const [stage, setStage] = React.useState<Stage>('request');
  const [resetting, setResetting] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirm, setShowConfirm] = React.useState(false);

  const requestForm = useForm<RequestFormValues>({
    resolver: zodResolver(requestSchema),
  });

  const resetForm = useForm<ResetFormValues>({
    resolver: zodResolver(resetSchema),
  });

  // ── Step 1: request a reset link ────────────────────────────────────────────
  const onRequest = async (data: RequestFormValues) => {
    try {
      await apiClient.post('/auth/forgot-password', { email: data.email });
      setStage('sent');
      resetForm.setValue('token', '');
      toast.success('Check your inbox — reset instructions have been sent.');
    } catch (err: unknown) {
      const msg =
        isErrorLike(err) && err.message
          ? err.message
          : 'Failed to send reset instructions. Please try again.';
      toast.warning(msg);
      requestForm.setError('root', { message: msg });
    }
  };

  // ── Step 2: complete the reset with the token ───────────────────────────────
  const onReset = async (data: ResetFormValues) => {
    setResetting(true);
    try {
      await apiClient.post('/auth/reset-password', {
        token: data.token,
        newPassword: data.newPassword,
      });
      setStage('reset');
      toast.success('Password reset successfully. Please sign in.');
    } catch (err: unknown) {
      const msg =
        isErrorLike(err) && err.message
          ? err.message
          : 'Reset failed. Please check your token and try again.';
      toast.warning(msg);
      resetForm.setError('root', { message: msg });
    } finally {
      setResetting(false);
    }
  };

  const requestErrors = requestForm.formState.errors;
  const resetErrors = resetForm.formState.errors;

  // ── Stage: reset complete ───────────────────────────────────────────────────
  if (stage === 'reset') {
    return (
      <div className="flex flex-col items-center gap-4 text-center py-2">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 ring-1 ring-emerald-500/40">
          <CheckCircle2 className="h-8 w-8 text-emerald-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Password reset successful!</h2>
          <p className="mt-1 text-sm text-blue-200/70">
            Your password has been updated. Sign in with your new password to continue.
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

  // ── Stage: reset instructions sent ──────────────────────────────────────────
  if (stage === 'sent') {
    return (
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-4 py-3 text-sm text-emerald-300">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <p>
            If an account exists for that email, a password reset link has been
            sent. Check your inbox (and spam folder) for instructions.
          </p>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-sm text-blue-200/70">
            Received the reset link? Enter the token from the email and choose a
            new password below.
          </p>
        </div>

        {/* Reset token + new password */}
        <form
          onSubmit={(e) => void resetForm.handleSubmit(onReset)(e)}
          noValidate
          className="space-y-4"
        >
          {resetErrors.root && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-3 text-sm text-destructive"
            >
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              {resetErrors.root.message}
            </div>
          )}

          <div>
            <label
              htmlFor="token"
              className="block text-sm font-medium text-blue-100 mb-1.5"
            >
              Reset token
            </label>
            <div className="relative">
              <KeyRound
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-300/60 pointer-events-none"
                aria-hidden="true"
              />
              <input
                id="token"
                type="text"
                autoComplete="off"
                spellCheck="false"
                placeholder="Paste the token from the reset email"
                {...resetForm.register('token')}
                className={cn(
                  'flex h-10 w-full rounded-lg border bg-white/5 pl-10 pr-4 text-sm text-white',
                  'placeholder:text-blue-300/30',
                  'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  resetErrors.token
                    ? 'border-destructive focus-visible:ring-destructive'
                    : 'border-white/10 hover:border-white/20',
                )}
                aria-invalid={!!resetErrors.token}
                aria-describedby={resetErrors.token ? 'token-error' : undefined}
              />
            </div>
            {resetErrors.token && (
              <p
                id="token-error"
                role="alert"
                className="mt-1 text-xs text-destructive flex items-center gap-1"
              >
                <AlertTriangle className="h-3 w-3" />
                {resetErrors.token.message}
              </p>
            )}
          </div>

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
                {...resetForm.register('newPassword')}
                className={cn(
                  'flex h-10 w-full rounded-lg border bg-white/5 pl-10 pr-10 text-sm text-white',
                  'placeholder:text-blue-300/30',
                  'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  resetErrors.newPassword
                    ? 'border-destructive focus-visible:ring-destructive'
                    : 'border-white/10 hover:border-white/20',
                )}
                aria-invalid={!!resetErrors.newPassword}
                aria-describedby={
                  resetErrors.newPassword ? 'new-password-error' : undefined
                }
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
            {resetErrors.newPassword ? (
              <p
                id="new-password-error"
                role="alert"
                className="mt-1 text-xs text-destructive flex items-center gap-1"
              >
                <AlertTriangle className="h-3 w-3" />
                {resetErrors.newPassword.message}
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
                {...resetForm.register('confirmPassword')}
                className={cn(
                  'flex h-10 w-full rounded-lg border bg-white/5 pl-10 pr-10 text-sm text-white',
                  'placeholder:text-blue-300/30',
                  'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  resetErrors.confirmPassword
                    ? 'border-destructive focus-visible:ring-destructive'
                    : 'border-white/10 hover:border-white/20',
                )}
                aria-invalid={!!resetErrors.confirmPassword}
                aria-describedby={
                  resetErrors.confirmPassword ? 'confirm-password-error' : undefined
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
            {resetErrors.confirmPassword && (
              <p
                id="confirm-password-error"
                role="alert"
                className="mt-1 text-xs text-destructive flex items-center gap-1"
              >
                <AlertTriangle className="h-3 w-3" />
                {resetErrors.confirmPassword.message}
              </p>
            )}
          </div>

          <Button
            type="submit"
            size="lg"
            loading={resetting}
            className="w-full mt-2 bg-primary hover:bg-primary/90 text-white font-semibold shadow-lg shadow-primary/20"
          >
            {resetting ? 'Resetting…' : 'Reset password'}
          </Button>
        </form>

        <p className="text-center text-sm text-blue-200/60">
          <Link
            href="/forgot-password"
            onClick={() => setStage('request')}
            className="font-medium text-primary hover:text-primary/80 transition-colors"
          >
            Didn&apos;t receive it? Request a new link
          </Link>
        </p>

        <Link
          href="/login"
          className="flex items-center justify-center gap-1.5 text-sm text-blue-200/60 hover:text-blue-200 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to sign in
        </Link>
      </div>
    );
  }

  // ── Stage: initial request ──────────────────────────────────────────────────
  return (
    <form
      onSubmit={(e) => void requestForm.handleSubmit(onRequest)(e)}
      noValidate
      className="space-y-4"
    >
      <p className="text-sm text-blue-200/70 leading-relaxed">
        Enter your registered email address and we&apos;ll send you instructions
        to reset your password.
      </p>

      {requestErrors.root && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-3 text-sm text-destructive"
        >
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          {requestErrors.root.message}
        </div>
      )}

      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-blue-100 mb-1.5"
        >
          Email address
        </label>
        <div className="relative">
          <Mail
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-300/60 pointer-events-none"
            aria-hidden="true"
          />
          <input
            id="email"
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck="false"
            placeholder="doctor@hospital.org"
            {...requestForm.register('email')}
            className={cn(
              'flex h-10 w-full rounded-lg border bg-white/5 pl-10 pr-4 text-sm text-white',
              'placeholder:text-blue-300/30',
              'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              requestErrors.email
                ? 'border-destructive focus-visible:ring-destructive'
                : 'border-white/10 hover:border-white/20',
            )}
            aria-invalid={!!requestErrors.email}
            aria-describedby={requestErrors.email ? 'email-error' : undefined}
          />
        </div>
        {requestErrors.email && (
          <p
            id="email-error"
            role="alert"
            className="mt-1 text-xs text-destructive flex items-center gap-1"
          >
            <AlertTriangle className="h-3 w-3" />
            {requestErrors.email.message}
          </p>
        )}
      </div>

      <Button
        type="submit"
        size="lg"
        loading={requestForm.formState.isSubmitting}
        className="w-full mt-2 bg-primary hover:bg-primary/90 text-white font-semibold shadow-lg shadow-primary/20"
      >
        {requestForm.formState.isSubmitting ? 'Sending…' : 'Send reset instructions'}
      </Button>

      <div className="mt-3 flex items-start gap-2 text-xs text-blue-300/50">
        <Shield className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
        <p>
          For security, this system only reveals whether an account exists for a
          registered email for your own safety.
        </p>
      </div>

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