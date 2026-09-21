import { cookies } from 'next/headers';
import type { AuthenticatedUserDto } from '@medivault/shared';

/**
 * Server-side session data
 */
export interface ServerSession {
  user: AuthenticatedUserDto;
  accessToken: string;
  expiresAt: number;
}

/**
 * Retrieves the current session on the server side.
 *
 * Reads the access token from the HttpOnly cookie set by the backend,
 * validates it against the backend /auth/session endpoint, and returns
 * the session or null if unauthenticated / token is expired.
 *
 * This is a server component utility — do not call from client components.
 * Use the useAuthStore hook from client components instead.
 */
export async function getServerSession(): Promise<ServerSession | null> {
  const cookieStore = cookies();
  const accessToken = cookieStore.get('access_token')?.value;

  if (!accessToken) {
    return null;
  }

  try {
    // BACKEND_API_URL is the base origin (e.g. http://localhost:3001)
    // NEXT_PUBLIC_API_URL already includes /api/v1 — use BACKEND_API_URL here
    const apiBase =
      process.env.BACKEND_API_URL ?? 'http://localhost:3001';

    const response = await fetch(`${apiBase}/api/v1/auth/session`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return null;
    }

    // Backend wraps all responses via TransformInterceptor:
    // { success: true, data: { user, accessToken, expiresAt } }
    const body = await response.json() as {
      success?: boolean;
      data?: { user: AuthenticatedUserDto; accessToken: string; expiresAt: number };
      // fallback: unwrapped shape
      user?: AuthenticatedUserDto;
      expiresAt?: number;
    };

    const payload = body.data ?? body as { user: AuthenticatedUserDto; accessToken: string; expiresAt: number };

    if (!payload?.user) {
      return null;
    }

    return {
      user: payload.user,
      accessToken: payload.accessToken ?? accessToken,
      expiresAt: payload.expiresAt ?? Date.now() + 15 * 60 * 1000,
    };
  } catch {
    // Network error or invalid token — treat as unauthenticated
    return null;
  }
}

/**
 * Throws a redirect to /login if the session is not valid.
 * Use in protected server components and page.tsx files.
 */
export async function requireServerSession(): Promise<ServerSession> {
  const session = await getServerSession();
  if (!session) {
    const { redirect } = await import('next/navigation');
    redirect('/login');
  }
  return session!;
}
