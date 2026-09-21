/**
 * Zustand auth store — client-side authentication state.
 *
 * Security model:
 *   - Access token stored in memory ONLY (not localStorage, not sessionStorage).
 *   - Refresh token lives in an HttpOnly cookie set by the backend.
 *   - On page reload, the access token is retrieved from the backend via
 *     the /auth/session endpoint using the HttpOnly cookie.
 *
 * This store is the single source of truth for:
 *   - Current user info
 *   - Auth loading/error states
 *   - Access token (in-memory)
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { AuthenticatedUserDto, LoginDto, AuthResponseDto } from '@medivault/shared';
import { apiClient, injectAuthHandlers } from '@/lib/api/client';

// ─── State Shape ──────────────────────────────────────────────────────────────
interface AuthState {
  // Session state
  user: AuthenticatedUserDto | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean; // True once the initial session check has completed
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  login: (credentials: LoginDto) => Promise<void>;
  logout: () => Promise<void>;
  setAccessToken: (token: string) => void;
  clearError: () => void;
  updateUser: (user: Partial<AuthenticatedUserDto>) => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────
// Module-level promise so concurrent initialize() calls share one in-flight request.
let initializePromise: Promise<void> | null = null;

export const useAuthStore = create<AuthState>()(
  devtools(
    (set, get) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
      isInitialized: false,
      error: null,

      /**
       * Called once on app mount — restores session from HttpOnly cookie.
       * Concurrent calls are deduplicated: only one /auth/session request
       * ever fires at a time, regardless of how many callers invoke this.
       */
      initialize: async () => {
        if (get().isInitialized) return;
        if (initializePromise) return initializePromise;

        // Public auth pages (login/register/forgot-password) have no session
        // by definition — probing /auth/session here produces a guaranteed 401
        // → refresh attempt → failed-refresh redirect → full page reload loop.
        // Mark as initialized and give up without touching the network.
        if (
          typeof window !== 'undefined' &&
          isPublicAuthPage(window.location.pathname)
        ) {
          set({ isLoading: false, isInitialized: true });
          return;
        }

        initializePromise = (async () => {
          set({ isLoading: true });
          try {
            const response = await apiClient.get<
              | {
                  success: boolean;
                  data: {
                    user: AuthenticatedUserDto;
                    accessToken: string;
                    expiresAt: number;
                  };
                }
              | {
                  user: AuthenticatedUserDto;
                  accessToken: string;
                  expiresAt: number;
                }
            >('/auth/session');

            const payload =
              'data' in response.data ? response.data.data : response.data;

            set({
              user: payload.user,
              accessToken: payload.accessToken,
              isAuthenticated: true,
            });
          } catch {
            set({ user: null, accessToken: null, isAuthenticated: false });
          } finally {
            set({ isLoading: false, isInitialized: true });
            initializePromise = null;
          }
        })();

        return initializePromise;
      },

      /**
       * Authenticates a user with email + password.
       * On success, stores the access token in memory and the backend
       * sets the refresh token as an HttpOnly cookie.
       */
      login: async (credentials: LoginDto) => {
        set({ isLoading: true, error: null });
        try {
          const body: LoginDto = {
            email: credentials.email,
            password: credentials.password,
            ...(credentials.deviceFingerprint
              ? { deviceFingerprint: credentials.deviceFingerprint }
              : {}),
          };
          const response = await apiClient.post<
            { success: boolean; data: AuthResponseDto } | AuthResponseDto
          >('/auth/login', body);

          // TransformInterceptor wraps: { success, data: AuthResponseDto }
          const payload = 'data' in response.data ? response.data.data : response.data;
          const { accessToken, user } = payload;

          set({
            user,
            accessToken,
            isAuthenticated: true,
            error: null,
          });
        } catch (err) {
          const message =
            isApiErrorLike(err)
              ? err.message
              : 'Login failed. Please check your credentials.';
          set({ error: message, isAuthenticated: false });
          throw err;
        } finally {
          set({ isLoading: false });
        }
      },

      /**
       * Logs out the current user.
       * Calls the backend to revoke the refresh token and clears HttpOnly cookies.
       * isInitialized is reset so the next login triggers a fresh initialize().
       */
      logout: async () => {
        set({ isLoading: true });
        try {
          await apiClient.post('/auth/logout');
        } catch {
          // Proceed with local logout even if the API call fails
        } finally {
          set({
            user: null,
            accessToken: null,
            isAuthenticated: false,
            isLoading: false,
            isInitialized: false, // Reset so AuthInitializer fires again after next login
            error: null,
          });
        }
      },

      /**
       * Called by the API client after a successful token refresh.
       */
      setAccessToken: (token: string) => {
        set({ accessToken: token, isAuthenticated: true });
      },

      clearError: () => set({ error: null }),

      updateUser: (updates: Partial<AuthenticatedUserDto>) => {
        const current = get().user;
        if (current) {
          set({ user: { ...current, ...updates } });
        }
      },
    }),
    { name: 'MedivaultAuth' },
  ),
);

// ─── Inject auth handlers into the API client ────────────────────────────────
// This wires up the access token getter so the request interceptor can attach
// the token, and the session clearer for use on failed refresh.
//
// IMPORTANT: clearSession does NOT call logout() (which would hit /auth/logout
// over the network). By the time clearSession is called, the refresh token is
// already invalid — making a network call would just produce another 401 and
// risk triggering the reuse-detection chain again. We clear local state only;
// the backend session was already invalidated by the failed refresh.
injectAuthHandlers(
  () => useAuthStore.getState().accessToken,
  () => {
    useAuthStore.setState({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
      isInitialized: false,
      error: null,
    });
  },
);

// ─── Selector hooks ───────────────────────────────────────────────────────────
export const useCurrentUser = () => useAuthStore((s) => s.user);
export const useIsAuthenticated = () => useAuthStore((s) => s.isAuthenticated);
export const useAuthLoading = () => useAuthStore((s) => s.isLoading);
export const useAuthInitialized = () => useAuthStore((s) => s.isInitialized);
export const useAuthError = () => useAuthStore((s) => s.error);

// ─── Type guard helper ────────────────────────────────────────────────────────
function isPublicAuthPage(pathname: string): boolean {
  return (
    pathname.startsWith('/login') ||
    pathname.startsWith('/register') ||
    pathname.startsWith('/forgot-password')
  );
}

function isApiErrorLike(err: unknown): err is { message: string } {
  return typeof err === 'object' && err !== null && 'message' in err;
}
