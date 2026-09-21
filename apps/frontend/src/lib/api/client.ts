/**
 * Axios API client with automatic token refresh and auth interceptors.
 *
 * Flow:
 *   1. Attach access token from auth store to every request.
 *   2. On 401 response, attempt a silent token refresh via /auth/refresh.
 *   3. If refresh succeeds, retry the original request with the new token.
 *   4. If refresh fails (session expired), redirect to /login.
 *
 * Security:
 *   - Access token stays in memory (Zustand store), never in localStorage.
 *   - Refresh token is in an HttpOnly cookie — not accessible from JS.
 *   - Failed refresh clears client auth state and redirects.
 */

import axios, {
  AxiosError,
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";

// Extend Axios config to track retry state
interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

// ─── Base Configuration ───────────────────────────────────────────────────────
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30_000,
  withCredentials: true, // Send HttpOnly cookies (refresh token)
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// ─── Token getter (injected at runtime by the auth store) ────────────────────
// This avoids circular imports between the client and the Zustand store.
let getAccessToken: (() => string | null) | null = null;
let clearSession: (() => void) | null = null;

export function injectAuthHandlers(
  tokenGetter: () => string | null,
  sessionClearer: () => void,
) {
  getAccessToken = tokenGetter;
  clearSession = sessionClearer;
}

// ─── Request interceptor — attach access token ───────────────────────────────
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getAccessToken?.();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // FormData bodies: let the browser/XHR set Content-Type with the boundary.
    // Manual "multipart/form-data" headers (without boundary) make multer fail
    // with "Multipart: Boundary not found" (HTTP 400/500), because axios's xhr
    // adapter does not compute a boundary itself.
    if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
      config.headers.delete('Content-Type');
    }
    // Add a unique request ID for tracing
    config.headers["X-Request-ID"] = crypto.randomUUID();
    return config;
  },
  (error: AxiosError) => Promise.reject(error),
);

// ─── Success response unwrap — backend TransformInterceptor ──────────────────
// Every backend success response is wrapped as { success: true, data, timestamp,
// requestId }. Unwrap here so all callers receive the payload directly.
apiClient.interceptors.response.use((response: AxiosResponse) => {
  const body = response.data as { success?: boolean; data?: unknown } | undefined;
  if (body && typeof body === "object" && body.success === true && "data" in body) {
    response.data = body.data;
  }
  return response;
});

// ─── Response interceptor — handle 401 / token refresh ───────────────────────
//
// Race-condition-safe design:
//   - `activeRefreshPromise` holds the single in-flight refresh Promise.
//   - Any concurrent 401s share that same promise and wait for its result.
//   - Only one POST /auth/refresh ever fires per refresh cycle, preventing
//     token-reuse detection from being triggered on the backend.
//
let activeRefreshPromise: Promise<string> | null = null;

function executeRefresh(): Promise<string> {
  // If a refresh is already in flight, reuse it — do NOT start a second one.
  if (activeRefreshPromise) return activeRefreshPromise;

  activeRefreshPromise = axios
    .post<{ accessToken?: string; data?: { accessToken?: string } }>(
      `${API_BASE_URL}/auth/refresh`,
      {},
      { withCredentials: true },
    )
    .then(async (res) => {
      // Handle both the raw payload and the TransformInterceptor shape.
      const newToken = res.data.accessToken ?? res.data.data?.accessToken ?? "";
      // Update the in-memory token via the store (dynamic import avoids circular deps)
      const { useAuthStore } = await import("@/lib/stores/auth.store");
      useAuthStore.getState().setAccessToken(newToken);
      return newToken;
    })
    .finally(() => {
      // Clear the shared promise so the next refresh cycle can run fresh.
      activeRefreshPromise = null;
    });

  return activeRefreshPromise;
}

apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryableRequestConfig | undefined;

    // Only handle 401 Unauthorized; don't retry already-retried requests,
    // and don't try to refresh if the failing request IS the refresh or logout call
    // (that would cause an infinite loop).
    const requestUrl = originalRequest?.url ?? "";
    const isAuthEndpoint =
      requestUrl.includes("/auth/refresh") ||
      requestUrl.includes("/auth/logout") ||
      requestUrl.includes("/auth/login") ||
      requestUrl.includes("/auth/register");

    if (
      error.response?.status !== 401 ||
      originalRequest?._retry ||
      !originalRequest ||
      isAuthEndpoint
    ) {
      return Promise.reject(normalizeError(error));
    }

    // Mark this request as retried so we don't loop on a second 401
    originalRequest._retry = true;

    try {
      // All concurrent 401s share the same refresh promise — only one HTTP call fires
      const newAccessToken = await executeRefresh();
      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
      return apiClient(originalRequest);
    } catch (refreshError) {
      // Refresh failed — clear session and redirect to login.
      // If we're already on a public auth page, don't redirect: assigning
      // window.location.href to the current URL triggers a FULL page reload,
      // which remounts AuthInitializer → initialize() → another /auth/session
      // → another failed refresh, causing an infinite reload loop.
      clearSession?.();
      if (
        typeof window !== "undefined" &&
        !isPublicAuthPage(window.location.pathname)
      ) {
        window.location.replace("/login?reason=session_expired");
      }
      return Promise.reject(normalizeError(refreshError as AxiosError));
    }
  },
);

// ─── Error normalization ─────────────────────────────────────────────────────

/** Public auth pages — never auto-redirect to login from these (would reload-loop). */
function isPublicAuthPage(pathname: string): boolean {
  return (
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/forgot-password")
  );
}

export interface ApiError {
  message: string;
  statusCode: number;
  errors?: Record<string, string[]>;
  requestId?: string;
}

export function normalizeError(error: unknown): ApiError {
  if (axios.isAxiosError(error)) {
    const response = error.response;
    if (response?.data) {
      const data = response.data as {
        message?: string | string[];
        error?: { message?: string };
        statusCode?: number;
        errors?: Record<string, string[]>;
        requestId?: string;
      };
      return {
        message: Array.isArray(data.message)
          ? data.message.join(", ")
          : (data.message ?? data.error?.message ?? "An error occurred"),
        statusCode: data.statusCode ?? response.status,
        errors: data.errors,
        requestId: data.requestId,
      };
    }
    return {
      message: error.message ?? "Network error",
      statusCode: error.response?.status ?? 0,
    };
  }
  return {
    message: error instanceof Error ? error.message : "Unknown error",
    statusCode: 0,
  };
}

export function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    "message" in error
  );
}
