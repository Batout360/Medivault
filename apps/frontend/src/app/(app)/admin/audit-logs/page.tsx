'use client';

import * as React from 'react';
import {
  Search,
  Filter,
  Download,
  ChevronLeft,
  ChevronRight,
  X,
  Shield,
  Eye,
  LogIn,
  LogOut,
  UserPlus,
  Edit,
  Trash2,
  Fingerprint,
  Lock,
  AlertTriangle,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SkeletonTable } from '@/components/ui/skeleton';
import { apiClient } from '@/lib/api/client';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────
interface AuditLog {
  id: string;
  eventType: string;
  action: string;
  userId: string | null;
  userEmail: string | null;
  userRole: string | null;
  resourceType: string | null;
  resourceId: string | null;
  ipAddress: string | null;
  result: 'SUCCESS' | 'FAILURE' | 'DENIED';
  details: string | null;
  requestId: string | null;
  sessionId: string | null;
  createdAt: string;
}

interface PaginatedAuditLogs {
  data: AuditLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const LIMIT = 25;

// ─── Event type icons ─────────────────────────────────────────────────────────
const eventIcons: Record<string, React.ElementType> = {
  LOGIN: LogIn,
  LOGOUT: LogOut,
  FAILED_LOGIN: Lock,
  PATIENT_CREATE: UserPlus,
  PATIENT_VIEW: Eye,
  PATIENT_UPDATE: Edit,
  PATIENT_DELETE: Trash2,
  RECORD_CREATE: Edit,
  RECORD_VIEW: Eye,
  BIOMETRIC_ENROLL: Fingerprint,
  BIOMETRIC_IDENTIFY: Fingerprint,
  BIOMETRIC_FAILED: AlertTriangle,
  PERMISSION_CHANGE: Shield,
};

// ─── Result badge ─────────────────────────────────────────────────────────────
function ResultBadge({ result }: { result: AuditLog['result'] }) {
  const variants = {
    SUCCESS: 'success' as const,
    FAILURE: 'destructive' as const,
    DENIED: 'warning' as const,
  };
  return <Badge variant={variants[result]}>{result}</Badge>;
}

// ─── Audit Logs Page ──────────────────────────────────────────────────────────
export default function AuditLogsPage() {
  const [rawSearch, setRawSearch] = React.useState('');
  const [eventType, setEventType] = React.useState('');
  const [result, setResult] = React.useState('');
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [showFilters, setShowFilters] = React.useState(false);

  const searchQuery = useDebounce(rawSearch, 500);

  React.useEffect(() => {
    setPage(1);
  }, [searchQuery, eventType, result, dateFrom, dateTo]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['audit-logs', searchQuery, eventType, result, dateFrom, dateTo, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (searchQuery) params.set('q', searchQuery);
      if (eventType) params.set('eventType', eventType);
      if (result) params.set('result', result);
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', dateTo);
      const res = await apiClient.get<PaginatedAuditLogs>(`/audit-logs?${params.toString()}`);
      return res.data;
    },
    staleTime: 15_000,
  });

  const clearFilters = () => {
    setEventType('');
    setResult('');
    setDateFrom('');
    setDateTo('');
  };

