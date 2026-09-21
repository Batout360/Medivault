import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

/**
 * Root page — redirects to /dashboard if a session cookie exists, /login if not.
 */
export default function RootPage() {
  const cookieStore = cookies();
  const hasSession =
    cookieStore.has('refresh_token') || cookieStore.has('access_token');

  if (hasSession) {
    redirect('/dashboard');
  } else {
    redirect('/login');
  }
}
