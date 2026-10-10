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

export default function ForgotPasswordPage() {
  return (
    <div className="w-full">
      <Card className="border-sidebar-border bg-sidebar-accent shadow-2xl">
        <CardHeader className="pb-4">
          <div className="flex flex-col items-center gap-3">
            <Image
              src="/medivault-logo.png"
              alt="Medivault"
              width={1392}
              height={1130}
              priority
              className="h-14 w-auto brightness-0 invert"
            />
            <p className="text-sm text-sidebar-foreground/60">Reset your password</p>
          </div>
        </CardHeader>
        <CardContent>
          <ForgotPasswordForm />
        </CardContent>
      </Card>
      <p className="mt-4 text-center text-xs text-sidebar-foreground/30">
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

  const requestForm = useForm<RequestFormValues>({ resolver: zodResolver(requestSchema) });
  const resetForm = useForm<ResetFormValues>({ resolver: zodResolver(resetSchema) });

  const onRequest = async (data: RequestFormValues) => {
    try {
      await apiClient.post('/auth/forgot-password', { email: data.email });
      setStage('sent');
      resetForm.setValue('token', '');
      toast.success('Check your inbox — reset instructions have been sent.');
    } catch (err: unknown) {
      const msg = isErrorLike(err) && err.message ? err.message : 'Failed to send reset instructions. Please try again.';
      toast.warning(msg);
      requestForm.setError('root', { message: msg });
    }
  };

  const onReset = async (data: ResetFormValues) => {
    setResetting(true);
    try {
      await apiClient.post('/auth/reset-password', { token: data.token, newPassword: data.newPassword });
      setStage('reset');
      toast.success('Password reset successfully. Please sign in.');
    } catch (err: unknown) {
      const msg = isErrorLike(err) && err.message ? err.message : 'Reset failed. Please check your token and try again.';
      toast.warning(msg);
      resetForm.setError('root', { message: msg });
    } finally {
      setResetting(false);
    }
  };

  const reqErr = requestForm.formState.errors;
  const rstErr = resetForm.formState.errors;

  const inputCls = (hasError: boolean) =>
    cn(
      'flex h-10 w-full rounded-md border bg-sidebar/60 pl-10 pr-4 text-sm text-sidebar-foreground',
      'placeholder:text-sidebar-foreground/30 transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
      hasError
        ? 'border-alert-red-600 focus-visible:ring-alert-red-600'
        : 'border-sidebar-border hover:border-sidebar-foreground/30',
    );

  const errMsg = (msg: string | undefined, id: string) =>
    msg ? (
      <p id={id} role="alert" className="mt-1 text-xs text-alert-red-400 flex items-center gap-1">
        <AlertTriangle className="h-3 w-3" />
        {msg}
      </p>
    ) : null;

  // ── Reset complete ──────────────────────────────────────────────────────────
  if (stage === 'reset') {
    return (
      <div className="flex flex-col items-center gap-4 text-center py-2">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-clinical-green-900/30 ring-1 ring-clinical-green-600/40">
          <CheckCircle2 className="h-8 w-8 text-clinical-green-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-sidebar-foreground">Password reset successful!</h2>
          <p className="mt-1 text-sm text-sidebar-foreground/60">
            Your password has been updated. Sign in with your new password to continue.
          </p>
        </div>
        <Button
          size="lg"
          className="mt-2 w-full bg-sidebar-primary hover:bg-sidebar-primary/90 text-white font-semibold"
          onClick={() => router.push('/login')}
        >
          Back to sign in
        </Button>
      </div>
    );
  }

  // ── Instructions sent ──────────────────────────────────────────────────────
  if (stage === 'sent') {
    return (
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-lg bg-clinical-green-950/40 border border-clinical-green-700/40 px-4 py-3 text-sm text-clinical-green-300">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <p>
            If an account exists for that email, a password reset link has been sent.
            Check your inbox (and spam folder) for instructions.
          </p>
        </div>

        <div className="rounded-md border border-sidebar-border bg-sidebar/60 px-4 py-3">
          <p className="text-sm text-sidebar-foreground/60">
            Received the reset link? Enter the token from the email and choose a new password below.
          </p>
        </div>

        <form onSubmit={(e) => void resetForm.handleSubmit(onReset)(e)} noValidate className="space-y-4">
          {rstErr.root && (
            <div role="alert" className="flex items-start gap-2 rounded-lg bg-alert-red-950/60 border border-alert-red-700/40 px-3 py-3 text-sm text-alert-red-300">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              {rstErr.root.message}
            </div>
          )}

          {/* Token */}
          <div>
            <label htmlFor="token" className="block text-sm font-medium text-sidebar-foreground mb-1.5">Reset token</label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sidebar-foreground/40 pointer-events-none" aria-hidden="true" />
              <input id="token" type="text" autoComplete="off" spellCheck="false"
                placeholder="Paste the token from the reset email"
                {...resetForm.register('token')}
                className={cn(inputCls(!!rstErr.token))}
                aria-invalid={!!rstErr.token} aria-describedby={rstErr.token ? 'token-error' : undefined}
              />
            </div>
            {errMsg(rstErr.token?.message, 'token-error')}
          </div>

          {/* New password */}
          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium text-sidebar-foreground mb-1.5">New password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sidebar-foreground/40 pointer-events-none" aria-hidden="true" />
              <input id="newPassword" type={showPassword ? 'text' : 'password'} autoComplete="new-password"
                placeholder="••••••••••••"
                {...resetForm.register('newPassword')}
                className={cn(inputCls(!!rstErr.newPassword), 'pr-10')}
                aria-invalid={!!rstErr.newPassword} aria-describedby={rstErr.newPassword ? 'new-pw-error' : 'new-pw-hint'}
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-sidebar-foreground/40 hover:text-sidebar-foreground transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {rstErr.newPassword
              ? errMsg(rstErr.newPassword.message, 'new-pw-error')
              : <p id="new-pw-hint" className="mt-1 text-xs text-sidebar-foreground/40">12+ characters with uppercase, lowercase, digit and special character.</p>}
          </div>

          {/* Confirm password */}
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-sidebar-foreground mb-1.5">Confirm new password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sidebar-foreground/40 pointer-events-none" aria-hidden="true" />
              <input id="confirmPassword" type={showConfirm ? 'text' : 'password'} autoComplete="new-password"
                placeholder="••••••••••••"
                {...resetForm.register('confirmPassword')}
                className={cn(inputCls(!!rstErr.confirmPassword), 'pr-10')}
                aria-invalid={!!rstErr.confirmPassword} aria-describedby={rstErr.confirmPassword ? 'confirm-pw-error' : undefined}
              />
              <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-sidebar-foreground/40 hover:text-sidebar-foreground transition-colors"
                aria-label={showConfirm ? 'Hide password' : 'Show password'}>
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errMsg(rstErr.confirmPassword?.message, 'confirm-pw-error')}
          </div>

          <Button type="submit" size="lg" loading={resetting}
            className="w-full mt-2 bg-sidebar-primary hover:bg-sidebar-primary/90 text-white font-semibold">
            {resetting ? 'Resetting…' : 'Reset password'}
          </Button>
        </form>

        <p className="text-center text-sm text-sidebar-foreground/50">
          <Link href="/forgot-password" onClick={() => setStage('request')}
            className="font-medium text-sidebar-primary hover:text-sidebar-primary/80 transition-colors">
            Didn&apos;t receive it? Request a new link
          </Link>
        </p>
        <Link href="/login" className="flex items-center justify-center gap-1.5 text-sm text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" />Back to sign in
        </Link>
      </div>
    );
  }

  // ── Initial request ────────────────────────────────────────────────────────
  return (
    <form onSubmit={(e) => void requestForm.handleSubmit(onRequest)(e)} noValidate className="space-y-4">
      <p className="text-sm text-sidebar-foreground/60 leading-relaxed">
        Enter your registered email address and we&apos;ll send you instructions to reset your password.
      </p>

      {reqErr.root && (
        <div role="alert" className="flex items-start gap-2 rounded-lg bg-alert-red-950/60 border border-alert-red-700/40 px-3 py-3 text-sm text-alert-red-300">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          {reqErr.root.message}
        </div>
      )}

      <div>
        <label htmlFor="fp-email" className="block text-sm font-medium text-sidebar-foreground mb-1.5">Email address</label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sidebar-foreground/40 pointer-events-none" aria-hidden="true" />
          <input id="fp-email" type="email" autoComplete="email" autoCapitalize="none" spellCheck="false"
            placeholder="doctor@hospital.org"
            {...requestForm.register('email')}
            className={cn(inputCls(!!reqErr.email))}
            aria-invalid={!!reqErr.email} aria-describedby={reqErr.email ? 'fp-email-error' : undefined}
          />
        </div>
        {errMsg(reqErr.email?.message, 'fp-email-error')}
      </div>

      <Button type="submit" size="lg" loading={requestForm.formState.isSubmitting}
        className="w-full mt-2 bg-sidebar-primary hover:bg-sidebar-primary/90 text-white font-semibold">
        {requestForm.formState.isSubmitting ? 'Sending…' : 'Send reset instructions'}
      </Button>

      <div className="mt-3 flex items-start gap-2 text-xs text-sidebar-foreground/40">
        <Shield className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
        <p>For security, this system only reveals whether an account exists for a registered email for your own safety.</p>
      </div>

      <Link href="/login" className="flex items-center justify-center gap-1.5 text-sm text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" />Back to sign in
      </Link>
    </form>
  );
}

function isErrorLike(err: unknown): err is { message: string } {
  return typeof err === 'object' && err !== null && 'message' in err;
}