  const hasFilters = !!(eventType || result || dateFrom || dateTo);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Audit Logs
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Immutable record of all system activity. Logs cannot be modified or deleted.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => toast.info('Export feature coming soon')}
        >
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Search + filters */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                type="search"
                value={rawSearch}
                onChange={(e) => setRawSearch(e.target.value)}
                placeholder="Search by user, action, resource, IP…"
                className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
              {rawSearch && (
                <button
                  onClick={() => setRawSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Button
              variant={showFilters ? 'default' : 'outline'}
              size="icon"
              onClick={() => setShowFilters(!showFilters)}
              aria-label="Toggle filters"
            >
              <Filter className="h-4 w-4" />
            </Button>
          </div>

          {showFilters && (
            <div className="flex flex-wrap gap-3 pt-2 border-t border-border">
              <div className="w-48">
                <Select value={eventType} onValueChange={setEventType}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Event type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All events</SelectItem>
                    <SelectItem value="LOGIN">Login</SelectItem>
                    <SelectItem value="FAILED_LOGIN">Failed Login</SelectItem>
                    <SelectItem value="LOGOUT">Logout</SelectItem>
                    <SelectItem value="PATIENT_CREATE">User Create</SelectItem>
                    <SelectItem value="PATIENT_VIEW">User View</SelectItem>
                    <SelectItem value="PATIENT_UPDATE">User Update</SelectItem>
                    <SelectItem value="RECORD_VIEW">Record View</SelectItem>
                    <SelectItem value="RECORD_CREATE">Record Create</SelectItem>
                    <SelectItem value="BIOMETRIC_ENROLL">Biometric Enroll</SelectItem>
                    <SelectItem value="BIOMETRIC_IDENTIFY">Biometric Identify</SelectItem>
                    <SelectItem value="PERMISSION_CHANGE">Permission Change</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-36">
                <Select value={result} onValueChange={setResult}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Result" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All results</SelectItem>
                    <SelectItem value="SUCCESS">Success</SelectItem>
                    <SelectItem value="FAILURE">Failure</SelectItem>
                    <SelectItem value="DENIED">Denied</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  aria-label="From date"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  aria-label="To date"
                />
              </div>
              {hasFilters && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                  Clear
                </button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Log table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4">
              <SkeletonTable rows={10} cols={5} />
            </div>
          ) : isError ? (
            <div className="p-8 text-center text-sm text-destructive">
              Failed to load audit logs.
            </div>
          ) : !data?.data?.length ? (
            <div className="p-12 text-center space-y-2">
              <Shield className="mx-auto h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No log entries match your criteria.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/20">
                      <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Timestamp
                      </th>
                      <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Event
                      </th>
                      <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">
                        User
                      </th>
                      <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden lg:table-cell">
                        Resource
                      </th>
                      <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden lg:table-cell">
                        IP
                      </th>
                      <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Result
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.data.map((log) => {
                      const EventIcon = eventIcons[log.eventType] ?? Shield;
                      return (
                        <tr
                          key={log.id}
                          className={cn(
                            'hover:bg-accent/30 transition-colors',
                            log.result === 'DENIED' && 'bg-amber-50/50 dark:bg-amber-900/5',
                            log.result === 'FAILURE' && 'bg-red-50/50 dark:bg-red-900/5',
                          )}
                        >
                          <td className="py-2.5 px-4 text-xs text-muted-foreground whitespace-nowrap">
                            <time dateTime={log.createdAt}>
                              {new Date(log.createdAt).toLocaleString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              })}
                            </time>
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="flex items-center gap-2">
                              <EventIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                              <div>
                                <p className="font-medium text-xs">{log.eventType}</p>
                                {log.action && (
                                  <p className="text-xs text-muted-foreground">{log.action}</p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-4 hidden md:table-cell">
                            {log.userEmail ? (
                              <div>
                                <p className="text-xs font-medium">{log.userEmail}</p>
                                {log.userRole && (
                                  <p className="text-xs text-muted-foreground capitalize">
                                    {log.userRole.toLowerCase().replace('_', ' ')}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 hidden lg:table-cell">
                            {log.resourceType ? (
                              <div>
                                <p className="text-xs font-medium">{log.resourceType}</p>
                                {log.resourceId && (
                                  <p className="text-xs text-muted-foreground font-mono truncate max-w-[120px]">
                                    {log.resourceId}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 hidden lg:table-cell">
                            <span className="text-xs font-mono text-muted-foreground">
                              {log.ipAddress ?? '—'}
                            </span>
                          </td>
                          <td className="py-2.5 px-4">
                            <ResultBadge result={log.result} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {data.totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                  <p className="text-xs text-muted-foreground">
                    {data.total.toLocaleString()} total entries
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      aria-label="Previous page"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {page} / {data.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                      disabled={page === data.totalPages}
                      aria-label="Next page"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


