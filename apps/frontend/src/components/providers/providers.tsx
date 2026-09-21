'use client';

import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useAuthStore } from '@/lib/stores/auth.store';

interface ProvidersProps {
  children: React.ReactNode;
}

/**
 * Fires initialize() exactly once on mount, regardless of store re-renders.
 * Using a ref instead of reading isInitialized from the store prevents a
 * feedback loop where initialize() setting isLoading=true causes a re-render
 * that fires initialize() again before isInitialized flips to true.
 */
function AuthInitializer() {
  const hasFired = React.useRef(false);

  React.useEffect(() => {
    if (hasFired.current) return;
    hasFired.current = true;
    void useAuthStore.getState().initialize();
  }, []); // empty deps — intentionally runs once on mount only

  return null;
}

/**
 * Client-side providers wrapper.
 * Wraps the app with QueryClientProvider and any other context providers.
 */
export function Providers({ children }: ProvidersProps) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,          // 1 minute
            gcTime: 5 * 60 * 1000,         // 5 minutes
            retry: (failureCount, error) => {
              // Don't retry on auth errors
              if (error instanceof Error && 'status' in error) {
                const status = (error as { status: number }).status;
                if (status === 401 || status === 403) return false;
              }
              return failureCount < 2;
            },
            refetchOnWindowFocus: false,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthInitializer />
      {children}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
      )}
    </QueryClientProvider>
  );
}
