import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { AppShell } from '@/components/layout/app-shell';

/**
 * Authenticated app layout.
 *
 * Guards all routes under (app)/ with a server-side cookie presence check.
 * We check for the refresh_token cookie (7-day lifetime) rather than the
 * access_token (15-min lifetime) to avoid redirect loops caused by the
 * access token expiring between requests. The actual token validation and
 * client-side auth state restoration is handled by AuthInitializer →
 * useAuthStore.initialize() → GET /auth/session on the client.
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = cookies();
  const hasSession =
    cookieStore.has('refresh_token') || cookieStore.has('access_token');

  if (!hasSession) {
    redirect('/login');
  }

  return <AppShell>{children}</AppShell>;
}
