'use client';

import * as React from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Shield, Lock, Mail, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useAuthStore } from '@/lib/stores/auth.store';
import { cn } from '@/lib/utils';

// ─── Validation schema ────────────────────────────────────────────────────────
const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Enter a valid email address'),
  password: z
    .string()
    .min(1, 'Password is required')
    .min(8, 'Password must be at least 8 characters'),
  rememberMe: z.boolean().optional(),
});

type LoginFormValues = z.infer<typeof loginSchema>;

// ─── Login Page ───────────────────────────────────────────────────────────────
// useSearchParams() must be rendered under a Suspense boundary or static
// generation of this page fails (missing-suspense-with-csr-bailout).
export default function LoginPage() {
  return (
    <React.Suspense fallback={null}>
      <LoginForm />
    </React.Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, isLoading } = useAuthStore();
  const [showPassword, setShowPassword] = React.useState(false);
  const [loginAttempts, setLoginAttempts] = React.useState(0);

  // Check for session-expired or logout reason
  const reason = searchParams.get('reason');

  // Optional post-login redirect (intra-app only — blocks open-redirect via //evil.com)
  const rawRedirect = searchParams.get('redirect');
  const redirectPath =
    rawRedirect &&
    rawRedirect.startsWith('/') &&
    !rawRedirect.startsWith('//') &&
    !rawRedirect.includes('://')
      ? rawRedirect
      : null;

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { rememberMe: false },
  });

  const onSubmit = async (data: LoginFormValues) => {
    try {
      await login({
        email: data.email,
        password: data.password,
        rememberMe: data.rememberMe,
      });
      toast.success('Welcome back!');
      router.push(redirectPath ?? '/dashboard');
    } catch (err: unknown) {
      const newAttempts = loginAttempts + 1;
      setLoginAttempts(newAttempts);

      const message =
        isErrorLike(err) && err.message
          ? err.message
          : 'Invalid email or password.';

      toast.warning(message);

      // Map common server errors to form field errors
      if (message.toLowerCase().includes('email')) {
        setError('email', { message });
      } else if (message.toLowerCase().includes('password')) {
        setError('password', { message });
      } else if (message.toLowerCase().includes('locked')) {
        setError('root', {
          message: 'Account temporarily locked due to repeated failed attempts. Try again later.',
        });
      } else {
        setError('root', { message });
      }
    }
  };

  return (
    <div className="w-full">
      {/* Session expired banner */}
      {reason === 'session_expired' && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-4 py-3 text-sm text-amber-300">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          Your session has expired. Please sign in again.
        </div>
      )}

      <Card className="border-white/10 bg-white/5 backdrop-blur-md shadow-2xl">
        {/* Card Header */}
        <CardHeader className="pb-4">
          <div className="flex flex-col items-center gap-3">
            {/* Logo */}
            <Image
              src="/medivault-logo.png"
              alt="Medivault"
              width={1392}
              height={1130}
              priority
              className="h-14 w-auto"
            />
            <div className="text-center">
              <p className="text-sm text-blue-200/70 mt-0.5">
                Medical Records Management System
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <form
            onSubmit={(e) => void handleSubmit(onSubmit)(e)}
            noValidate
            className="space-y-4"
          >
            {/* Root / server error */}
            {errors.root && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-3 text-sm text-destructive"
              >
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                {errors.root.message}
              </div>
            )}

            {/* Rate limit warning after 3 failed attempts */}
            {loginAttempts >= 3 && !errors.root?.message?.includes('locked') && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs text-amber-300"
              >
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                Multiple failed attempts detected. Your account may be temporarily locked.
              </div>
            )}

            {/* Email */}
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
                  {...register('email')}
                  className={cn(
                    'flex h-10 w-full rounded-lg border bg-white/5 pl-10 pr-4 text-sm text-white',
                    'placeholder:text-blue-300/30',
                    'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    errors.email
                      ? 'border-destructive focus-visible:ring-destructive'
                      : 'border-white/10 hover:border-white/20',
                  )}
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? 'email-error' : undefined}
                />
              </div>
              {errors.email && (
                <p id="email-error" role="alert" className="mt-1 text-xs text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {errors.email.message}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="text-sm font-medium text-blue-100">
                  Password
                </label>
                <a
                  href="/forgot-password"
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded"
                >
                  Forgot password?
                </a>
              </div>
              <div className="relative">
                <Lock
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-300/60 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  {...register('password')}
                  className={cn(
                    'flex h-10 w-full rounded-lg border bg-white/5 pl-10 pr-10 text-sm text-white',
                    'placeholder:text-blue-300/30',
                    'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    errors.password
                      ? 'border-destructive focus-visible:ring-destructive'
                      : 'border-white/10 hover:border-white/20',
                  )}
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? 'password-error' : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-300/60 hover:text-blue-300 transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p id="password-error" role="alert" className="mt-1 text-xs text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {errors.password.message}
                </p>
              )}
            </div>

            {/* Remember me */}
            <div className="flex items-center gap-2">
              <input
                id="rememberMe"
                type="checkbox"
                {...register('rememberMe')}
                className="h-4 w-4 rounded border-white/20 bg-white/5 text-primary focus:ring-primary"
              />
              <label htmlFor="rememberMe" className="text-sm text-blue-200/70">
                Remember me on this device
              </label>
            </div>

            {/* Submit */}
            <Button
              type="submit"
              size="lg"
              loading={isLoading}
              className="w-full mt-2 bg-primary hover:bg-primary/90 text-white font-semibold shadow-lg shadow-primary/20"
            >
              {isLoading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          {/* Security notice */}
          <div className="mt-5 flex items-start gap-2 text-xs text-blue-300/50">
            <Shield className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <p>
              This system contains protected health information (PHI). All access
              is monitored and logged. Unauthorized access is prohibited.
            </p>
          </div>

          {/* Register link */}
          <p className="mt-4 text-center text-sm text-blue-200/60">
            Don&apos;t have an account?{' '}
            <a
              href="/register"
              className="font-medium text-primary hover:text-primary/80 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary rounded"
            >
              Create one
            </a>
          </p>
        </CardContent>
      </Card>

      <p className="mt-4 text-center text-xs text-blue-300/30">
        © {new Date().getFullYear()} Medivault. All rights reserved.
      </p>
    </div>
  );
}

function isErrorLike(err: unknown): err is { message: string } {
  return typeof err === 'object' && err !== null && 'message' in err;
}
